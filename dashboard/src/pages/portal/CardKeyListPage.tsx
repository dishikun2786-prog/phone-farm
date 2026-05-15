import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface CardKey {
  id: string;
  activationCode: string;
  batchId: string;
  planId: string;
  status: string;
  deviceId: string;
  activatedAt: string;
  expiresAt: string;
  createdAt: string;
}

export default function CardKeyListPage() {
  const [cardKeys, setCardKeys] = useState<CardKey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.request('/api/v2/card-keys')
      .then((data) => setCardKeys(data.cardKeys || data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  const unused = cardKeys.filter((k) => k.status === 'unused');
  const used = cardKeys.filter((k) => k.status !== 'unused');

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">我的卡密</h1>
        <div className="flex gap-2">
          <span className="text-sm text-gray-500">可用: {unused.length}</span>
          <span className="text-sm text-gray-400">|</span>
          <span className="text-sm text-gray-500">已用: {used.length}</span>
        </div>
      </div>

      {cardKeys.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">暂无卡密</p>
          <p className="text-sm mt-2">请联系您的代理商获取激活卡密</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">激活码</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">状态</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">绑定设备</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">创建时间</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">过期时间</th>
              </tr>
            </thead>
            <tbody>
              {cardKeys.map((k) => (
                <tr key={k.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono">{k.activationCode || k.id}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      k.status === 'unused' ? 'bg-green-50 text-green-700'
                      : k.status === 'used' ? 'bg-blue-50 text-blue-700'
                      : 'bg-red-50 text-red-700'
                    }`}>
                      {k.status === 'unused' ? '未使用' : k.status === 'used' ? '已使用' : '已过期'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 font-mono">{k.deviceId || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{k.createdAt ? new Date(k.createdAt).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
