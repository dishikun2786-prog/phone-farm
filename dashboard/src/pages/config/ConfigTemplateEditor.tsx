/**
 * ConfigTemplateEditor — create and manage reusable configuration templates.
 *
 * Templates are key-value presets that can be applied to devices or groups.
 * This page provides full CRUD for templates with a built-in config value editor.
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import ConfigField from '../../components/ConfigField';
import type { ConfigDefinition } from '../../components/ConfigField';
import {
  Plus, Trash2, Play, Package, X, Save,
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description?: string;
  values: Record<string, string>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  key: string;
  displayName: string;
}

export default function ConfigTemplateEditor() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [definitions, setDefinitions] = useState<ConfigDefinition[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [saving, setSaving] = useState(false);

  // Apply dialog
  const [applyTemplateId, setApplyTemplateId] = useState<string | null>(null);
  const [applyScope, setApplyScope] = useState<'device' | 'group'>('device');
  const [applyScopeId, setApplyScopeId] = useState('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [tmplRes, defRes, catRes] = await Promise.all([
        api.configGetTemplates() as Promise<{ templates: Template[] }>,
        api.configGetDefinitions() as Promise<{ definitions: ConfigDefinition[] }>,
        api.configGetCategories() as Promise<{ categories: Category[] }>,
      ]);
      setTemplates(tmplRes.templates || []);
      setDefinitions(defRes.definitions || []);
      setCategories(catRes.categories || []);
      if (catRes.categories?.length > 0 && !activeCategory) {
        setActiveCategory(catRes.categories[0].key);
      }
    } catch {
      toast('error', '加载模板失败');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(tmpl: Template) {
    setEditingId(tmpl.id);
    setEditName(tmpl.name);
    setEditDesc(tmpl.description || '');
    setEditValues({ ...tmpl.values });
    setShowCreate(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({});
  }

  function handleTemplateValueChange(key: string, value: string) {
    setEditValues((prev) => ({ ...prev, [key]: value }));
  }

  function removeTemplateValue(key: string) {
    setEditValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleCreate() {
    if (!createName.trim()) {
      toast('error', '模板名称不能为空');
      return;
    }
    setSaving(true);
    try {
      await api.configCreateTemplate({ name: createName, description: createDesc || undefined, values: {} });
      toast('success', '模板已创建');
      setShowCreate(false);
      setCreateName('');
      setCreateDesc('');
      await loadAll();
    } catch {
      toast('error', '创建模板失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editingId) return;
    setSaving(true);
    try {
      await api.configUpdateTemplate(editingId, {
        name: editName,
        description: editDesc,
        values: editValues,
      });
      toast('success', '模板已更新');
      cancelEdit();
      await loadAll();
    } catch {
      toast('error', '更新模板失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定要删除此模板？')) return;
    try {
      await api.configDeleteTemplate(id);
      toast('success', '模板已删除');
      await loadAll();
    } catch {
      toast('error', '删除模板失败');
    }
  }

  async function handleApply() {
    if (!applyTemplateId || !applyScopeId) {
      toast('error', '请填写目标 ID');
      return;
    }
    setApplying(true);
    try {
      const res = await api.configApplyTemplate(applyTemplateId, applyScope, applyScopeId) as { applied: number };
      toast('success', `模板已应用，覆盖 ${res.applied} 个配置项`);
      setApplyTemplateId(null);
      setApplyScopeId('');
    } catch {
      toast('error', '应用模板失败');
    } finally {
      setApplying(false);
    }
  }

  const filteredDefs = definitions.filter((d) => {
    const cat = categories.find((c) => c.key === activeCategory);
    if (!cat) return true;
    return d.categoryId === cat.key;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">配置模板管理</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            创建可复用的配置预设，批量应用到设备或分组
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setEditingId(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors"
        >
          <Plus size={14} /> 新建模板
        </button>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-indigo-200 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-3">新建配置模板</h3>
          <div className="space-y-3 max-w-md">
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="模板名称"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-700 dark:text-slate-100"
            />
            <textarea
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              placeholder="描述（可选）"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-700 dark:text-slate-100"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? '创建中...' : '创建'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 text-xs text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template list + editor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template list */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              模板列表 ({templates.length})
            </p>
          </div>
          {templates.length === 0 && (
            <div className="px-4 py-10 text-center text-gray-400 dark:text-slate-500 text-sm">
              <Package size={24} className="mx-auto mb-2 opacity-40" />
              暂无配置模板
            </div>
          )}
          {templates.map((tmpl) => (
            <div
              key={tmpl.id}
              className={`px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer ${
                editingId === tmpl.id ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''
              }`}
              onClick={() => startEdit(tmpl)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{tmpl.name}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    {Object.keys(tmpl.values).length} 个配置项
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); setApplyTemplateId(tmpl.id); }}
                    className="p-1 text-xs text-indigo-500 hover:bg-indigo-50 rounded transition-colors"
                    title="应用模板"
                  >
                    <Play size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(tmpl.id); }}
                    className="p-1 text-xs text-red-400 hover:bg-red-50 rounded transition-colors"
                    title="删除模板"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Template editor */}
        <div className="lg:col-span-2">
          {editingId ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full text-lg font-semibold bg-transparent border-none outline-none dark:text-slate-100"
                    placeholder="模板名称"
                  />
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full text-sm text-gray-500 dark:text-slate-400 bg-transparent border-none outline-none resize-none"
                    rows={1}
                    placeholder="添加描述..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleUpdate}
                    disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Save size={12} /> {saving ? '保存中...' : '保存'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Category tabs for adding values */}
              <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700 flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setActiveCategory(cat.key)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      activeCategory === cat.key
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {cat.displayName}
                  </button>
                ))}
              </div>

              {/* Current values */}
              <div className="px-5 py-3">
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-3">
                  模板配置项 ({Object.keys(editValues).length})
                </p>
                {Object.keys(editValues).length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 py-4 text-center">
                    从下方可选配置项中添加值到此模板
                  </p>
                )}
                <div className="space-y-3">
                  {Object.entries(editValues).map(([key, value]) => {
                    const def = definitions.find((d) => d.key === key);
                    return (
                      <div key={key} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-700 dark:text-slate-300">{def?.displayName || key}</p>
                          <p className="text-[10px] text-gray-400 dark:text-slate-500 font-mono">{key}</p>
                          <div className="mt-1 max-w-sm">
                            <ConfigField
                              definition={def || {
                                id: '', categoryId: '', key, displayName: key,
                                valueType: 'string', isSecret: false,
                                isOverridable: true, allowedScopes: [], tags: [], sortOrder: 0,
                              }}
                              value={value}
                              onChange={(val) => handleTemplateValueChange(key, val)}
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => removeTemplateValue(key)}
                          className="p-1 text-gray-400 dark:text-slate-500 hover:text-red-500 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Available definitions to add */}
              <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-700">
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-3">可用配置项</p>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {filteredDefs
                    .filter((d) => !(d.key in editValues))
                    .map((def) => (
                      <button
                        key={def.key}
                        onClick={() => handleTemplateValueChange(def.key, def.defaultValue || '')}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                      >
                        <div>
                          <p className="text-sm text-gray-700 dark:text-slate-300">{def.displayName}</p>
                          <p className="text-[10px] text-gray-400 dark:text-slate-500 font-mono">{def.key}</p>
                        </div>
                        <Plus size={14} className="text-gray-300 dark:text-slate-600" />
                      </button>
                    ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 flex items-center justify-center py-20 text-gray-400 dark:text-slate-500 text-sm">
              选择一个模板进行编辑，或创建新模板
            </div>
          )}
        </div>
      </div>

      {/* Apply template dialog */}
      {applyTemplateId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-4">应用配置模板</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-slate-400 block mb-1">目标类型</label>
                <select
                  value={applyScope}
                  onChange={(e) => setApplyScope(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm dark:bg-slate-700 dark:text-slate-100"
                >
                  <option value="device">设备</option>
                  <option value="group">分组</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-slate-400 block mb-1">
                  {applyScope === 'device' ? '设备 ID' : '分组 ID'}
                </label>
                <input
                  type="text"
                  value={applyScopeId}
                  onChange={(e) => setApplyScopeId(e.target.value)}
                  placeholder={applyScope === 'device' ? '输入设备 ID...' : '输入分组 ID...'}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm dark:bg-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="px-3 py-1.5 text-xs bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {applying ? '应用中...' : '应用模板'}
                </button>
                <button
                  onClick={() => { setApplyTemplateId(null); setApplyScopeId(''); }}
                  className="px-3 py-1.5 text-xs text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
