import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('technical');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('normal');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await api.createSupportTicket({ subject: subject.trim(), category, message: message.trim(), priority });
      navigate('/portal/support');
    } catch (err: any) {
      setError(err.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const categories = [
    { value: 'technical', label: '技术问题' },
    { value: 'billing', label: '账单问题' },
    { value: 'account', label: '账户问题' },
    { value: 'activation', label: '激活问题' },
    { value: 'other', label: '其他' },
  ];

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button onClick={() => navigate('/portal/support')} className="text-sm text-gray-500 hover:text-gray-700 mb-4">
        &larr; 返回工单列表
      </button>

      <h1 className="text-2xl font-bold mb-6">提交工单</h1>

      <div className="bg-white border rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">主题</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="简要描述您的问题"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            maxLength={256}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">分类</label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  category === c.value
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">优先级</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="low">低</option>
            <option value="normal">普通</option>
            <option value="high">高</option>
            <option value="urgent">紧急</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">详细描述</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="请详细描述您遇到的问题..."
            rows={6}
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
            maxLength={5000}
          />
          <p className="text-xs text-gray-400 mt-1">{message.length}/5000</p>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !subject.trim() || !message.trim()}
          className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm font-medium"
        >
          {submitting ? '提交中...' : '提交工单'}
        </button>
      </div>
    </div>
  );
}
