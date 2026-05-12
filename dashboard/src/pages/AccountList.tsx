import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Plus, Trash2, Loader2, Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../hooks/useToast';
import ConfirmDialog from '../components/ConfirmDialog';
import PageWrapper from '../components/PageWrapper';
import { SkeletonRow } from '../components/Skeleton';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [platform, setPlatform] = useState('dy');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const devices = useStore(s => s.devices);
  const [deviceId, setDeviceId] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAccounts = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getAccounts();
      setAccounts(data);
    } catch (err: any) {
      setError(err.message || '加载账号列表失败');
      toast('error', err.message || '加载账号列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createAccount({
        platform,
        username,
        passwordEncrypted: btoa(password),
        deviceId: deviceId || null,
      });
      toast('success', '账号添加成功');
      setShowForm(false);
      setUsername('');
      setPassword('');
      await loadAccounts();
    } catch (err: any) {
      toast('error', err.message || '添加账号失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await api.deleteAccount(id);
      toast('success', '账号已删除');
      setDeleteId(null);
      await loadAccounts();
    } catch (err: any) {
      toast('error', err.message || '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PageWrapper
      loading={loading}
      error={error}
      empty={!loading && !error && accounts.length === 0}
      emptyTitle="暂无账号"
      emptyDescription="添加平台账号以用于自动化任务"
      emptyAction={
        <button
          onClick={() => setShowForm(true)}
          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          添加账号
        </button>
      }
    >
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

        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        )}

        {!loading && !error && accounts.length > 0 && (
          <>
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
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-9"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {submitting && <Loader2 size={14} className="animate-spin" />}
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
                    onClick={() => setDeleteId(acct.id)}
                    className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        title="确认删除"
        message="确定要删除此账号吗？此操作不可撤销。"
        confirmLabel="删除"
        variant="danger"
        loading={deleting}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </PageWrapper>
  );
}
