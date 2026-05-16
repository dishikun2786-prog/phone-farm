import { useState, useEffect, useCallback } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { useStore } from '../../store';
import { Loader2, Search, Users, UserPlus, UserCheck, Calendar, Edit2, X, ChevronLeft, ChevronRight, Check, Building, Key, Trash2, Coins } from 'lucide-react';

interface User {
  id: string;
  username: string;
  phone: string | null;
  role: string;
  status: string;
  tenantId: string | null;
  phoneVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  updatedAt: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface UserStats {
  totalUsers: number;
  todayNew: number;
  weekNew: number;
  activeUsers: number;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  tenant_admin: '租户管理员',
  operator: '操作员',
  viewer: '观察者',
  customer: '客户',
  agent: '代理',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  admin: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  tenant_admin: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  operator: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  viewer: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400',
  customer: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  agent: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

const STATUS_LABELS: Record<string, string> = {
  active: '正常',
  disabled: '已禁用',
  deleted: '已删除',
};

// ── Modals ──

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('operator');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async () => {
    if (!username || !password) { setError('用户名和密码为必填项'); return; }
    setSaving(true); setError('');
    try {
      await api.createUser({ username, password, phone: phone || undefined, role });
      onCreated();
      onClose();
      setUsername(''); setPassword(''); setPhone(''); setRole('operator');
    } catch (err: any) {
      setError(err.message || '创建失败');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">创建新用户</h3>
        {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2 mb-3">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">用户名 *</label>
            <input value={username} onChange={e => setUsername(e.target.value)} className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="2-32 字符" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">密码 *</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="至少 6 位" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">手机号</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="选填，11 位手机号" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">角色</label>
            <select value={role} onChange={e => setRole(e.target.value)} className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">取消</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? '创建中...' : '创建用户'}</button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ open, user, onClose, onDone }: { open: boolean; user: User | null; onClose: () => void; onDone: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open || !user) return null;

  const handleSubmit = async () => {
    if (!newPassword || newPassword.length < 6) { setError('密码至少 6 位'); return; }
    setSaving(true); setError('');
    try {
      await api.adminResetPassword(user.id, newPassword);
      onDone();
      onClose();
      setNewPassword('');
    } catch (err: any) {
      setError(err.message || '重置失败');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">重置密码 — {user.username}</h3>
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">设置新密码后用户需要用新密码登录</p>
        {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2 mb-3">{error}</div>}
        <input
          type="password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm mb-4"
          placeholder="输入新密码（至少 6 位）"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">取消</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">{saving ? '重置中...' : '确认重置'}</button>
        </div>
      </div>
    </div>
  );
}

function TopUpModal({ open, user, userBalance, onClose, onDone }: { open: boolean; user: User | null; userBalance: number | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open || !user) return null;

  const handleSubmit = async () => {
    const a = Number(amount);
    if (!a || a <= 0) { setError('请输入有效积分数'); return; }
    if (a > 100000) { setError('单次最多充值 100,000 积分'); return; }
    setSaving(true); setError('');
    try {
      await api.grantCredits(user.id, a, note || undefined);
      onDone();
      onClose();
      setAmount(''); setNote('');
    } catch (err: any) {
      setError(err.message || '充值失败');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">积分充值 — {user.username}</h3>
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
          当前余额：<span className="font-semibold text-gray-900 dark:text-white">{userBalance != null ? userBalance.toLocaleString() : '加载中...'}</span> 积分
        </p>
        {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2 mb-3">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">充值积分数 *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="输入积分数" min="1" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">备注</label>
            <input value={note} onChange={e => setNote(e.target.value)} className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="选填" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">取消</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">{saving ? '充值中...' : '确认充值'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──

export default function UserManagement() {
  const currentUser = useStore(s => s.user);
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isTenantAdmin = currentUser?.role === 'tenant_admin';

  const [users, setUsers] = useState<User[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [stats, setStats] = useState<UserStats>({ totalUsers: 0, todayNew: 0, weekNew: 0, activeUsers: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState('');
  const [saving, setSaving] = useState(false);

  // Credit balances: userId → balance
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [balancesLoading, setBalancesLoading] = useState(false);

  // Tenant assignment modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTargetUser, setAssignTargetUser] = useState<User | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Create user modal
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Reset password modal
  const [resetPwModalOpen, setResetPwModalOpen] = useState(false);
  const [resetPwTarget, setResetPwTarget] = useState<User | null>(null);

  // Top-up modal
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const [topUpTarget, setTopUpTarget] = useState<User | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data: any = await api.getUsers({ page, pageSize: 20, keyword, role: roleFilter, status: statusFilter });
      setUsers(data.users || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, keyword, roleFilter, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const data: any = await api.getUserStats();
      setStats(data);
    } catch { /* non-critical */ }
  }, []);

  const fetchTenants = useCallback(async () => {
    try {
      const data: any = await api.getTenants('?limit=200');
      setTenants(data.tenants || []);
    } catch { /* non-critical */ }
  }, []);

  // Lazy-load balances for the current page of users
  const fetchBalances = useCallback(async () => {
    const ids = users.map(u => u.id);
    if (ids.length === 0) return;
    setBalancesLoading(true);
    try {
      const data: any = await api.getUserBalances(ids);
      setBalances(data.balances ? Object.fromEntries(
        Object.entries(data.balances).map(([uid, info]: [string, any]) => [uid, info.balance])
      ) : {});
    } catch { /* non-critical */ } finally {
      setBalancesLoading(false);
    }
  }, [users]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { if (isSuperAdmin) fetchTenants(); }, [fetchTenants, isSuperAdmin]);
  useEffect(() => { if (users.length > 0) fetchBalances(); }, [fetchBalances]);

  const handleToggleStatus = async (user: User) => {
    if (user.id === currentUser?.userId) {
      alert('不能操作自己的账号');
      return;
    }
    try {
      if (user.status === 'active') {
        await api.disableUser(user.id);
      } else {
        await api.enableUser(user.id);
      }
      fetchUsers();
      fetchStats();
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.id === currentUser?.userId) { alert('不能删除自己的账号'); return; }
    if (!confirm(`确定删除用户「${user.username}」？此操作为软删除，可通过数据库恢复。`)) return;
    try {
      await api.deleteUser(user.id);
      fetchUsers();
      fetchStats();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const handleSaveRole = async () => {
    if (!editingUser || saving) return;
    setSaving(true);
    try {
      await api.updateUser(editingUser.id, { role: editRole });
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignTenant = async () => {
    if (!assignTargetUser || !selectedTenantId || assigning) return;
    setAssigning(true);
    try {
      await api.assignUserToTenant(selectedTenantId, assignTargetUser.id);
      setAssignModalOpen(false);
      setAssignTargetUser(null);
      setSelectedTenantId('');
      fetchUsers();
    } catch (err: any) {
      alert(err.message || '分配失败');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveTenant = async (user: User) => {
    if (!user.tenantId || !confirm(`确定将 ${user.username} 从租户中移除？`)) return;
    try {
      await api.removeUserFromTenant(user.tenantId, user.id);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || '移除失败');
    }
  };

  const getTenantName = (tenantId: string | null) => {
    if (!tenantId) return '-';
    const t = tenants.find(x => x.id === tenantId);
    return t ? t.name : tenantId.slice(0, 8) + '...';
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const canManageUser = isSuperAdmin || isTenantAdmin;

  return (
    <PageWrapper title="用户管理">
      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"><Users size={18} className="text-blue-600 dark:text-blue-400" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalUsers}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">总用户数</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center"><UserPlus size={18} className="text-green-600 dark:text-green-400" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.todayNew}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">今日新增</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center"><Calendar size={18} className="text-purple-600 dark:text-purple-400" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.weekNew}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">本周新增</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><UserCheck size={18} className="text-emerald-600 dark:text-emerald-400" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.activeUsers}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">活跃用户</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={keyword}
            onChange={e => { setKeyword(e.target.value); setPage(1); }}
            placeholder="搜索用户名或手机号..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全部角色</option>
          <option value="super_admin">超级管理员</option>
          <option value="admin">管理员</option>
          <option value="tenant_admin">租户管理员</option>
          <option value="operator">操作员</option>
          <option value="viewer">观察者</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全部状态</option>
          <option value="active">正常</option>
          <option value="disabled">已禁用</option>
        </select>
        {canManageUser && (
          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            <UserPlus size={15} />
            创建用户
          </button>
        )}
        <span className="text-xs text-gray-500 dark:text-slate-400">共 {total} 个用户</span>
      </div>

      {/* Table */}
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-2 mb-4">{error}</div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium">用户</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium">手机号</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium">角色</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium hidden md:table-cell">租户</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium hidden lg:table-cell">积分</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium">状态</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium hidden md:table-cell">注册时间</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium hidden lg:table-cell">最后登录</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-slate-400 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400"><Loader2 size={24} className="animate-spin mx-auto" /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">暂无用户数据</td></tr>
              ) : users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-white">{user.username}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400 font-mono text-xs">
                    {user.phone || '-'}
                  </td>
                  <td className="px-4 py-3">
                    {editingUser?.id === user.id ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={editRole}
                          onChange={e => setEditRole(e.target.value)}
                          className="text-xs border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded px-1.5 py-0.5"
                        >
                          {Object.entries(ROLE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        <button onClick={handleSaveRole} disabled={saving} className="text-green-600 hover:text-green-700"><Check size={14} /></button>
                        <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                      </div>
                    ) : (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {user.tenantId ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-700 dark:text-slate-300">
                        <Building size={12} />
                        {getTenantName(user.tenantId)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {balancesLoading ? (
                      <span className="text-xs text-gray-400">加载中</span>
                    ) : (
                      <span className="text-xs font-medium text-gray-900 dark:text-white">
                        {balances[user.id] != null ? balances[user.id].toLocaleString() : '-'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs ${
                      user.status === 'active' ? 'text-green-600 dark:text-green-400'
                        : user.status === 'deleted' ? 'text-gray-400 dark:text-gray-500'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        user.status === 'active' ? 'bg-green-500' : user.status === 'deleted' ? 'bg-gray-400' : 'bg-red-500'
                      }`} />
                      {STATUS_LABELS[user.status] || user.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs hidden md:table-cell">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs hidden lg:table-cell">{formatDate(user.lastLoginAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {canManageUser && user.status !== 'deleted' && (
                      <div className="inline-flex items-center gap-1">
                        {isSuperAdmin && (
                          <>
                            <button
                              onClick={() => { setEditingUser(user); setEditRole(user.role); }}
                              className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                              title="编辑角色"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => { setAssignTargetUser(user); setSelectedTenantId(user.tenantId || ''); setAssignModalOpen(true); }}
                              className="p-1 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                              title={user.tenantId ? '更换租户' : '分配租户'}
                            >
                              <Building size={14} />
                            </button>
                            {user.tenantId && (
                              <button
                                onClick={() => handleRemoveTenant(user)}
                                className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                title="移除租户"
                              >
                                <X size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => { setResetPwTarget(user); setResetPwModalOpen(true); }}
                              className="p-1 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                              title="重置密码"
                            >
                              <Key size={14} />
                            </button>
                            <button
                              onClick={() => { setTopUpTarget(user); setTopUpModalOpen(true); }}
                              className="p-1 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                              title="积分充值"
                            >
                              <Coins size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user)}
                              className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                              title="删除用户"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleToggleStatus(user)}
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            user.status === 'active'
                              ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
                              : 'text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20'
                          }`}
                        >
                          {user.status === 'active' ? '禁用' : '启用'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-slate-700 text-sm">
            <span className="text-gray-500 dark:text-slate-400">第 {page}/{totalPages} 页</span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tenant Assignment Modal */}
      {assignModalOpen && assignTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              分配租户 — {assignTargetUser.username}
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
              选择要将该用户分配到的租户
            </p>
            <select
              value={selectedTenantId}
              onChange={e => setSelectedTenantId(e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm mb-4"
            >
              <option value="">— 选择租户 —</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setAssignModalOpen(false); setAssignTargetUser(null); }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAssignTenant}
                disabled={!selectedTenantId || assigning}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {assigning ? '分配中...' : '确认分配'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      <CreateUserModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} onCreated={() => { fetchUsers(); fetchStats(); }} />

      {/* Reset Password Modal */}
      <ResetPasswordModal open={resetPwModalOpen} user={resetPwTarget} onClose={() => { setResetPwModalOpen(false); setResetPwTarget(null); }} onDone={() => fetchUsers()} />

      {/* Top-Up Modal */}
      <TopUpModal open={topUpModalOpen} user={topUpTarget} userBalance={topUpTarget ? balances[topUpTarget.id] ?? null : null} onClose={() => { setTopUpModalOpen(false); setTopUpTarget(null); }} onDone={() => fetchBalances()} />
    </PageWrapper>
  );
}
