import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface Commission {
  id: string;
  amount: number;
  status: string;
  settlementPeriod: string;
  createdAt: string;
  settledAt: string;
}

export default function AgentCommissionPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (period) params.set('period', period);
    const qs = params.toString();
    api.request(`/api/v2/agent/commissions${qs ? `?${qs}` : ''}`)
      .then((data) => setCommissions(data.commissions || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const totalPending = commissions.filter((c) => c.status === 'pending').reduce((s, c) => s + c.amount, 0);
  const totalSettled = commissions.filter((c) => c.status === 'settled').reduce((s, c) => s + c.amount, 0);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">佣金明细</h1>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-2xl font-bold text-yellow-600">{totalPending.toFixed(2)} 元</div>
          <div className="text-sm text-gray-500">待结算佣金</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-2xl font-bold text-green-600">{totalSettled.toFixed(2)} 元</div>
          <div className="text-sm text-gray-500">已结算佣金</div>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <label className="text-sm text-gray-500">筛选月份:</label>
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm"
        />
        {period && (
          <button onClick={() => setPeriod('')} className="text-xs text-blue-500 hover:text-blue-700">清除</button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>
      ) : commissions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">暂无佣金记录</p>
          <p className="text-sm mt-2">佣金在卡密消费后自动计算</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">结算月份</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">金额</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">状态</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">创建时间</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">结算时间</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{c.settlementPeriod || '-'}</td>
                  <td className="px-4 py-3 text-sm text-green-600 font-medium">{c.amount.toFixed(2)} 元</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      c.status === 'settled' ? 'bg-green-50 text-green-700'
                      : c.status === 'pending' ? 'bg-yellow-50 text-yellow-700'
                      : 'bg-red-50 text-red-700'
                    }`}>
                      {c.status === 'settled' ? '已结算' : c.status === 'pending' ? '待结算' : '已取消'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{c.settledAt ? new Date(c.settledAt).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
