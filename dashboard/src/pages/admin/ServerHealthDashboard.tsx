import { useState, useEffect, useRef } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import { Cpu, HardDrive, Wifi, WifiOff, Activity, Clock, BarChart3 } from 'lucide-react';

interface ServerHealth {
  cpuPercent: number;
  memoryMb: { used: number; total: number };
  wsConnections: { devices: number; frontends: number };
  messagesPerMin: number;
  uptimeSeconds: number;
}

export default function ServerHealthDashboard() {
  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadHealth();
    if (autoRefresh) {
      intervalRef.current = setInterval(loadHealth, 5000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh]);

  async function loadHealth() {
    try {
      const res = await api.request('/health') as ServerHealth;
      setHealth(res);
    } catch { /* silent on interval */ } finally { setLoading(false); }
  }

  function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
  }

  if (loading && !health) return <PageWrapper title="服务健康"><p className="text-gray-400 text-center py-12">加载中...</p></PageWrapper>;
  if (!health) return <PageWrapper title="服务健康"><p className="text-gray-400 text-center py-12">无法获取服务状态</p></PageWrapper>;

  const memPercent = health.memoryMb.total > 0 ? (health.memoryMb.used / health.memoryMb.total * 100) : 0;

  return (
    <PageWrapper title="服务健康监控">
      {/* Auto-refresh toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">自动刷新</span>
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoRefresh ? 'bg-blue-600' : 'bg-gray-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoRefresh ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
          <span className="text-xs text-gray-400">{autoRefresh ? '5s' : '已暂停'}</span>
        </div>
        <button onClick={loadHealth} className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
          <Activity size={14} /> 刷新
        </button>
      </div>

      {/* Health Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-1"><Cpu size={14} /><span className="text-xs">CPU 使用率</span></div>
          <div className="text-2xl font-bold text-gray-900">{health.cpuPercent.toFixed(1)}%</div>
          <div className="mt-2 w-full bg-gray-100 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(health.cpuPercent, 100)}%` }} />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-1"><HardDrive size={14} /><span className="text-xs">内存使用</span></div>
          <div className="text-2xl font-bold text-gray-900">{health.memoryMb.used} MB</div>
          <div className="text-xs text-gray-400">{health.memoryMb.total} MB · {(memPercent).toFixed(1)}%</div>
          <div className="mt-2 w-full bg-gray-100 rounded-full h-2">
            <div className={`h-2 rounded-full transition-all ${memPercent > 80 ? 'bg-red-500' : memPercent > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(memPercent, 100)}%` }} />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-1"><Clock size={14} /><span className="text-xs">运行时间</span></div>
          <div className="text-2xl font-bold text-gray-900">{formatUptime(health.uptimeSeconds)}</div>
          <div className="text-xs text-gray-400">自上次重启</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {/* WebSocket Connections */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-sm mb-3">WebSocket 连接数</h3>
          <div className="flex items-center justify-around">
            <div className="text-center">
              <div className="flex items-center gap-2 text-green-600 mb-1"><Wifi size={16} /><span className="text-xs">设备连接</span></div>
              <div className="text-3xl font-bold text-gray-900">{health.wsConnections.devices}</div>
            </div>
            <div className="w-px h-12 bg-gray-200" />
            <div className="text-center">
              <div className="flex items-center gap-2 text-blue-600 mb-1"><Wifi size={16} /><span className="text-xs">前端连接</span></div>
              <div className="text-3xl font-bold text-gray-900">{health.wsConnections.frontends}</div>
            </div>
          </div>
        </div>

        {/* Message Throughput */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-sm mb-3">消息吞吐</h3>
          <div className="flex items-center justify-around">
            <div className="text-center">
              <div className="flex items-center gap-2 text-purple-600 mb-1"><BarChart3 size={16} /><span className="text-xs">每分钟</span></div>
              <div className="text-3xl font-bold text-gray-900">{health.messagesPerMin}</div>
              <div className="text-xs text-gray-400">条消息</div>
            </div>
            <div className="w-px h-12 bg-gray-200" />
            <div className="text-center">
              <div className="flex items-center gap-2 text-orange-600 mb-1"><Activity size={16} /><span className="text-xs">每秒约</span></div>
              <div className="text-3xl font-bold text-gray-900">{(health.messagesPerMin / 60).toFixed(1)}</div>
              <div className="text-xs text-gray-400">条消息</div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-sm mb-3">系统状态总览</h3>
        <div className="space-y-2">
          {[
            { label: '进程 PID', value: '—', ok: true },
            { label: 'Node.js 版本', value: process.env.NODE_ENV || '—', ok: true },
            { label: 'PostgreSQL', value: '—', ok: true },
            { label: 'Redis', value: '—', ok: health.wsConnections.devices > 0 },
            { label: '设备连接', value: health.wsConnections.devices > 0 ? `${health.wsConnections.devices} 台在线` : '无设备在线', ok: health.wsConnections.devices > 0 },
            { label: '前端连接', value: health.wsConnections.frontends > 0 ? `${health.wsConnections.frontends} 个会话` : '无前端连接', ok: true },
            { label: '内存使用', value: `${health.memoryMb.used}/${health.memoryMb.total} MB`, ok: memPercent < 80 },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">
              <span className="text-sm text-gray-600">{item.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{item.value}</span>
                <span className={`w-2 h-2 rounded-full ${item.ok ? 'bg-green-500' : 'bg-red-500'}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageWrapper>
  );
}
