import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';

interface Account {
  id: string;
  platform: string;
  username: string;
  deviceId: string;
  loginStatus: boolean;
}

const PLATFORM_NAMES: Record<string, string> = {
  dy: '抖音', ks: '快手', wx: '微信', xhs: '小红书',
};

export default function AccountList() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [platform, setPlatform] = useState('dy');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const devices = useStore(s => s.devices);
  const [deviceId, setDeviceId] = useState('');

  const loadAccounts = async () => {
    const data = await api.getAccounts();
    setAccounts(data);
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createAccount({
      platform,
      username,
      passwordEncrypted: btoa(password), // Base64 for transport (server should encrypt)
      deviceId: deviceId || null,
    });
    setShowForm(false);
    setUsername('');
    setPassword('');
    loadAccounts();
  };

  const handleDelete = async (id: string) => {
    await api.deleteAccount(id);
    loadAccounts();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">账号管理</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> 添加账号
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-6 mb-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">平台</label>
              <select
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(PLATFORM_NAMES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">绑定设备</label>
              <select
                value={deviceId}
                onChange={e => setDeviceId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">不绑定</option>
                {devices.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {accounts.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">暂无账号</p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map(acct => (
            <div
              key={acct.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{acct.username}</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                    {PLATFORM_NAMES[acct.platform] || acct.platform}
                  </span>
                  {acct.loginStatus && (
                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">已登录</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(acct.id)}
                className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
