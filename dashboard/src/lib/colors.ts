import type { ComponentType } from 'react';
import { Wifi, WifiOff, Play, CheckCircle2, XCircle, Clock, Pause } from 'lucide-react';

/**
 * 语义化状态颜色常量 — StatusBadge、图表、通知等组件共用。
 * CSS 侧通过 index.css @theme 中的 --color-ok-* / --color-err-* / --color-warn-* 保证一致。
 */

export type StatusVariant = 'online' | 'offline' | 'busy' | 'running' | 'completed' | 'failed' | 'pending' | 'stopped' | 'error';

export interface StatusStyle {
  bg: string;
  text: string;
  icon: ComponentType<{ size?: number }>;
  defaultLabel: string;
}

export const STATUS: Record<StatusVariant, StatusStyle> = {
  online:    { bg: 'bg-ok-100 dark:bg-ok-100/30',   text: 'text-ok-700 dark:text-ok-600',   icon: Wifi,          defaultLabel: '在线' },
  offline:   { bg: 'bg-gray-100 dark:bg-slate-700',  text: 'text-gray-500 dark:text-slate-400', icon: WifiOff,   defaultLabel: '离线' },
  busy:      { bg: 'bg-blue-100 dark:bg-blue-900/30',text: 'text-blue-700 dark:text-blue-400',  icon: Play,       defaultLabel: '执行中' },
  running:   { bg: 'bg-blue-100 dark:bg-blue-900/30',text: 'text-blue-700 dark:text-blue-400',  icon: Play,       defaultLabel: '运行中' },
  completed: { bg: 'bg-ok-100 dark:bg-ok-100/30',    text: 'text-ok-700 dark:text-ok-600',     icon: CheckCircle2, defaultLabel: '已完成' },
  failed:    { bg: 'bg-err-100 dark:bg-err-100/30',   text: 'text-err-700 dark:text-err-600',   icon: XCircle,    defaultLabel: '失败' },
  pending:   { bg: 'bg-warn-100 dark:bg-warn-100/30', text: 'text-warn-700 dark:text-warn-600', icon: Clock,      defaultLabel: '待处理' },
  stopped:   { bg: 'bg-gray-100 dark:bg-slate-700',   text: 'text-gray-600 dark:text-slate-400',icon: Pause,      defaultLabel: '已停止' },
  error:     { bg: 'bg-err-100 dark:bg-err-100/30',   text: 'text-err-700 dark:text-err-600',   icon: XCircle,    defaultLabel: '错误' },
};
