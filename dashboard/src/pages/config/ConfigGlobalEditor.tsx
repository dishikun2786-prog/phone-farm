/**
 * ConfigGlobalEditor — edit global/default configuration values.
 *
 * Organized by category tabs. Each config item shows its definition,
 * current value (with scope badge), and an editable field.
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import ConfigField from '../../components/ConfigField';
import ConfigScopeBadge from '../../components/ConfigScopeBadge';
import type { ConfigDefinition } from '../../components/ConfigField';
import { getCategoryIcon } from '../../components/ConfigField';
import { Save, RotateCcw, Search } from 'lucide-react';

interface ResolvedConfig {
  key: string;
  displayName: string;
  value: string;
  valueType: string;
  source: 'default' | 'global' | 'plan' | 'template' | 'group' | 'device';
  sourceId?: string;
  isSecret: boolean;
  categoryKey: string;
  categoryDisplayName: string;
}

interface Category {
  id: string;
  key: string;
  displayName: string;
  icon: string;
}

interface EditState {
  [key: string]: { value: string; saving: boolean; error?: string };
}

export default function ConfigGlobalEditor() {
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get('category') || '';

  const [categories, setCategories] = useState<Category[]>([]);
  const [configs, setConfigs] = useState<ResolvedConfig[]>([]);
  const [definitions, setDefinitions] = useState<ConfigDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState<EditState>({});

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [catRes, resolveRes, defRes] = await Promise.all([
        api.configGetCategories() as Promise<{ categories: Category[] }>,
        api.configResolve() as Promise<{ configs: ResolvedConfig[] }>,
        api.configGetDefinitions() as Promise<{ definitions: ConfigDefinition[] }>,
      ]);
      setCategories(catRes.categories || []);
      setConfigs(resolveRes.configs || []);
      setDefinitions(defRes.definitions || []);

      if (!activeCategory && catRes.categories?.length > 0) {
        setActiveCategory(initialCategory || catRes.categories[0].key);
      }
    } catch {
      toast('error', '加载配置失败');
    } finally {
      setLoading(false);
    }
  }

  function getDef(key: string): ConfigDefinition | undefined {
    return definitions.find((d) => d.key === key);
  }

  function handleEdit(key: string, value: string) {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], value, saving: false } }));
  }

  async function handleSave(key: string) {
    const edit = edits[key];
    if (!edit) return;

    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], saving: true, error: undefined } }));

    try {
      await api.configUpdateValue({
        definitionKey: key,
        scope: 'global',
        value: edit.value,
        changeReason: 'Dashboard 手动修改',
      });
      toast('success', `${key} 已更新`);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      // Refresh
      const resolveRes = await api.configResolve() as { configs: ResolvedConfig[] };
      setConfigs(resolveRes.configs || []);
    } catch (err: any) {
      setEdits((prev) => ({
        ...prev,
        [key]: { ...prev[key], saving: false, error: err.message || '保存失败' },
      }));
    }
  }

  function handleReset(key: string) {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const filteredConfigs = configs.filter((c) => {
    if (c.categoryKey !== activeCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.key.toLowerCase().includes(q) ||
        c.displayName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const catConfigs = configs.filter((c) => c.categoryKey === activeCategory);
  const overriddenCount = catConfigs.filter((c) => c.source !== 'default').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">全局配置编辑器</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          修改全局默认值，影响所有未单独覆盖的设备
        </p>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map((cat) => {
          const Icon = getCategoryIcon(cat.icon);
          const count = configs.filter((c) => c.categoryKey === cat.key).length;
          const isActive = cat.key === activeCategory;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
              }`}
            >
              <Icon size={14} />
              {cat.displayName}
              <span className="opacity-50">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
        <span>{catConfigs.length} 个配置项</span>
        <span className="text-blue-600">{overriddenCount} 个已覆盖</span>
        <span className="text-gray-400 dark:text-slate-500">{catConfigs.length - overriddenCount} 个使用默认值</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索配置项..."
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100"
        />
      </div>

      {/* Config list */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
        {filteredConfigs.length === 0 && (
          <div className="px-5 py-10 text-center text-gray-400 dark:text-slate-500 text-sm">
            暂无配置项
          </div>
        )}
        {filteredConfigs.map((cfg) => {
          const def = getDef(cfg.key);
          const edit = edits[cfg.key];
          const currentValue = edit ? edit.value : cfg.value;

          return (
            <div key={cfg.key} className="px-5 py-4 hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-slate-100">{cfg.displayName}</span>
                    <ConfigScopeBadge scope={cfg.source} sourceId={cfg.sourceId} />
                    {cfg.isSecret && (
                      <span className="text-[10px] bg-red-100 text-red-600 rounded px-1.5 py-0.5">加密</span>
                    )}
                    <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono">{cfg.key}</span>
                  </div>
                  {def?.description && (
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{def.description}</p>
                  )}
                  <div className="mt-2 max-w-md">
                    <ConfigField
                      definition={def || {
                        id: '', categoryId: '', key: cfg.key, displayName: cfg.displayName,
                        valueType: cfg.valueType as any, isSecret: cfg.isSecret,
                        isOverridable: true, allowedScopes: [], tags: [], sortOrder: 0,
                      }}
                      value={currentValue}
                      onChange={(val) => handleEdit(cfg.key, val)}
                      disabled={edit?.saving}
                      error={edit?.error}
                    />
                  </div>
                </div>

                {/* Save/reset buttons */}
                {edit && (
                  <div className="flex items-center gap-1 pt-5">
                    <button
                      onClick={() => handleSave(cfg.key)}
                      disabled={edit.saving}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Save size={12} />
                      {edit.saving ? '保存中...' : '保存'}
                    </button>
                    <button
                      onClick={() => handleReset(cfg.key)}
                      className="p-1.5 text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
                    >
                      <RotateCcw size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
