import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface AgentSummary {
  agentId: string;
  agentName: string;
  totalCommission: number;
  saleCount: number;
  settled: boolean;
}

export default function CommissionSettlementPage() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);

  const load = () => {
    setLoading(true);
    api.request(`/api/v2/agents/commissions/settle-summary?period=${encodeURIComponent(period)}`)
      .then((data) => setAgents(data.agents || data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [period]);

  const handleSettle = async () => {
    if (!confirm(`确定结算 ${period} 的所有佣金吗？`)) return;
    setSettling(true);
    try {
      await api.request('/api/v2/agents/commissions/settle', {
        method: 'POST',
        body: JSON.stringify({ period }),
      });
      load();
    } catch { alert('结算失败'); }
    finally { setSettling(false); }
  };

  const totalPending = agents.filter((a) => !a.settled).reduce((s, a) => s + a.totalCommission, 0);
  const totalSettled = agents.filter((a) => a.settled).reduce((s, a) => s + a.totalCommission, 0);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">佣金结算</h1>
        <div className="flex items-center gap-4">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={handleSettle}
            disabled={settling || totalPending === 0}
            className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 disabled:opacity-50"
          >
            {settling ? '结算中...' : `结算 ${period}`}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-600">{totalPending.toFixed(2)} 元</div>
          <div className="text-sm text-gray-500">待结算佣金</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-2xl font-bold text-green-600">{totalSettled.toFixed(2)} 元</div>
          <div className="text-sm text-gray-500">已结算佣金</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-600">{agents.length}</div>
          <div className="text-sm text-gray-500">代理商数</div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">代理商</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">售出数量</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">佣金金额</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">状态</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.agentId} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium">{a.agentName}</td>
                  <td className="px-4 py-3 text-sm">{a.saleCount}</td>
                  <td className="px-4 py-3 text-sm text-green-600">{a.totalCommission.toFixed(2)} 元</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.settled ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                      {a.settled ? '已结算' : '待结算'}
                    </span>
                  </td>
                </tr>
              ))}
              {agents.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400">所选月份无佣金记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
