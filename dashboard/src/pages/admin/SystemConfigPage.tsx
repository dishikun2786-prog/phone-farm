import { useState, useEffect, useCallback } from 'react';
import PageWrapper from '../../components/PageWrapper';
import ConfigDiffViewer from '../../components/ConfigDiffViewer';
import { useStore } from '../../store';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import {
  Search, RefreshCw, Edit3, X, Check, Eye, EyeOff, Sliders, Save, RotateCcw,
} from 'lucide-react';

const CATEGORY_KEYS = [
  'infrastructure', 'decision', 'ai', 'vlm', 'relay', 'bridge',
  'storage', 'webhook', 'alert', 'task', 'scrcpy', 'remote',
  'system', 'memory',
];

const CATEGORY_LABELS: Record<string, string> = {
  infrastructure: '基础设施',
  decision: '决策引擎',
  ai: 'AI 模型',
  vlm: 'VLM',
  relay: '中继服务',
  bridge: '桥接',
  storage: '存储',
  webhook: 'Webhook',
  alert: '告警',
  task: '任务',
  scrcpy: '投屏',
  remote: '远程命令',
  system: '系统',
  memory: '内存',
};

export default function SystemConfigPage() {
  const systemConfig = useStore(s => s.systemConfig);
  const loadSystemConfig = useStore(s => s.loadSystemConfig);
  const updateSystemConfig = useStore(s => s.updateSystemConfig);
  const loading = useStore(s => s.systemConfigLoading);
  const error = useStore(s => s.systemConfigError);

  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());

  useEffect(() => { loadSystemConfig(); }, []);

  const entries = systemConfig ? Object.values(systemConfig) : [];

  const filtered = entries.filter(e => {
    if (selectedCat && e.categoryKey !== selectedCat) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.key.toLowerCase().includes(q) || e.displayName.toLowerCase().includes(q);
    }
    return true;
  });

  const grouped = new Map<string, typeof entries>();
  for (const e of filtered) {
    const cat = e.categoryKey || 'uncategorized';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(e);
  }

  const toggleSecret = (key: string) => {
    setVisibleSecrets(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const startEdit = (e: typeof entries[number]) => {
    setEditingKey(e.key);
    setEditValue(e.isSecret && !visibleSecrets.has(e.key) ? '' : e.value);
    setEditReason('');
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue('');
    setEditReason('');
    setSaving(false);
  };

  const saveEdit = async () => {
    if (!editingKey) return;
    setSaving(true);
    try {
      await updateSystemConfig(editingKey, editValue, editReason || undefined);
      cancelEdit();
    } catch {
      setSaving(false);
    }
  };

  const handleReload = async () => {
    try {
      await api.systemReloadConfig();
      toast('success', '配置已从数据库重新加载');
      await loadSystemConfig();
    } catch (err: any) {
      toast('error', err.message || '热重载失败');
    }
  };

  const renderValue = (e: typeof entries[number]) => {
    if (e.isSecret && !visibleSecrets.has(e.key)) {
      return '********';
    }
    if (e.valueType === 'boolean') {
      return (
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${e.value === 'true' || e.value === '1' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
          {e.value === 'true' || e.value === '1' ? 'ON' : 'OFF'}
        </span>
      );
    }
    if (e.value.length > 60) return `${e.value.slice(0, 60)}...`;
    return e.value || '(空)';
  };

  return (
    <PageWrapper loading={loading} error={error}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">系统配置管理</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              管理所有运行时配置项，修改即时生效
            </p>
          </div>
          <button
            onClick={handleReload}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors active:scale-95"
          >
            <RotateCcw size={16} />
            热重载配置
          </button>
        </div>

        {/* Search + Category Tabs */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索配置键或名称..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setSelectedCat(null)}
              className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!selectedCat ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
            >
              全部
            </button>
            {CATEGORY_KEYS.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCat(selectedCat === cat ? null : cat)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${selectedCat === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
              >
                {CATEGORY_LABELS[cat] || cat}
              </button>
            ))}
          </div>
        </div>

        {/* Config List by Category */}
        {Array.from(grouped.entries()).map(([cat, items]) => (
          <div key={cat}>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <Sliders size={14} className="text-gray-400" />
              {CATEGORY_LABELS[cat] || cat}
              <span className="text-xs text-gray-400 font-normal">({items.length})</span>
            </h2>
            <div className="space-y-2">
              {items.map(e => (
                <div
                  key={e.key}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-slate-100">{e.displayName}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          e.source === 'db' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' :
                          e.source === 'env' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
                          'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}>
                          {e.source === 'db' ? 'DB覆盖' : e.source === 'env' ? '环境变量' : '默认值'}
                        </span>
                        {e.isSecret && (
                          <button onClick={() => toggleSecret(e.key)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                            {visibleSecrets.has(e.key) ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-slate-500 font-mono">{e.key}</p>
                      {e.description && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{e.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {editingKey === e.key ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editValue}
                            onChange={ev => setEditValue(ev.target.value)}
                            className="w-40 px-2 py-1 border border-gray-200 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          />
                          <input
                            type="text"
                            value={editReason}
                            onChange={ev => setEditReason(ev.target.value)}
                            placeholder="变更原因"
                            className="w-32 px-2 py-1 border border-gray-200 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button onClick={saveEdit} disabled={saving} className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded">
                            <Check size={16} />
                          </button>
                          <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="text-right">
                            <div className="text-sm font-medium text-gray-900 dark:text-slate-100">
                              {renderValue(e)}
                            </div>
                          </div>
                          <button
                            onClick={() => startEdit(e)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            title="编辑"
                          >
                            <Edit3 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {filtered.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-400 dark:text-slate-500">
            {search ? '没有匹配的配置项' : '暂无配置数据'}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
