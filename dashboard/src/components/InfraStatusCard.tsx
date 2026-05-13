import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface InfraStatusCardProps {
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  connected: boolean;
  info: Record<string, any>;
  className?: string;
}

export default function InfraStatusCard({ name, icon: Icon, connected, info, className = '' }: InfraStatusCardProps) {
  const [expanded, setExpanded] = useState(false);

  const infoEntries = Object.entries(info).filter(([, v]) => v !== undefined && v !== null);

  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 hover:shadow-md transition-all duration-200 cursor-pointer ${className}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <Icon size={18} className="text-gray-400 dark:text-slate-500" />
          <span className="text-sm font-medium text-gray-900 dark:text-slate-100">{name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          {infoEntries.length > 0 && (
            <span className="text-gray-400 dark:text-slate-500">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          )}
        </div>
      </div>
      <div className="space-y-0.5 mb-1">
        <p className={`text-xs font-medium ${connected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {connected ? '已连接' : '未连接'}
        </p>
      </div>
      {expanded && infoEntries.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700 space-y-1.5 animate-fade-in">
          {infoEntries.map(([key, value]) => (
            <div key={key} className="flex justify-between text-xs">
              <span className="text-gray-500 dark:text-slate-400 capitalize">{key.replace(/_/g, ' ')}</span>
              <span className="text-gray-900 dark:text-slate-300 font-medium">
                {typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
