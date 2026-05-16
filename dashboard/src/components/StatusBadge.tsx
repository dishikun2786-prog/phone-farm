import { STATUS, type StatusVariant } from '../lib/colors';

interface StatusBadgeProps {
  variant: StatusVariant;
  label?: string;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ variant, label, size = 'sm' }: StatusBadgeProps) {
  const style = STATUS[variant];
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
