import { AlertTriangle, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_STYLES = {
  danger: {
    icon: 'text-red-500',
    bg: 'bg-red-600 hover:bg-red-700',
    ring: 'focus:ring-red-500',
  },
  warning: {
    icon: 'text-amber-500',
    bg: 'bg-amber-600 hover:bg-amber-700',
    ring: 'focus:ring-amber-500',
  },
  default: {
    icon: 'text-blue-500',
    bg: 'bg-blue-600 hover:bg-blue-700',
    ring: 'focus:ring-blue-500',
  },
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const style = VARIANT_STYLES[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={20} className={style.icon} />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="text-sm text-gray-600 mb-6">{message}</div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 ${style.bg} text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors inline-flex items-center gap-1.5`}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
