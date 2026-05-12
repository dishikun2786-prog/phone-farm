/**
 * ConfigDeviceEditor — per-device configuration override editor.
 *
 * Select a device, then view and override its configuration values.
 * Shows the effective value and lets the user set device-level overrides.
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import ConfigField from '../../components/ConfigField';
import ConfigScopeBadge from '../../components/ConfigScopeBadge';
import type { ConfigDefinition } from '../../components/ConfigField';
import { getCategoryIcon } from '../../components/ConfigField';
import { Search, Save, RotateCcw, Smartphone } from 'lucide-react';

interface Device {
  id: string;
  name: string;
  status: string;
}

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

export default function ConfigDeviceEditor() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [definitions, setDefinitions] = useState<ConfigDefinition[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [configs, setConfigs] = useState<ResolvedConfig[]>([]);
  const [, setLoading] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [activeCategory, setActiveCategory] = useState('');
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState<Record<string, { value: string; saving: boolean }>>({});

  useEffect(() => {
    loadInitial();
  }, []);

  async function loadInitial() {
    try {
      const [devRes, catRes, defRes] = await Promise.all([
        api.getDevices() as Promise<Device[]>,
        api.configGetCategories() as Promise<{ categories: Category[] }>,
        api.configGetDefinitions() as Promise<{ definitions: ConfigDefinition[] }>,
      ]);
      setDevices(devRes || []);
      setCategories(catRes.categories || []);
      setDefinitions(defRes.definitions || []);
      if (catRes.categories?.length > 0) {
        setActiveCategory(catRes.categories[0].key);
      }
    } catch {
      toast('error', '加载初始数据失败');
    } finally {
      setLoading(false);
    }
  }

  async function loadDeviceConfig(deviceId: string) {
    if (!deviceId) return;
    setLoadingConfig(true);
    setEdits({});
    try {
      const res = await api.configResolve({ deviceId }) as { configs: ResolvedConfig[] };
      setConfigs(res.configs || []);
    } catch {
      toast('error', '加载设备配置失败');
    } finally {
      setLoadingConfig(false);
    }
  }

  function handleSelectDevice(deviceId: string) {
    setSelectedDeviceId(deviceId);
    loadDeviceConfig(deviceId);
  }

  function handleEdit(key: string, value: string) {
    setEdits((prev) => ({ ...prev, [key]: { value, saving: false } }));
  }

  async function handleSave(key: string) {
    const edit = edits[key];
    if (!edit || !selectedDeviceId) return;

    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], saving: true } }));

    try {
      await api.configUpdateValue({
        definitionKey: key,
        scope: 'device',
        scopeId: selectedDeviceId,
        value: edit.value,
        changeReason: `设备 ${selectedDeviceId} 配置覆盖`,
      });
      toast('success', `${key} 已更新`);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await loadDeviceConfig(selectedDeviceId);
    } catch (err: any) {
      toast('error', err.message || '保存失败');
      setEdits((prev) => ({ ...prev, [key]: { ...prev[key], saving: false } }));
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
      return c.key.toLowerCase().includes(q) || c.displayName.toLowerCase().includes(q);
    }
    return true;
  });

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);
  const deviceOverrides = configs.filter((c) => c.source === 'device').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">设备配置编辑器</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          为特定设备覆盖配置参数，优先级高于全局/分组/模板配置
        </p>
      </div>

      {/* Device selector */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
        <label className="text-sm font-medium text-gray-700 dark:text-slate-300 block mb-2">选择设备</label>
        <select
          value={selectedDeviceId}
          onChange={(e) => handleSelectDevice(e.target.value)}
          className="w-full max-w-md px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100"
        >
          <option value="">-- 选择设备 --</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.id.substring(0, 8)}...) — {d.status}
            </option>
          ))}
        </select>

        {selectedDevice && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Smartphone size={16} className="text-green-600" />
            <span className="font-medium">{selectedDevice.name}</span>
            <span className="text-gray-400 dark:text-slate-500">·</span>
            <span className="text-xs text-gray-500 dark:text-slate-400">{deviceOverrides} 个设备级覆盖</span>
          </div>
        )}
      </div>

      {/* Category tabs + config list */}
      {selectedDeviceId && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => {
              const Icon = getCategoryIcon(cat.icon);
              const isActive = cat.key === activeCategory;
              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
                  }`}
                >
                  <Icon size={14} /> {cat.displayName}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索配置项..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 dark:bg-slate-700 dark:text-slate-100"
            />
          </div>

          {loadingConfig ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
              {filteredConfigs.length === 0 && (
                <div className="px-5 py-10 text-center text-gray-400 dark:text-slate-500 text-sm">暂无配置项</div>
              )}
              {filteredConfigs.map((cfg) => {
                const def = definitions.find((d) => d.key === cfg.key);
                const edit = edits[cfg.key];
                const currentValue = edit ? edit.value : cfg.value;
                const isDeviceOverride = cfg.source === 'device';

                return (
                  <div
                    key={cfg.key}
                    className={`px-5 py-4 hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition-colors ${isDeviceOverride ? 'bg-green-50/30 dark:bg-green-900/20' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 dark:text-slate-100">{cfg.displayName}</span>
                          <ConfigScopeBadge scope={cfg.source} sourceId={cfg.sourceId} />
                          {isDeviceOverride && (
                            <span className="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5">
                              设备覆盖
                            </span>
                          )}
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
                          />
                        </div>
                      </div>

                      {edit && (
                        <div className="flex items-center gap-1 pt-5">
                          <button
                            onClick={() => handleSave(cfg.key)}
                            disabled={edit.saving}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
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
          )}
        </>
      )}
    </div>
  );
}
