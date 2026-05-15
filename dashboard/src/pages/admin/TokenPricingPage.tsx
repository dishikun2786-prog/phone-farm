import { useState, useEffect } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import { DollarSign, Plus, Save, Trash2, X, Loader2 } from 'lucide-react';

interface PricingTier {
  modelName: string;
  modelType: string;
  inputTokensPerCredit: number;
  outputTokensPerCredit: number;
}

const DEFAULT_TIERS: PricingTier[] = [
  { modelName: 'deepseek-v4-flash', modelType: 'text', inputTokensPerCredit: 5000, outputTokensPerCredit: 2000 },
  { modelName: 'qwen3-vl-plus', modelType: 'vision', inputTokensPerCredit: 3500, outputTokensPerCredit: 1200 },
];

export default function TokenPricingPage() {
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editTier, setEditTier] = useState<PricingTier | null>(null);
  const [editForm, setEditForm] = useState({ modelName: '', modelType: 'text', inputTokensPerCredit: '', outputTokensPerCredit: '' });

  // New modal
  const [showNew, setShowNew] = useState(false);

  useEffect(() => { loadPricing(); }, []);

  async function loadPricing() {
    setLoading(true);
    try {
      const data = await api.getTokenPricing() as { pricing: PricingTier[] };
      setTiers(data.pricing?.length ? data.pricing : []);
    } catch {
      setTiers([]);
    }
    finally { setLoading(false); }
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      // Save each tier individually (backend PUT handles one model at a time)
      for (const tier of tiers) {
        await api.updateTokenPricing(tier.modelName, tier.inputTokensPerCredit, tier.outputTokensPerCredit);
      }
      toast('success', `已保存 ${tiers.length} 条定价`);
    } catch { toast('error', '保存定价失败'); }
    finally { setSaving(false); }
  }

  function openEdit(tier: PricingTier) {
    setEditTier(tier);
    setEditForm({
      modelName: tier.modelName,
      modelType: tier.modelType,
      inputTokensPerCredit: String(tier.inputTokensPerCredit),
      outputTokensPerCredit: String(tier.outputTokensPerCredit),
    });
  }

  function saveEdit() {
    if (!editTier || !editForm.modelName || !editForm.inputTokensPerCredit || !editForm.outputTokensPerCredit) return;
    setTiers(prev => prev.map(t => t.modelName === editTier.modelName ? {
      modelName: editForm.modelName,
      modelType: editForm.modelType,
      inputTokensPerCredit: Number(editForm.inputTokensPerCredit),
      outputTokensPerCredit: Number(editForm.outputTokensPerCredit),
    } : t));
    setEditTier(null);
  }

  function deleteTier(modelName: string) {
    setTiers(prev => prev.filter(t => t.modelName !== modelName));
    if (editTier?.modelName === modelName) setEditTier(null);
  }

  function addTier() {
    if (!editForm.modelName || !editForm.inputTokensPerCredit || !editForm.outputTokensPerCredit) return;
    const newTier: PricingTier = {
      modelName: editForm.modelName,
      modelType: editForm.modelType,
      inputTokensPerCredit: Number(editForm.inputTokensPerCredit),
      outputTokensPerCredit: Number(editForm.outputTokensPerCredit),
    };
    setTiers(prev => [...prev, newTier]);
    setShowNew(false);
    setEditForm({ modelName: '', modelType: 'text', inputTokensPerCredit: '', outputTokensPerCredit: '' });
  }

  if (loading) return <PageWrapper title="Token 定价"><div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div></PageWrapper>;

  return (
    <PageWrapper title="Token 定价">
      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4 text-sm text-blue-700 dark:text-blue-300">
        <DollarSign size={16} className="inline mr-1.5 -mt-0.5" />
        设置每个模型 <strong>每积分可消耗的 Token 数量</strong>。值越大表示每积分可用的 Token 越多（越便宜）。
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => { setShowNew(true); setEditForm({ modelName: '', modelType: 'text', inputTokensPerCredit: '', outputTokensPerCredit: '' }); }}
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
            <button onClick={() => setTiers(DEFAULT_TIERS.map(t => ({ ...t })))}
              className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
              使用默认定价模板
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">模型名称</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">类型</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">输入 Tokens/积分</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">输出 Tokens/积分</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">操作</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map(tier => (
                  <tr key={tier.modelName} className="border-b border-gray-50 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-900 dark:text-slate-100">{tier.modelName}</td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-slate-300">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        tier.modelType === 'vision' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>{tier.modelType}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-green-600">{tier.inputTokensPerCredit.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-orange-600">{tier.outputTokensPerCredit.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(tier)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded text-gray-400 hover:text-blue-600 transition-colors">
                          <Save size={14} />
                        </button>
                        <button onClick={() => deleteTier(tier.modelName)}
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
  form: { modelName: string; modelType: string; inputTokensPerCredit: string; outputTokensPerCredit: string };
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
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">模型类型</label>
          <select value={form.modelType} onChange={e => setForm({ ...form, modelType: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="text">text (文本)</option>
            <option value="vision">vision (视觉)</option>
            <option value="embedding">embedding (嵌入)</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">输入 Tokens/积分</label>
          <input type="number" step="1" min="1" value={form.inputTokensPerCredit} onChange={e => setForm({ ...form, inputTokensPerCredit: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="5000" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">输出 Tokens/积分</label>
          <input type="number" step="1" min="1" value={form.outputTokensPerCredit} onChange={e => setForm({ ...form, outputTokensPerCredit: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="2000" />
        </div>
      </div>
    </div>
  );
}
