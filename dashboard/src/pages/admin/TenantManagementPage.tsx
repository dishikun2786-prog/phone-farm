import { useState, useEffect, useCallback } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { useStore } from '../../store';
import { Loader2, Plus, Edit2, Trash2, Building, Globe, Users, Smartphone, Shield } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: string;
  contactName: string | null;
  contactEmail: string | null;
  maxDevices: number;
  maxUsers: number;
  features: string[];
  userCount?: number;
  deviceCount?: number;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  active: '正常',
  suspended: '已停用',
  deleted: '已删除',
};

export default function TenantManagementPage() {
  const currentUser = useStore(s => s.user);
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formDomain, setFormDomain] = useState('');
  const [formMaxDevices, setFormMaxDevices] = useState('100');
  const [formMaxUsers, setFormMaxUsers] = useState('10');
  const [formStatus, setFormStatus] = useState('active');

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data: any = await api.getTenants('?limit=200');
      setTenants(data.tenants || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const openCreateModal = () => {
    setEditingTenant(null);
    setFormName('');
    setFormSlug('');
    setFormDomain('');
    setFormMaxDevices('100');
    setFormMaxUsers('10');
    setFormStatus('active');
    setModalOpen(true);
  };

  const openEditModal = (t: Tenant) => {
    setEditingTenant(t);
    setFormName(t.name);
    setFormSlug(t.slug);
    setFormDomain(t.domain || '');
    setFormMaxDevices(String(t.maxDevices || 100));
    setFormMaxUsers(String(t.maxUsers || 10));
    setFormStatus(t.status);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formSlug.trim() || saving) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        name: formName.trim(),
        slug: formSlug.trim().toLowerCase().replace(/\s+/g, '-'),
        maxDevices: parseInt(formMaxDevices, 10) || 100,
        maxUsers: parseInt(formMaxUsers, 10) || 10,
        status: formStatus,
      };
      if (formDomain.trim()) data.domain = formDomain.trim();

      if (editingTenant) {
        await api.updateTenant(editingTenant.id, data);
      } else {
        await api.createTenant(data);
      }
      setModalOpen(false);
      fetchTenants();
    } catch (err: any) {
      alert(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: Tenant) => {
    if (!confirm(`确定删除租户「${t.name}」？此操作不可撤销。`)) return;
    try {
      await api.deleteTenant(t.id);
      fetchTenants();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const formatDate = (d: string) => {
    return new Date(d).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  if (!isSuperAdmin) {
    return (
      <PageWrapper title="租户管理">
        <div className="text-center py-16 text-gray-400">
          <Building size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-lg">仅超级管理员可访问租户管理</p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="租户管理">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500 dark:text-slate-400">共 {total} 个租户</p>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} />
          新建租户
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-2 mb-4">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium">租户名称</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium">Slug</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium hidden md:table-cell">域名</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-slate-400 font-medium hidden lg:table-cell">用户</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-slate-400 font-medium hidden lg:table-cell">设备上限</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium">状态</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-slate-400 font-medium hidden md:table-cell">创建时间</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-slate-400 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400"><Loader2 size={24} className="animate-spin mx-auto" /></td></tr>
              ) : tenants.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">暂无租户数据</td></tr>
              ) : tenants.map(t => (
                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-white">{t.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-slate-300">{t.slug}</code>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {t.domain ? (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                        <Globe size={12} />
                        {t.domain}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center hidden lg:table-cell">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-slate-300">
                      <Users size={12} />
                      {t.userCount ?? '-'} / {t.maxUsers}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center hidden lg:table-cell">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-slate-300">
                      <Smartphone size={12} />
                      {t.maxDevices}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs ${
                      t.status === 'active' ? 'text-green-600 dark:text-green-400' :
                      t.status === 'suspended' ? 'text-amber-600 dark:text-amber-400' :
                      'text-red-600 dark:text-red-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        t.status === 'active' ? 'bg-green-500' :
                        t.status === 'suspended' ? 'bg-amber-500' : 'bg-red-500'
                      }`} />
                      {STATUS_LABELS[t.status] || t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs hidden md:table-cell">{formatDate(t.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(t)}
                        className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        title="编辑"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {editingTenant ? '编辑租户' : '新建租户'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">名称 *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：某某科技"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Slug * (URL 标识)</label>
                <input
                  type="text"
                  value={formSlug}
                  onChange={e => setFormSlug(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：mou-keji"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">自定义域名</label>
                <input
                  type="text"
                  value={formDomain}
                  onChange={e => setFormDomain(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：phone.example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">设备上限</label>
                  <input
                    type="number"
                    value={formMaxDevices}
                    onChange={e => setFormMaxDevices(e.target.value)}
                    className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">用户上限</label>
                  <input
                    type="number"
                    value={formMaxUsers}
                    onChange={e => setFormMaxUsers(e.target.value)}
                    className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">状态</label>
                <select
                  value={formStatus}
                  onChange={e => setFormStatus(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">正常</option>
                  <option value="suspended">已停用</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!formName.trim() || !formSlug.trim() || saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? '保存中...' : editingTenant ? '保存修改' : '创建租户'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
