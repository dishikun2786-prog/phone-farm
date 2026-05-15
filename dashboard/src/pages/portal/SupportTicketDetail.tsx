import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';

interface Reply {
  id: string;
  message: string;
  isStaff: boolean;
  userId: string;
  createdAt: string;
}

interface TicketDetail {
  ticket: {
    id: string;
    ticketNumber: string;
    subject: string;
    category: string;
    status: string;
    priority: string;
    createdAt: string;
    updatedAt: string;
  };
  replies: Reply[];
}

export default function SupportTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
    api.getSupportTicket(id)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const handleReply = async () => {
    if (!id || !replyText.trim()) return;
    setSending(true);
    try {
      await api.replySupportTicket(id, replyText.trim());
      setReplyText('');
      load();
    } catch { alert('回复失败'); }
    finally { setSending(false); }
  };

  const handleClose = async () => {
    if (!id || !confirm('确定关闭此工单吗？')) return;
    try {
      await api.closeSupportTicket(id);
      load();
    } catch { alert('关闭失败'); }
  };

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { open: '待处理', in_progress: '处理中', waiting: '等待回复', closed: '已关闭' };
    return map[s] || s;
  };

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  if (!data) {
    return <div className="p-8 text-center text-gray-400">工单不存在</div>;
  }

  const { ticket, replies } = data;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button onClick={() => navigate('/portal/support')} className="text-sm text-gray-500 hover:text-gray-700 mb-4">
        &larr; 返回工单列表
      </button>

      <div className="bg-white border rounded-lg p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-mono text-blue-500">{ticket.ticketNumber}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                ticket.status === 'closed' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-50 text-yellow-700'
              }`}>
                {statusLabel(ticket.status)}
              </span>
            </div>
            <h1 className="text-xl font-bold">{ticket.subject}</h1>
          </div>
          {ticket.status !== 'closed' && (
            <button onClick={handleClose} className="text-sm text-red-400 hover:text-red-600">关闭工单</button>
          )}
        </div>
        <div className="text-xs text-gray-400">
          创建于 {new Date(ticket.createdAt).toLocaleString()} · {ticket.category}
        </div>
      </div>

      {/* Replies */}
      <div className="space-y-3 mb-6">
        {replies.map((r) => (
          <div key={r.id} className={`p-4 rounded-lg ${r.isStaff ? 'bg-blue-50 border border-blue-100' : 'bg-white border'}`}>
            <div className="flex justify-between items-center mb-2">
              <span className={`text-xs font-medium ${r.isStaff ? 'text-blue-600' : 'text-gray-500'}`}>
                {r.isStaff ? '客服人员' : '我'}
              </span>
              <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.message}</p>
          </div>
        ))}
      </div>

      {/* Reply form */}
      {ticket.status !== 'closed' && (
        <div className="bg-white border rounded-lg p-4">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="输入回复内容..."
            rows={4}
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
          />
          <div className="flex justify-end mt-3">
            <button
              onClick={handleReply}
              disabled={sending || !replyText.trim()}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {sending ? '发送中...' : '发送回复'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
