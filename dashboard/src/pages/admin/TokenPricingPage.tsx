import { useState, useEffect } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import { DollarSign, Plus, Save, Trash2, X } from 'lucide-react';

interface PricingTier {
  id: string;
  modelName: string;
  modelProvider: string;
  inputRate: number;
  outputRate: number;
  unit: string;
  description?: string;
  updatedAt?: string;
}

const DEFAULT_TIERS: Omit<PricingTier, 'id'>[] = [
  { modelName: 'deepseek-v4-flash', modelProvider: 'DeepSeek', inputRate: 0.14, outputRate: 0.28, unit: 'per_1M_tokens' },
  { modelName: 'qwen3-vl-plus', modelProvider: 'Alibaba', inputRate: 1.5, outputRate: 4.5, unit: 'per_1M_tokens' },
  { modelName: 'claude-sonnet-4-6', modelProvider: 'Anthropic', inputRate: 3, outputRate: 15, unit: 'per_1M_tokens' },
];

export default function TokenPricingPage() {
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editTier, setEditTier] = useState<PricingTier | null>(null);
  const [editForm, setEditForm] = useState({ modelName: '', modelProvider: '', inputRate: '', outputRate: '', unit: 'per_1M_tokens', description: '' });

  // New modal
  const [showNew, setShowNew] = useState(false);

  useEffect(() => { loadPricing(); }, []);

  async function loadPricing() {
    setLoading(true);
    try {
      const data = await api.request('/admin/credits/pricing') as { tiers: PricingTier[] };
      setTiers(data.tiers?.length ? data.tiers : []);
    } catch {
      // If endpoint not available, seed with defaults
      setTiers([]);
    }
    finally { setLoading(false); }
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      await api.request('/admin/credits/pricing', {
        method: 'PUT',
        body: JSON.stringify({ tiers }),
      });
      toast('success', '定价已保存');
    } catch { toast('error', '保存定价失败'); }
    finally { setSaving(false); }
  }

  function openEdit(tier: PricingTier) {
    setEditTier(tier);
    setEditForm({
      modelName: tier.modelName,
      modelProvider: tier.modelProvider,
      inputRate: String(tier.inputRate),
      outputRate: String(tier.outputRate),
      unit: tier.unit,
      description: tier.description || '',
    });
  }

  function saveEdit() {
    if (!editTier || !editForm.modelName || !editForm.inputRate || !editForm.outputRate) return;
    setTiers(prev => prev.map(t => t.id === editTier.id ? {
      ...t,
      modelName: editForm.modelName,
      modelProvider: editForm.modelProvider,
      inputRate: Number(editForm.inputRate),
      outputRate: Number(editForm.outputRate),
      unit: editForm.unit,
      description: editForm.description,
    } : t));
    setEditTier(null);
  }

  function deleteTier(id: string) {
    setTiers(prev => prev.filter(t => t.id !== id));
    if (editTier?.id === id) setEditTier(null);
  }

  function addTier() {
    if (!editForm.modelName || !editForm.inputRate || !editForm.outputRate) return;
    const newTier: PricingTier = {
      id: `new-${Date.now()}`,
      modelName: editForm.modelName,
      modelProvider: editForm.modelProvider,
      inputRate: Number(editForm.inputRate),
      outputRate: Number(editForm.outputRate),
      unit: editForm.unit,
      description: editForm.description,
    };
    setTiers(prev => [...prev, newTier]);
    setShowNew(false);
    setEditForm({ modelName: '', modelProvider: '', inputRate: '', outputRate: '', unit: 'per_1M_tokens', description: '' });
  }

  if (loading) return <PageWrapper title="Token 定价"><p className="text-gray-400 dark:text-slate-500 text-center py-12">加载中...</p></PageWrapper>;

  return (
    <PageWrapper title="Token 定价">
      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4 text-sm text-blue-700 dark:text-blue-300">
        <DollarSign size={16} className="inline mr-1.5 -mt-0.5" />
        定价单位为 <strong>每 1M tokens (USD)</strong>。修改后即时生效，已产生费用不受影响。
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => { setShowNew(true); setEditForm({ modelName: '', modelProvider: '', inputRate: '', outputRate: '', unit: 'per_1M_tokens', description: '' }); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
          <Plus size={16} /> 添加模型
        </button>
        <button onClick={handleSaveAll} disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-40">
          <Save size={16} /> {saving ? '保存中...' : '保存全部'}
        </button>
      </div>

      {/* Pricing Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {tiers.length === 0 ? (
          <div className="text-center py-16">
            <DollarSign size={40} className="mx-auto text-gray-300 dark:text-slate-600 mb-3" />
            <p className="text-gray-400 dark:text-slate-500 text-sm mb-3">暂无定价配置</p>
            <button onClick={() => {
              const seeded = DEFAULT_TIERS.map((t, i) => ({ ...t, id: `seed-${i}-${Date.now()}` }));
              setTiers(seeded);
            }} className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
              使用默认定价模板
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">模型</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">提供商</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">输入价格 ($/1M)</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">输出价格 ($/1M)</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">单位</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">说明</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">操作</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map(tier => (
                  <tr key={tier.id} className="border-b border-gray-50 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-900 dark:text-slate-100">{tier.modelName}</td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-slate-300">{tier.modelProvider}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-green-600">${tier.inputRate.toFixed(3)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-orange-600">${tier.outputRate.toFixed(3)}</td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400 text-xs">{tier.unit}</td>
                    <td className="px-4 py-2.5 text-gray-400 dark:text-slate-500 text-xs max-w-[150px] truncate">{tier.description || '-'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(tier)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded text-gray-400 hover:text-blue-600 transition-colors">
                          <Save size={14} />
                        </button>
                        <button onClick={() => deleteTier(tier.id)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditTier(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg text-gray-900 dark:text-slate-100">编辑定价</h3>
              <button onClick={() => setEditTier(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded text-gray-400"><X size={18} /></button>
            </div>
            <PricingForm form={editForm} setForm={setEditForm} />
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditTier(null)} className="px-4 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300">取消</button>
              <button onClick={saveEdit} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* New Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowNew(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg text-gray-900 dark:text-slate-100">添加模型定价</h3>
              <button onClick={() => setShowNew(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded text-gray-400"><X size={18} /></button>
            </div>
            <PricingForm form={editForm} setForm={setEditForm} />
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300">取消</button>
              <button onClick={addTier} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">添加</button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

function PricingForm({ form, setForm }: {
  form: { modelName: string; modelProvider: string; inputRate: string; outputRate: string; unit: string; description: string };
  setForm: (f: typeof form) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">模型名称</label>
          <input type="text" value={form.modelName} onChange={e => setForm({ ...form, modelName: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="deepseek-v4-flash" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">提供商</label>
          <input type="text" value={form.modelProvider} onChange={e => setForm({ ...form, modelProvider: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="DeepSeek" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">输入价格 ($/1M)</label>
          <input type="number" step="0.001" value={form.inputRate} onChange={e => setForm({ ...form, inputRate: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0.14" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">输出价格 ($/1M)</label>
          <input type="number" step="0.001" value={form.outputRate} onChange={e => setForm({ ...form, outputRate: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0.28" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">单位</label>
        <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}
          className="w-full px-3 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="per_1M_tokens">per_1M_tokens</option>
          <option value="per_1K_tokens">per_1K_tokens</option>
          <option value="per_token">per_token</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">说明(可选)</label>
        <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
          className="w-full px-3 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="DeepSeek V4 Flash pricing" />
      </div>
    </div>
  );
}
