import { useState } from 'react';
import { Lock } from 'lucide-react';

interface FeatureFlagToggleProps {
  flagKey: string;
  displayName: string;
  description?: string;
  enabled: boolean;
  source: string;
  categoryKey?: string;
  readOnly?: boolean;
  onToggle: (key: string, enabled: boolean) => Promise<void>;
}

const CATEGORY_LABELS: Record<string, string> = {
  ai: 'AI 模型',
  decision: '决策引擎',
  infrastructure: '基础设施',
  feature_flags: '功能开关',
  experimental: '实验性',
  vlm: 'VLM',
  streaming: '流媒体',
  memory: '跨设备记忆',
  relay: '中继服务',
};

export default function FeatureFlagToggle({
  flagKey,
  displayName,
  description,
  enabled,
  source,
  categoryKey,
  readOnly = false,
  onToggle,
}: FeatureFlagToggleProps) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    if (readOnly || toggling) return;
    setToggling(true);
    try {
      await onToggle(flagKey, !enabled);
    } finally {
      setToggling(false);
    }
  };

  const catLabel = categoryKey ? CATEGORY_LABELS[categoryKey] || categoryKey : null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 hover:shadow-md transition-all duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{displayName}</span>
            {catLabel && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                {catLabel}
              </span>
            )}
            {readOnly && (
              <Lock size={12} className="text-gray-400 dark:text-slate-500 shrink-0" title="此开关由环境变量控制，不可在此修改" />
            )}
          </div>
          {description && (
            <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2">{description}</p>
          )}
          <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
            来源: {source === 'db' ? '数据库覆盖' : source === 'env' ? '环境变量' : '默认值'}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={readOnly || toggling}
          className={`relative shrink-0 w-10 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 ${
            enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'
          } ${readOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          role="switch"
          aria-checked={enabled}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
              enabled ? 'translate-x-4' : 'translate-x-0'
            } ${toggling ? 'animate-pulse' : ''}`}
          />
        </button>
      </div>
    </div>
  );
}
