import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  updatedAt: string;
}

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.getSupportTickets()
      .then((data) => setTickets(data.tickets || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { open: '待处理', in_progress: '处理中', waiting: '等待回复', closed: '已关闭' };
    return map[s] || s;
  };

  const categoryLabel = (c: string) => {
    const map: Record<string, string> = { technical: '技术', billing: '账单', account: '账户', activation: '激活', other: '其他' };
    return map[c] || c;
  };

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">技术支持</h1>
        <button
          onClick={() => navigate('/portal/support/new')}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600"
        >
          新建工单
        </button>
      </div>

      {tickets.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">暂无工单</p>
          <p className="text-sm mt-2">遇到问题？提交工单获取技术支持</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <div
              key={t.id}
              onClick={() => navigate(`/portal/support/${t.id}`)}
              className="bg-white border rounded-lg p-4 hover:shadow-sm transition-shadow cursor-pointer"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-blue-500">{t.ticketNumber}</span>
                    <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-500">{categoryLabel(t.category)}</span>
                  </div>
                  <h3 className="font-medium mt-1">{t.subject}</h3>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  t.status === 'open' ? 'bg-yellow-50 text-yellow-700'
                  : t.status === 'in_progress' ? 'bg-blue-50 text-blue-700'
                  : t.status === 'waiting' ? 'bg-purple-50 text-purple-700'
                  : 'bg-gray-100 text-gray-500'
                }`}>
                  {statusLabel(t.status)}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-2">更新于 {new Date(t.updatedAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
