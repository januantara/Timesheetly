import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error';
  message: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lg max-w-md"
    >
      {toast.type === 'success' ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
      )}
      <span className="text-sm font-medium text-slate-800">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
        aria-label="Tutup notifikasi"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
