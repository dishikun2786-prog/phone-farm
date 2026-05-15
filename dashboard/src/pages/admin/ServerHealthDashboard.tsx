import { useState, useEffect, useRef } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { Server, Wifi, Clock, Activity, RefreshCw, HardDrive, Radio } from 'lucide-react';

interface ServiceHealth {
  // Control Server
  controlStatus: string;
  controlUptime: number;
  controlVersion: string;
  devicesOnline: number;
  bridgeEnabled: boolean;
  // Relay Server
  relayStatus: string;
  relayUptime: number;
  controlConnected: boolean;
  activePhones: number;
  activeFrontends: number;
}

function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export default function ServerHealthDashboard() {
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadHealth() {
    try {
      const [ctrl, relay] = await Promise.all([
        api.request('/health').catch(() => null),
        api.request('/relay/stats').catch(() => null),
      ]);

      setHealth({
        controlStatus: ctrl?.status || 'unknown',
        controlUptime: ctrl?.uptime || 0,
        controlVersion: ctrl?.version || '—',
        devicesOnline: ctrl?.devicesOnline ?? 0,
        bridgeEnabled: ctrl?.bridge?.enabled ?? false,
        relayStatus: relay ? 'ok' : 'unknown',
        relayUptime: relay?.uptime ?? 0,
        controlConnected: relay?.controlConnected ?? false,
        activePhones: relay?.activePhones ?? 0,
        activeFrontends: relay?.activeFrontends ?? 0,
      });
      setError('');
    } catch {
      // silent on interval
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHealth();
    if (autoRefresh) {
      intervalRef.current = setInterval(loadHealth, 5000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, loadHealth]);

  if (loading && !health) {
    return (
      <PageWrapper title="服务健康监控">
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={24} className="animate-spin text-gray-400" />
          <span className="ml-2 text-gray-400">加载服务状态...</span>
        </div>
      </PageWrapper>
    );
  }

  if (!health) {
    return (
      <PageWrapper title="服务健康监控">
        <div className="text-center py-16 text-gray-400">
          <Server size={40} className="mx-auto mb-3 text-red-400" />
          <p className="text-lg font-medium text-red-500">无法获取服务状态</p>
          <p className="text-sm mt-1">请检查 VPS 服务器是否在线</p>
          <button onClick={loadHealth} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
            重新加载
          </button>
        </div>
      </PageWrapper>
    );
  }

  const allServicesOk = health.controlStatus === 'ok' && health.relayStatus === 'ok';
  const totalWsConnections = health.activePhones + health.activeFrontends + 1; // +1 for bridge if connected

  return (
    <PageWrapper title="服务健康监控">
      {/* Refresh controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full animate-pulse ${allServicesOk ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
            {allServicesOk ? '所有服务正常运行' : '部分服务异常'}
          </span>
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoRefresh ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoRefresh ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
          <span className="text-xs text-gray-400">{autoRefresh ? '自动 5s' : '手动'}</span>
        </div>
        <button onClick={loadHealth} className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      {/* Service Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Control Server */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Server size={18} className={health.controlStatus === 'ok' ? 'text-green-500' : 'text-red-500'} />
              <h3 className="font-semibold text-sm">Control Server</h3>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${health.controlStatus === 'ok' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700'}`}>
              {health.controlStatus === 'ok' ? '运行中' : '异常'}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">版本</span>
              <span className="font-mono text-gray-900 dark:text-slate-200">{health.controlVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">运行时间</span>
              <span className="text-gray-900 dark:text-slate-200">{formatUptime(health.controlUptime)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">在线设备</span>
              <span className="text-gray-900 dark:text-slate-200">{health.devicesOnline} 台</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">Bridge 模式</span>
              <span className={health.bridgeEnabled ? 'text-green-600' : 'text-gray-400'}>
                {health.bridgeEnabled ? '已启用' : '未启用'}
              </span>
            </div>
          </div>
        </div>

        {/* Relay Server */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Radio size={18} className={health.relayStatus === 'ok' ? 'text-green-500' : 'text-red-500'} />
              <h3 className="font-semibold text-sm">Relay Server</h3>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${health.relayStatus === 'ok' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700'}`}>
              {health.relayStatus === 'ok' ? '运行中' : '异常'}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">运行时间</span>
              <span className="text-gray-900 dark:text-slate-200">{formatUptime(health.relayUptime)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">控制端连接</span>
              <span className={health.controlConnected ? 'text-green-600' : 'text-gray-400'}>
                {health.controlConnected ? '已连接' : '无连接'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">活跃手机隧道</span>
              <span className="text-gray-900 dark:text-slate-200">{health.activePhones} 台</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">活跃前端隧道</span>
              <span className="text-gray-900 dark:text-slate-200">{health.activeFrontends} 个</span>
            </div>
          </div>
        </div>
      </div>

      {/* Connection Summary */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-green-600 mb-1"><Wifi size={16} /><span className="text-xs">设备直连</span></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{health.devicesOnline}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-blue-600 mb-1"><Wifi size={16} /><span className="text-xs">中继设备</span></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{health.activePhones}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-purple-600 mb-1"><Activity size={16} /><span className="text-xs">前端会话</span></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{health.activeFrontends}</div>
        </div>
      </div>

      {/* Status Overview */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <HardDrive size={16} className="text-gray-400" />
          系统状态总览
        </h3>
        <div className="space-y-2">
          {[
            { label: 'Control Server :8443', ok: health.controlStatus === 'ok', detail: `v${health.controlVersion} · ${formatUptime(health.controlUptime)}` },
            { label: 'Relay Server :8499', ok: health.relayStatus === 'ok', detail: `${formatUptime(health.relayUptime)}` },
            { label: 'UDP Relay :8444', ok: health.relayStatus === 'ok', detail: health.relayStatus === 'ok' ? '内嵌运行' : '未知' },
            { label: 'HTTPS (Caddy) :443', ok: health.controlStatus === 'ok', detail: 'SSL · Cloudflare Origin CA' },
            { label: 'PostgreSQL 18 :5432', ok: health.controlStatus === 'ok', detail: 'phonefarm 库 9 表' },
            { label: '设备入站 (wss:///ws/device)', ok: health.controlStatus === 'ok', detail: `${health.devicesOnline} 台在线` },
            { label: '中继入站 (wss:///ws/phone)', ok: health.relayStatus === 'ok', detail: health.activePhones > 0 ? `${health.activePhones} 台` : '待机中' },
            { label: '控制隧道 (wss:///ws/control)', ok: health.controlConnected, detail: health.controlConnected ? '已建立' : '无连接 (Thin Client 模式)' },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
              <span className="text-sm text-gray-600 dark:text-slate-400">{item.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 dark:text-slate-500">{item.detail}</span>
                <span className={`w-2 h-2 rounded-full ${item.ok ? 'bg-green-500' : 'bg-yellow-500'}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageWrapper>
  );
}
