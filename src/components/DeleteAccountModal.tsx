import { AlertTriangle, Trash2, X } from 'lucide-react';

interface DeleteAccountModalProps {
  open: boolean;
  accountName: string;
  activityCount: number;
  exportCount: number;
  isActiveAccount: boolean;
  isDeleting?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}

export function DeleteAccountModal({
  open,
  accountName,
  activityCount,
  exportCount,
  isActiveAccount,
  isDeleting = false,
  onCancel,
  onConfirm,
}: DeleteAccountModalProps) {
  if (!open || !accountName) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-red-50 border border-red-100 text-red-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <h2
                id="delete-account-modal-title"
                className="font-display text-base font-bold text-slate-900 truncate"
              >
                Konfirmasi Hapus Akun
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Tindakan ini tidak dapat dibatalkan
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
            aria-label="Tutup dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3.5 text-sm text-slate-600">
          <p className="leading-relaxed">
            Apakah Anda yakin ingin menghapus akun{' '}
            <span className="font-semibold text-slate-900">"{accountName}"</span>?
          </p>

          <div className="rounded-xl border border-red-200 bg-red-50/70 p-3 text-xs text-red-800 space-y-1">
            <div className="font-semibold">Data yang akan dihapus permanen:</div>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Profil akun "{accountName}" dari daftar tersimpan</li>
              <li>
                {activityCount} data aktivitas timesheet milik akun ini
              </li>
              <li>
                {exportCount} riwayat pratinjau/ekspor milik akun ini
              </li>
            </ul>
            {isActiveAccount && (
              <p className="pt-1 font-medium text-red-900">
                Karena ini adalah akun yang sedang aktif, Anda akan keluar ke halaman masuk setelah akun dihapus.
              </p>
            )}
          </div>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{isDeleting ? 'Menghapus...' : 'Ya, Hapus Akun'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
