import { useState, useEffect } from 'react';
import PageWrapper from '../../components/PageWrapper';
import FeatureFlagToggle from '../../components/FeatureFlagToggle';
import { useStore } from '../../store';

const CATEGORY_TABS = [
  { key: null, label: '全部' },
  { key: 'ai', label: 'AI 模型' },
  { key: 'decision', label: '决策引擎' },
  { key: 'infrastructure', label: '基础设施' },
  { key: 'feature_flags', label: '功能开关' },
  { key: 'experimental', label: '实验性' },
];

export default function FeatureFlagsPage() {
  const featureFlags = useStore(s => s.featureFlags);
  const flagsLoading = useStore(s => s.featureFlagsLoading);
  const flagsError = useStore(s => s.featureFlagsError);
  const loadFeatureFlags = useStore(s => s.loadFeatureFlags);
  const toggleFeatureFlag = useStore(s => s.toggleFeatureFlag);

  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  useEffect(() => { loadFeatureFlags(); }, []);

  const flags = featureFlags ? Object.entries(featureFlags) : [];

  const filtered = selectedCat
    ? flags.filter(([, f]) => f.categoryKey === selectedCat)
    : flags;

  const grouped = new Map<string, typeof flags>();
  for (const [key, flag] of filtered) {
    const cat = flag.categoryKey || 'other';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push([key, flag]);
  }

  return (
    <PageWrapper loading={flagsLoading} error={flagsError} empty={flags.length === 0 && !flagsLoading} emptyTitle="暂无功能开关" emptyDescription="系统尚未定义任何功能开关">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">功能开关管理</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            动态控制系统功能模块的启用与关闭，修改即时生效
          </p>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {CATEGORY_TABS.map(tab => {
            const count = tab.key
              ? flags.filter(([, f]) => f.categoryKey === tab.key).length
              : flags.length;
            return (
              <button
                key={tab.label}
                onClick={() => setSelectedCat(selectedCat === tab.key ? null : tab.key)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  selectedCat === tab.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Flags by Category */}
        {Array.from(grouped.entries()).map(([cat, items]) => (
          <div key={cat}>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3 capitalize">
              {cat.replace(/_/g, ' ')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(([key, flag]) => (
                <FeatureFlagToggle
                  key={key}
                  flagKey={key}
                  displayName={flag.displayName || key}
                  enabled={flag.enabled}
                  source={flag.source}
                  categoryKey={flag.categoryKey}
                  readOnly={flag.source === 'env'}
                  onToggle={toggleFeatureFlag}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageWrapper>
  );
}
