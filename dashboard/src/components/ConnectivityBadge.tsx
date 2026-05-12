import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected';

interface Props {
  state: ConnectionState;
  reconnectAttempt?: number;
}

const STATE_MAP: Record<ConnectionState, { icon: typeof Wifi; color: string; bg: string; label: string }> = {
  connected: { icon: Wifi, color: 'text-green-500', bg: 'bg-green-50', label: '已连接' },
  connecting: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50', label: '连接中...' },
  disconnected: { icon: WifiOff, color: 'text-red-500', bg: 'bg-red-50', label: '已断开' },
};

export default function ConnectivityBadge({ state, reconnectAttempt }: Props) {
  const info = STATE_MAP[state];
  const Icon = info.icon;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${info.bg} ${info.color}`}>
      <Icon size={12} />
      <span>{info.label}</span>
      {state === 'disconnected' && reconnectAttempt !== undefined && reconnectAttempt > 0 && (
        <span className="text-red-400">(重试 #{reconnectAttempt})</span>
      )}
    </div>
  );
}
