import { useToastState } from '../hooks/useToast';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import type { ToastType } from '../hooks/useToast';

const ICON_MAP: Record<ToastType, { icon: typeof CheckCircle2; bg: string; text: string; border: string }> = {
  success: { icon: CheckCircle2, bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  error: { icon: XCircle, bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  info: { icon: Info, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
};

export default function ToastContainer() {
  const toasts = useToastState(s => s.toasts);
  const removeToast = useToastState(s => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(t => {
        const style = ICON_MAP[t.type];
        const Icon = style.icon;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-lg border shadow-lg ${style.bg} ${style.border} animate-slide-in-right`}
          >
            <Icon size={18} className={style.text + ' mt-0.5 shrink-0'} />
            <span className={`text-sm font-medium flex-1 ${style.text}`}>{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className={`p-0.5 hover:opacity-70 transition-opacity ${style.text}`}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
