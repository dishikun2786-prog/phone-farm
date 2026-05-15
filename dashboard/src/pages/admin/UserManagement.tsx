import { useState, useEffect, useCallback } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { useStore } from '../../store';
import { Loader2, Search, Users, UserPlus, UserCheck, Calendar, Edit2, X, ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface User {
  id: string;
  username: string;
  phone: string | null;
  role: string;
  status: string;
  phoneVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  updatedAt: string;
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
  operator: '操作员',
  viewer: '观察者',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  admin: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  operator: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  viewer: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400',
};

const STATUS_LABELS: Record<string, string> = {
  active: '正常',
  disabled: '已禁用',
};

export default function UserManagement() {
  const currentUser = useStore(s => s.user);
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [users, setUsers] = useState<User[]>([]);
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

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

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

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

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
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium">状态</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium hidden md:table-cell">注册时间</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium hidden lg:table-cell">最后登录</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-slate-400 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400"><Loader2 size={24} className="animate-spin mx-auto" /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">暂无用户数据</td></tr>
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
                          <option value="super_admin">超级管理员</option>
                          <option value="admin">管理员</option>
                          <option value="operator">操作员</option>
                          <option value="viewer">观察者</option>
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
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs ${
                      user.status === 'active' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                      {STATUS_LABELS[user.status] || user.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs hidden md:table-cell">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs hidden lg:table-cell">{formatDate(user.lastLoginAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {isSuperAdmin && (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => { setEditingUser(user); setEditRole(user.role); }}
                          className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          title="编辑角色"
                        >
                          <Edit2 size={14} />
                        </button>
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
    </PageWrapper>
  );
}
