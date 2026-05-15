import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  enabled: boolean;
  lastUsedAt: string;
  createdAt: string;
}

export default function ApiKeyPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPerms, setNewKeyPerms] = useState('read');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadKeys = () => {
    setLoading(true);
    api.request('/api/v2/api-keys')
      .then((data) => setKeys(data.keys || data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadKeys(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      const data = await api.request('/api/v2/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName, permissions: [newKeyPerms] }),
      });
      setCreatedKey(data.apiKey || data.key || '');
      setShowCreate(false);
      loadKeys();
    } catch (err: any) {
      setError(err.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此 API Key 吗？')) return;
    try {
      await api.request(`/api/v2/api-keys/${id}`, { method: 'DELETE' });
      loadKeys();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <button
          onClick={() => { setShowCreate(true); setCreatedKey(null); setError(''); }}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600"
        >
          创建 API Key
        </button>
      </div>

      {createdKey && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-green-800 font-medium text-sm mb-2">API Key 创建成功！请立即复制，关闭后无法再次查看。</p>
          <code className="block bg-white border rounded px-3 py-2 font-mono text-sm break-all">{createdKey}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(createdKey); }}
            className="mt-2 text-xs text-blue-500 hover:text-blue-700"
          >
            复制到剪贴板
          </button>
        </div>
      )}

      {showCreate && (
        <div className="bg-white border rounded-lg p-6 mb-6 space-y-4">
          <h2 className="font-semibold">新建 API Key</h2>
          <div>
            <label className="block text-sm font-medium mb-1">名称</label>
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="例如: 生产环境 Key"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">权限</label>
            <select
              value={newKeyPerms}
              onChange={(e) => setNewKeyPerms(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="read">只读</option>
              <option value="read,write">读写</option>
              <option value="read,write,admin">管理员</option>
            </select>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-lg text-sm">取消</button>
            <button
              onClick={handleCreate}
              disabled={creating || !newKeyName.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {creating ? '创建中...' : '创建'}
            </button>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">暂无 API Key</p>
          <p className="text-sm mt-2">创建 API Key 以使用 PhoneFarm 开放 API</p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <div key={k.id} className="bg-white border rounded-lg p-4 flex justify-between items-center">
              <div>
                <h3 className="font-medium text-sm">{k.name}</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{k.keyPrefix}****</p>
                <div className="flex items-center gap-2 mt-1">
                  {k.permissions.map((p) => (
                    <span key={p} className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-500">{p}</span>
                  ))}
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    k.enabled ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {k.enabled ? '启用' : '禁用'}
                  </span>
                </div>
                {k.lastUsedAt && (
                  <p className="text-xs text-gray-400 mt-1">最近使用: {new Date(k.lastUsedAt).toLocaleDateString()}</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(k.id)}
                className="text-red-400 hover:text-red-600 text-sm"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
