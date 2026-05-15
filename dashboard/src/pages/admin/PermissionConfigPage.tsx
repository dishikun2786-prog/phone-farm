import { useState, useEffect, useCallback } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { useStore } from '../../store';
import { Loader2, Save, RotateCcw, Shield } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  tenant_admin: '租户管理员',
  operator: '操作员',
  viewer: '观察者',
  customer: '客户',
  agent: 'Agent',
};

const RESOURCE_LABELS: Record<string, string> = {
  devices: '设备管理',
  device_groups: '设备分组',
  tasks: '任务管理',
  task_templates: '任务模板',
  accounts: '账号管理',
  users: '用户管理',
  activation: '卡密管理',
  vlm: 'VLM 配置',
  vlm_episodes: 'VLM 记录',
  vlm_scripts: 'VLM 脚本',
  plugins: '插件管理',
  models: '模型管理',
  audit_logs: '审计日志',
  alerts: '告警规则',
  webhooks: 'Webhook',
  api_keys: 'API Key',
  stats: '用量统计',
  platform_accounts: '平台账号',
  system: '系统设置',
  config: '配置管理',
  tenants: '租户管理',
  billing: '计费管理',
};

const ACTIONS = ['read', 'write', 'delete', 'manage'] as const;
const ACTION_LABELS: Record<string, string> = {
  read: '读',
  write: '写',
  delete: '删',
  manage: '管',
};
const ACTION_COLORS: Record<string, string> = {
  read: 'text-blue-600 dark:text-blue-400',
  write: 'text-orange-600 dark:text-orange-400',
  delete: 'text-red-600 dark:text-red-400',
  manage: 'text-purple-600 dark:text-purple-400',
};

export default function PermissionConfigPage() {
  const currentUser = useStore(s => s.user);
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [roles, setRoles] = useState<string[]>([]);
  const [resources, setResources] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Record<string, string[]>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data: any = await api.getPermissions();
      setRoles(data.roles || []);
      setResources(data.resources || []);
      setMatrix(data.matrix || {});
    } catch (err: any) {
      setError(err.message || '加载权限矩阵失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);

  const toggleAction = (role: string, resource: string, action: string) => {
    setMatrix(prev => {
      const next = { ...prev };
      const rolePerms = { ...(next[role] || {}) };
      const current = [...(rolePerms[resource] || [])];
      const idx = current.indexOf(action);
      if (idx >= 0) {
        // Remove action — also remove 'manage' if deselecting manage
        current.splice(idx, 1);
        if (action === 'manage') {
          // nothing extra needed
        }
      } else {
        current.push(action);
        // If 'manage' is selected, it implies all others
        if (action === 'manage') {
          for (const a of ['read', 'write', 'delete']) {
            if (!current.includes(a)) current.push(a);
          }
        }
      }
      rolePerms[resource] = current;
      next[role] = rolePerms;
      return next;
    });
    setMessage('');
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const updates: Promise<any>[] = [];
      for (const role of roles) {
        for (const resource of resources) {
          const actions = matrix[role]?.[resource];
          if (actions && actions.length > 0) {
            updates.push(api.updatePermissions(role, resource, actions));
          }
        }
      }
      await Promise.all(updates);
      setMessage('权限矩阵保存成功');
      fetchPermissions();
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('确定要重置所有权限为系统默认值？此操作不可撤销。')) return;
    setResetting(true);
    setError('');
    try {
      await api.resetPermissions();
      setMessage('权限已重置为默认值');
      fetchPermissions();
    } catch (err: any) {
      setError(err.message || '重置失败');
    } finally {
      setResetting(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <PageWrapper title="权限配置">
        <div className="text-center py-16 text-gray-400">
          <Shield size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-lg">仅超级管理员可访问权限配置</p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="权限配置">
      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          管理 ({roles.length} 个角色 × {resources.length} 个资源) 的权限矩阵。修改后点击保存生效。
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            disabled={resetting}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            <RotateCcw size={14} />
            {resetting ? '重置中...' : '重置为默认'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save size={14} />
            {saving ? '保存中...' : '保存修改'}
          </button>
        </div>
      </div>

      {message && (
        <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-4 py-2 mb-3">{message}</div>
      )}
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-2 mb-3">{error}</div>
      )}

      {/* Matrix */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800/50">
                <tr>
                  <th className="sticky left-0 bg-gray-50 dark:bg-slate-800/50 text-left px-3 py-2 text-gray-500 dark:text-slate-400 font-medium border-b border-gray-200 dark:border-slate-700 z-10">
                    角色 \ 资源
                  </th>
                  {resources.map(r => (
                    <th key={r} className="px-2 py-2 text-center text-gray-500 dark:text-slate-400 font-medium border-b border-gray-200 dark:border-slate-700 whitespace-nowrap text-xs">
                      {RESOURCE_LABELS[r] || r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
                {roles.map(role => (
                  <tr key={role} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/20">
                    <td className="sticky left-0 bg-white dark:bg-slate-800 px-3 py-2 font-medium text-gray-900 dark:text-white whitespace-nowrap text-xs z-10">
                      {ROLE_LABELS[role] || role}
                    </td>
                    {resources.map(resource => {
                      const actions = matrix[role]?.[resource] || [];
                      return (
                        <td key={resource} className="px-1 py-1.5 text-center">
                          <div className="inline-flex items-center gap-0.5">
                            {ACTIONS.map(action => {
                              const active = actions.includes(action);
                              return (
                                <button
                                  key={action}
                                  onClick={() => toggleAction(role, resource, action)}
                                  className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                                    active
                                      ? `${ACTION_COLORS[action]} bg-gray-100 dark:bg-slate-700`
                                      : 'text-gray-300 dark:text-slate-600 hover:text-gray-400 dark:hover:text-slate-500'
                                  }`}
                                  title={`${ACTION_LABELS[action]}${active ? ' (已启用)' : ''}`}
                                >
                                  {ACTION_LABELS[action]}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
        <span>图例：</span>
        {ACTIONS.map(a => (
          <span key={a} className={`inline-flex items-center gap-1 font-medium ${ACTION_COLORS[a]}`}>
            {ACTION_LABELS[a]} = {a}
          </span>
        ))}
        <span className="text-gray-300 dark:text-slate-600">灰 = 无权限</span>
      </div>
    </PageWrapper>
  );
}
