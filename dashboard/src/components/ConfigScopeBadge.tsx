/**
 * ConfigScopeBadge — visual indicator for config value scope.
 *
 * Colors:
 *   device  → green  (highest priority)
 *   group   → teal
 *   template → indigo
 *   plan    → purple
 *   global  → blue
 *   default → gray   (fallback to definition default)
 */
import { Layers, Globe, Package, Users, Smartphone, Settings } from 'lucide-react';

interface Props {
  scope: 'default' | 'global' | 'plan' | 'template' | 'group' | 'device';
  sourceId?: string;
  size?: 'sm' | 'md';
}

const SCOPE_CONFIG: Record<string, { label: string; color: string; icon: typeof Globe }> = {
  device:   { label: '设备',   color: 'bg-green-100 text-green-700 border-green-200',   icon: Smartphone },
  group:    { label: '分组',   color: 'bg-teal-100 text-teal-700 border-teal-200',       icon: Layers },
  template: { label: '模板',   color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: Package },
  plan:     { label: '套餐',   color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Users },
  global:   { label: '全局',   color: 'bg-blue-100 text-blue-700 border-blue-200',       icon: Globe },
  default:  { label: '默认值', color: 'bg-gray-100 text-gray-500 border-gray-200',       icon: Settings },
};

export default function ConfigScopeBadge({ scope, sourceId, size = 'sm' }: Props) {
  const config = SCOPE_CONFIG[scope] || SCOPE_CONFIG.default;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${
        size === 'sm' ? 'text-[10px]' : 'text-xs'
      } ${config.color}`}
      title={sourceId ? `${config.label}: ${sourceId}` : config.label}
    >
      <Icon size={size === 'sm' ? 10 : 12} />
      {config.label}
      {sourceId && (
        <span className="font-mono opacity-60 max-w-[80px] truncate">
          {sourceId.substring(0, 8)}
        </span>
      )}
    </span>
  );
}
