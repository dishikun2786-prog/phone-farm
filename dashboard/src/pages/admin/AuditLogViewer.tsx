import { useState, useEffect } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import { Search, Download, Clock, User, Smartphone, Activity } from 'lucide-react';

interface AuditLog {
  id: string;
  deviceId: string;
  userId: string;
  action: string;
  resource: string;
  detail: string;
  ip: string;
  timestamp: number;
}

const ACTIONS = ['all', 'device.login', 'device.logout', 'task.start', 'task.stop', 'task.complete', 'task.fail', 'script.deploy', 'config.update', 'command.execute', 'activation.use', 'activation.generate', 'user.login', 'api.key_used'] as const;

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterDevice, setFilterDevice] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const pageSize = 50;

  useEffect(() => { loadLogs(); }, [filterAction, filterDevice, dateFrom, dateTo, page]);

  async function loadLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterAction !== 'all') params.set('action', filterAction);
      if (filterDevice) params.set('deviceId', filterDevice);
      if (dateFrom) params.set('from', String(new Date(dateFrom).getTime()));
      if (dateTo) params.set('to', String(new Date(dateTo + 'T23:59:59').getTime()));
      params.set('limit', String(pageSize));
      params.set('offset', String(page * pageSize));

      const res = await api.request(`/audit-logs?${params.toString()}`) as { logs: AuditLog[]; total: number };
      setLogs(res.logs || []);
      setTotal(res.total || 0);
    } catch { toast('error', '加载审计日志失败'); }
    finally { setLoading(false); }
  }

  function exportCSV() {
    const header = '时间,用户,设备,操作,资源,详情,IP';
    const rows = logs.map(l => [new Date(l.timestamp).toLocaleString('zh-CN'), l.userId, l.deviceId, l.action, l.resource, l.detail.replace(/,/g, '，'), l.ip].join(','));
    const csv = '﻿' + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `审计日志_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const totalPages = Math.ceil(total / pageSize);

  const ACTION_LABELS: Record<string, string> = {
    'device.login': '设备上线', 'device.logout': '设备下线', 'task.start': '任务启动', 'task.stop': '任务停止',
    'task.complete': '任务完成', 'task.fail': '任务失败', 'script.deploy': '脚本部署', 'config.update': '配置更新',
    'command.execute': '命令执行', 'activation.use': '卡密激活', 'activation.generate': '卡密生成', 'user.login': '用户登录',
    'api.key_used': 'API Key使用', 'all': '全部操作',
  };

  return (
    <PageWrapper title="审计日志">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(0); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          {ACTIONS.map(a => <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>)}
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={filterDevice} onChange={e => { setFilterDevice(e.target.value); setPage(0); }} placeholder="设备 ID..."
            className="w-40 pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
        </div>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        <span className="text-gray-400 text-sm">至</span>
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
          <Download size={14} /> 导出 CSV
        </button>
        <div className="ml-auto text-sm text-gray-500">共 {total} 条记录</div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">时间</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">操作</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">用户</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">设备</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">资源</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">详情</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">加载中...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">暂无审计日志</td></tr>
              ) : logs.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{new Date(l.timestamp).toLocaleString('zh-CN')}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">{ACTION_LABELS[l.action] || l.action}</span></td>
                  <td className="px-4 py-3 text-gray-600">{l.userId}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{l.deviceId || '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{l.resource}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs max-w-[200px] truncate">{l.detail}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{l.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <div className="text-sm text-gray-500">第 {page + 1}/{totalPages} 页</div>
            <div className="flex gap-1">{Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = i + Math.max(0, page - 3);
              if (p >= totalPages) return null;
              return <button key={p} onClick={() => setPage(p)}
                className={`w-8 h-8 rounded text-sm ${p === page ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}>{p + 1}</button>;
            })}</div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
