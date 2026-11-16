import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  FileUp,
  Upload,
  X,
} from 'lucide-react';
import {
  buildActivityExtractionPrompt,
  parseImportedActivitiesText,
} from '../lib/activityImport';
import {
  formatDateByPattern,
  formatDurationHHMM,
  formatTimeRangeByPattern,
  getIndonesianDayName,
} from '../lib/formatters';
import type {
  ActivityEntry,
  ActivityFilterState,
  DateDisplayFormat,
  TimeDisplayFormat,
} from '../types';

interface ImportActivitiesModalProps {
  open: boolean;
  onClose: () => void;
  activeAccountName: string;
  filter: ActivityFilterState;
  savedCustomKeys: string[];
  dateFormat: DateDisplayFormat;
  timeFormat: TimeDisplayFormat;
  onImportEntries: (entries: ActivityEntry[]) => Promise<boolean>;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export function ImportActivitiesModal({
  open,
  onClose,
  activeAccountName,
  filter,
  savedCustomKeys,
  dateFormat,
  timeFormat,
  onImportEntries,
  onNotify,
}: ImportActivitiesModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rawInput, setRawInput] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [importing, setImporting] = useState(false);

  const parsedPreview = useMemo(() => {
    if (!rawInput.trim()) {
      return { ok: false as const, error: '', entries: [] as ActivityEntry[], warnings: [] as string[], skippedCount: 0 };
    }
    try {
      const res = parseImportedActivitiesText(rawInput, activeAccountName);
      return {
        ok: true as const,
        error: '',
        entries: res.entries,
        warnings: res.warnings,
        skippedCount: res.skippedCount,
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Gagal membaca format JSON.',
        entries: [] as ActivityEntry[],
        warnings: [] as string[],
        skippedCount: 0,
      };
    }
  }, [rawInput, activeAccountName]);

  if (!open) return null;

  const handleCopyPrompt = async () => {
    const promptText = buildActivityExtractionPrompt({
      accountName: activeAccountName,
      filter,
      savedCustomKeys,
    });
    try {
      await navigator.clipboard.writeText(promptText);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = promptText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setPromptCopied(true);
    onNotify('success', 'Prompt ekstraksi folder project disalin ke clipboard.');
    setTimeout(() => setPromptCopied(false), 2000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setRawInput(text);
    } catch {
      onNotify('error', 'Gagal membaca file yang dipilih.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedPreview.ok || parsedPreview.entries.length === 0) return;
    setImporting(true);
    try {
      const shouldClose = await onImportEntries(parsedPreview.entries);
      if (shouldClose) {
        setRawInput('');
        onClose();
      }
    } catch {
      onNotify('error', 'Gagal menyimpan aktivitas impor ke IndexedDB.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-activities-title"
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2
              id="import-activities-title"
              className="font-display text-base font-semibold text-slate-900"
            >
              Impor Aktivitas dari Output Prompt / JSON
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tempel hasil JSON dari prompt root folder project atau unggah file `.json`
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Prompt helper bar */}
          <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-blue-900 leading-relaxed max-w-lg">
              Jalankan prompt di root folder project Anda, lalu tempelkan seluruh output JSON-nya ke kolom di bawah ini.
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-white text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors whitespace-nowrap"
              >
                {promptCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{promptCopied ? 'Prompt Disalin' : 'Copy Prompt'}</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <FileUp className="h-3.5 w-3.5 text-slate-500" />
                <span>Pilih File JSON</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.txt,application/json,text/plain"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Paste JSON textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="import-json-textarea"
                className="block text-xs font-semibold text-slate-700"
              >
                Output JSON Prompt
              </label>
              {rawInput.trim() && (
                <button
                  type="button"
                  onClick={() => setRawInput('')}
                  className="text-[11px] font-medium text-slate-500 hover:text-slate-800"
                >
                  Bersihkan
                </button>
              )}
            </div>
            <textarea
              id="import-json-textarea"
              rows={7}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={`Tempel output JSON dari prompt di sini...\n{\n  "activities": [\n    {\n      "date": "2026-11-15",\n      "activity": "• Mengerjakan fitur X"\n    }\n  ]\n}`}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 font-mono text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          {/* Error state */}
          {rawInput.trim() && !parsedPreview.ok && parsedPreview.error && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{parsedPreview.error}</span>
            </div>
          )}

          {/* Warnings if some rows were skipped */}
          {parsedPreview.ok && parsedPreview.warnings.length > 0 && (
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800 space-y-1">
              <div className="font-semibold">
                {parsedPreview.skippedCount} baris dilewati karena tidak lengkap:
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                {parsedPreview.warnings.slice(0, 4).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Live Preview Table */}
          {parsedPreview.ok && parsedPreview.entries.length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  Pratinjau Data Siap Impor ({parsedPreview.entries.length} aktivitas)
                </span>
                <span className="text-[11px] text-slate-500">
                  Masuk ke akun: <span className="font-medium text-slate-700">{activeAccountName}</span>
                </span>
              </div>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 sticky top-0">
                    <tr>
                      <th className="py-2 px-3 font-semibold whitespace-nowrap">Tanggal</th>
                      <th className="py-2 px-3 font-semibold whitespace-nowrap">Hari</th>
                      <th className="py-2 px-3 font-semibold whitespace-nowrap">Jam</th>
                      <th className="py-2 px-3 font-semibold whitespace-nowrap">Durasi</th>
                      <th className="py-2 px-3 font-semibold whitespace-nowrap">Project &amp; Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedPreview.entries.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/60">
                        <td className="py-2 px-3 align-top font-mono tabular-nums whitespace-nowrap text-slate-900">
                          {formatDateByPattern(item.date, dateFormat)}
                        </td>
                        <td className="py-2 px-3 align-top whitespace-nowrap text-slate-600">
                          {getIndonesianDayName(item.date)}
                        </td>
                        <td className="py-2 px-3 align-top font-mono tabular-nums whitespace-nowrap text-slate-600">
                          {item.startTime || item.endTime
                            ? formatTimeRangeByPattern(item.startTime, item.endTime, timeFormat)
                            : ''}
                        </td>
                        <td className="py-2 px-3 align-top font-mono tabular-nums whitespace-nowrap text-slate-700">
                          {item.startTime && item.endTime
                            ? formatDurationHHMM(item.durationMinutes)
                            : ''}
                        </td>
                        <td className="py-2 px-3 align-top text-slate-800">
                          {item.project && (
                            <div className="font-semibold text-slate-900 mb-0.5">
                              {item.project}
                              {item.category ? ` (${item.category})` : ''}
                            </div>
                          )}
                          <div className="whitespace-pre-wrap break-words text-slate-700">
                            {item.activity}
                          </div>
                          {item.status && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Aplikasi Berdampak: {item.status}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={!parsedPreview.ok || parsedPreview.entries.length === 0 || importing}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-40"
          >
            <Upload className="h-4 w-4" />
            <span>
              {importing
                ? 'Mengimpor...'
                : parsedPreview.ok && parsedPreview.entries.length > 0
                ? `Impor ${parsedPreview.entries.length} Aktivitas`
                : 'Impor Aktivitas'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
