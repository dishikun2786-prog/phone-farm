import { Wifi, WifiOff, Play, CheckCircle2, XCircle, Clock, Pause } from 'lucide-react';

type StatusVariant = 'online' | 'offline' | 'busy' | 'running' | 'completed' | 'failed' | 'pending' | 'stopped' | 'error';

interface StatusBadgeProps {
  variant: StatusVariant;
  label?: string;
  size?: 'sm' | 'md';
}

const STYLES: Record<StatusVariant, { bg: string; text: string; icon: React.ComponentType<{ size?: number }>; defaultLabel: string }> = {
  online: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', icon: Wifi, defaultLabel: '在线' },
  offline: { bg: 'bg-gray-100 dark:bg-slate-700', text: 'text-gray-500 dark:text-slate-400', icon: WifiOff, defaultLabel: '离线' },
  busy: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', icon: Play, defaultLabel: '执行中' },
  running: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', icon: Play, defaultLabel: '运行中' },
  completed: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', icon: CheckCircle2, defaultLabel: '已完成' },
  failed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', icon: XCircle, defaultLabel: '失败' },
  pending: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', icon: Clock, defaultLabel: '待处理' },
  stopped: { bg: 'bg-gray-100 dark:bg-slate-700', text: 'text-gray-600 dark:text-slate-400', icon: Pause, defaultLabel: '已停止' },
  error: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', icon: XCircle, defaultLabel: '错误' },
};

export default function StatusBadge({ variant, label, size = 'sm' }: StatusBadgeProps) {
  const style = STYLES[variant];
  const Icon = style.icon;
  const text = label || style.defaultLabel;
  const sizeCls = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeCls} ${style.bg} ${style.text}`}>
      <Icon size={size === 'sm' ? 10 : 12} />
      {text}
    </span>
  );
}
