/**
 * ConfigAuditLog — configuration change history viewer.
 *
 * Shows all config changes with old/new values, timestamps, and user attribution.
 * Supports filtering by config key and scope.
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import ConfigScopeBadge from '../../components/ConfigScopeBadge';
import { Search, Filter, Clock, ArrowRight, Globe } from 'lucide-react';

interface AuditLog {
  id: string;
  configKey: string;
  scope: string;
  scopeId?: string;
  oldValue?: string;
  newValue?: string;
  changedBy?: string;
  changedAt: string;
  ipAddress?: string;
  changeReason?: string;
}

export default function ConfigAuditLog() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKey, setSearchKey] = useState('');
  const [filterScope, setFilterScope] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    setLoading(true);
    try {
      const res = await api.configGetAuditLog({
        limit: 200,
      }) as { logs: AuditLog[] };
      setLogs(res.logs || []);
    } catch {
      toast('error', '加载审计日志失败');
    } finally {
      setLoading(false);
    }
  }

  async function searchLogs() {
    setLoading(true);
    try {
      const res = await api.configGetAuditLog({
        configKey: searchKey || undefined,
        scope: filterScope || undefined,
        limit: 200,
      }) as { logs: AuditLog[] };
      setLogs(res.logs || []);
    } catch {
      toast('error', '搜索日志失败');
    } finally {
      setLoading(false);
    }
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  function truncateValue(val: string | undefined, maxLen = 80): string {
    if (!val) return '(空)';
    if (val.length <= maxLen) return val;
    return val.substring(0, maxLen) + '...';
  }

  const filteredLogs = logs;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">配置变更审计</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          追踪所有配置修改历史，支持按配置项和作用域过滤
        </p>
      </div>

      {/* Search / filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            placeholder="搜索配置 key..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:bg-slate-700 dark:text-slate-100"
            onKeyDown={(e) => e.key === 'Enter' && searchLogs()}
          />
        </div>
        <select
          value={filterScope}
          onChange={(e) => setFilterScope(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:bg-slate-700 dark:text-slate-100"
        >
          <option value="">所有作用域</option>
          <option value="global">全局</option>
          <option value="plan">套餐</option>
          <option value="template">模板</option>
          <option value="group">分组</option>
          <option value="device">设备</option>
        </select>
        <button
          onClick={searchLogs}
          className="flex items-center gap-1.5 px-3 py-2 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
        >
          <Filter size={14} /> 过滤
        </button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
        <Clock size={14} />
        <span>共 {filteredLogs.length} 条变更记录</span>
      </div>

      {/* Log list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 py-20 text-center text-gray-400 dark:text-slate-500 text-sm">
          暂无变更记录
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
          {filteredLogs.map((log) => (
            <div key={log.id}>
              <button
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                className="w-full px-5 py-4 hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition-colors text-left"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 dark:text-slate-100 font-mono">
                        {log.configKey || '(已删除)'}
                      </span>
                      <ConfigScopeBadge
                        scope={log.scope as any}
                        sourceId={log.scopeId}
                      />
                      {log.changeReason && (
                        <span className="text-[10px] bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 rounded px-1.5 py-0.5">
                          {log.changeReason}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500 dark:text-slate-400">
                      <span>{formatTime(log.changedAt)}</span>
                      {log.ipAddress && (
                        <>
                          <span>·</span>
                          <Globe size={10} />
                          <span className="font-mono">{log.ipAddress}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 dark:text-slate-500">
                    {expandedId === log.id ? '收起' : '详情'}
                  </div>
                </div>

                {/* Expanded detail */}
                {expandedId === log.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700 space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-2 bg-red-50 rounded-lg">
                        <p className="text-[10px] text-red-500 font-medium mb-1">旧值</p>
                        <p className="text-xs text-gray-700 dark:text-slate-300 break-all font-mono">
                          {truncateValue(log.oldValue, 200)}
                        </p>
                      </div>
                      <div className="p-2 bg-green-50 rounded-lg">
                        <p className="text-[10px] text-green-600 font-medium mb-1">新值</p>
                        <p className="text-xs text-gray-700 dark:text-slate-300 break-all font-mono">
                          {truncateValue(log.newValue, 200)}
                        </p>
                      </div>
                    </div>
                    {log.oldValue && log.newValue && log.oldValue.length < 200 && log.newValue.length < 200 && (
                      <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-slate-500">
                        <span className="text-red-400 line-through">{log.oldValue}</span>
                        <ArrowRight size={10} />
                        <span className="text-green-600">{log.newValue}</span>
                      </div>
                    )}
                  </div>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
