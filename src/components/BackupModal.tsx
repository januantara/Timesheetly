import { useRef, useState } from 'react';
import { Download, RotateCcw, Upload, X } from 'lucide-react';
import { useLanguage } from '../lib/i18n';
import type {
  ActivityEntry,
  AppSettings,
  BackupPayload,
  SavedExportReport,
  VendorProfile,
} from '../types';

interface BackupModalProps {
  open: boolean;
  onClose: () => void;
  activities: ActivityEntry[];
  vendorProfiles: VendorProfile[];
  savedExports: SavedExportReport[];
  settings: AppSettings;
  onRestoreBackup: (payload: BackupPayload) => Promise<void>;
  onResetSample: () => Promise<void>;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export function BackupModal({
  open,
  onClose,
  activities,
  vendorProfiles,
  savedExports,
  settings,
  onRestoreBackup,
  onResetSample,
  onNotify,
}: BackupModalProps) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleExportJson = () => {
    const payload: BackupPayload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      activities,
      vendorProfiles,
      savedExports,
      settings,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timesheetly-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onNotify('success', t('JSON backup file downloaded.', 'File cadangan JSON diunduh.'));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;
      if (!parsed || (!Array.isArray(parsed.activities) && !Array.isArray(parsed.vendorProfiles))) {
        throw new Error(t('Invalid backup file format.', 'Format file cadangan tidak valid.'));
      }
      await onRestoreBackup(parsed);
      onNotify('success', t('Data restored successfully.', 'Data berhasil dipulihkan.'));
      onClose();
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error
          ? err.message
          : t('Failed to read JSON backup file.', 'Gagal membaca file cadangan JSON.')
      );
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReset = async () => {
    setBusy(true);
    try {
      await onResetSample();
      setConfirmReset(false);
      onNotify(
        'success',
        t('Application data has been reset to defaults.', 'Data aplikasi direset ke bawaan awal.')
      );
      onClose();
    } catch {
      onNotify('error', t('Failed to reset data.', 'Gagal mereset data.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-modal-title"
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 id="backup-modal-title" className="font-display text-base font-semibold text-slate-900">
            {t('Data & Backup', 'Data & Cadangan')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label={t('Close', 'Tutup')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-xs text-slate-500">{t('Activities', 'Aktivitas')}</div>
              <div className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                {activities.length}
              </div>
            </div>
            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-xs text-slate-500">
                {t('Vendor Templates', 'Template Vendor')}
              </div>
              <div className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                {vendorProfiles.length}
              </div>
            </div>
            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-xs text-slate-500">
                {t('Saved Exports', 'Riwayat Ekspor')}
              </div>
              <div className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                {savedExports.length}
              </div>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            {t(
              'All activities, vendor templates, and saved exports are stored locally in this browser. Download a JSON file to transfer or back up your data to another device.',
              'Semua aktivitas, template vendor, dan riwayat ekspor disimpan secara lokal di browser ini. Unduh file JSON untuk memindahkan atau mencadangkan data ke perangkat lain.'
            )}
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExportJson}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              <span>{t('Download Backup (.json)', 'Unduh Cadangan (.json)')}</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Upload className="h-4 w-4" />
              <span>{t('Restore from JSON', 'Pulihkan dari JSON')}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <div className="pt-4 border-t border-slate-200">
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{t('Reset data to initial defaults', 'Reset data ke bawaan awal')}</span>
              </button>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-red-200 bg-red-50">
                <span className="text-xs font-medium text-red-800">
                  {t(
                    'All activities, export history, and profiles will be deleted, and vendors will be restored to default templates. Continue?',
                    'Semua aktivitas, riwayat ekspor, dan profil akan dihapus, serta vendor dikembalikan ke template bawaan. Lanjutkan?'
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-2.5 py-1 rounded text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50"
                  >
                    {t('Cancel', 'Batal')}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={busy}
                    className="px-2.5 py-1 rounded text-xs font-medium text-white bg-red-600 hover:bg-red-700"
                  >
                    {t('Yes, Reset Data', 'Ya, Reset Data')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
