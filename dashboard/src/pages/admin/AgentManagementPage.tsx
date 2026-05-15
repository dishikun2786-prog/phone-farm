import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface Agent {
  id: string;
  name: string;
  userId: string;
  contactPhone: string;
  contactEmail: string;
  commissionRate: number;
  totalSold: number;
  totalCommission: number;
  active: boolean;
  createdAt: string;
}

export default function AgentManagementPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [userId, setUserId] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [commissionRate, setCommissionRate] = useState('0.3');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.request('/api/v2/agents')
      .then((data) => setAgents(data.agents || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setName(''); setUserId(''); setContactPhone(''); setContactEmail('');
    setCommissionRate('0.3'); setError(''); setEditingId(null);
  };

  const handleCreate = async () => {
    setSaving(true); setError('');
    try {
      await api.request('/api/v2/agents', {
        method: 'POST',
        body: JSON.stringify({
          userId, name,
          contactPhone: contactPhone || undefined,
          contactEmail: contactEmail || undefined,
          commissionRate: parseFloat(commissionRate),
        }),
      });
      setShowCreate(false); resetForm(); load();
    } catch (err: any) { setError(err.message || '创建失败'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (id: string) => {
    setSaving(true); setError('');
    try {
      await api.request(`/api/v2/agents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          contactPhone: contactPhone || undefined,
          contactEmail: contactEmail || undefined,
          commissionRate: parseFloat(commissionRate) || undefined,
        }),
      });
      setEditingId(null); resetForm(); load();
    } catch (err: any) { setError(err.message || '更新失败'); }
    finally { setSaving(false); }
  };

  const startEdit = (a: Agent) => {
    setEditingId(a.id);
    setName(a.name);
    setUserId(a.userId);
    setContactPhone(a.contactPhone || '');
    setContactEmail(a.contactEmail || '');
    setCommissionRate(String(a.commissionRate));
    setShowCreate(true);
  };

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">代理商管理</h1>
        <button
          onClick={() => { resetForm(); setShowCreate(true); }}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600"
        >
          新建代理商
        </button>
      </div>

      {showCreate && (
        <div className="bg-white border rounded-lg p-6 mb-6 space-y-4">
          <h2 className="font-semibold">{editingId ? '编辑代理商' : '新建代理商'}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">名称</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">用户 ID</label>
              <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="关联的用户ID" className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingId} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">联系电话</label>
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">联系邮箱</label>
              <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">佣金比例 (0-1)</label>
              <input type="number" min="0" max="1" step="0.05" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setShowCreate(false); resetForm(); }} className="px-4 py-2 border rounded-lg text-sm">取消</button>
            <button
              onClick={() => editingId ? handleUpdate(editingId) : handleCreate()}
              disabled={saving || !name.trim() || (!editingId && !userId.trim())}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {saving ? '保存中...' : editingId ? '更新' : '创建'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">名称</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">佣金比例</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">已售卡密</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">累计佣金</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">状态</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-gray-400">{a.contactEmail || a.contactPhone || ''}</p>
                </td>
                <td className="px-4 py-3 text-sm">{Math.round(a.commissionRate * 100)}%</td>
                <td className="px-4 py-3 text-sm font-medium">{a.totalSold}</td>
                <td className="px-4 py-3 text-sm text-green-600">{a.totalCommission.toFixed(2)} 元</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {a.active ? '活跃' : '已禁用'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => startEdit(a)} className="text-blue-500 hover:text-blue-700 text-sm">编辑</button>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">暂无代理商</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
