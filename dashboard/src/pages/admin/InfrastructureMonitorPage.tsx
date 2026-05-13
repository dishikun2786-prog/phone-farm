import { useState, useEffect, useRef } from 'react';
import PageWrapper from '../../components/PageWrapper';
import InfraStatusCard from '../../components/InfraStatusCard';
import { useStore } from '../../store';
import {
  RefreshCw, Play, Pause, Server, Database, Zap, Wifi,
  Box, Cpu, Radio, Shield,
} from 'lucide-react';

const INFRA_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  control_server: Server,
  postgresql: Database,
  redis: Zap,
  nats: Radio,
  minio: Box,
  ray: Cpu,
  webrtc: Wifi,
  websocket: Radio,
};

const INFRA_NAMES: Record<string, string> = {
  control_server: 'Control Server',
  postgresql: 'PostgreSQL',
  redis: 'Redis',
  nats: 'NATS',
  minio: 'MinIO',
  ray: 'Ray',
  webrtc: 'WebRTC',
  websocket: 'WebSocket Hub',
};

const INFRA_DESCRIPTIONS: Record<string, string> = {
  control_server: '核心控制服务 — API 路由、WebSocket 连接管理',
  postgresql: '关系型数据库 — 设备、任务、用户等持久化存储',
  redis: '内存缓存与队列 — BullMQ 任务调度',
  nats: 'NATS 消息队列 — 分布式设备状态同步',
  minio: 'MinIO 对象存储 — 截屏、日志、AI 模型文件',
  ray: 'Ray 分布式计算 — AI 任务调度与执行',
  webrtc: 'WebRTC 信令 — P2P 音视频连接',
  websocket: 'WebSocket Hub — 实时设备与前端通信',
};

export default function InfrastructureMonitorPage() {
  const infraStatus = useStore(s => s.infraStatus);
  const infraLoading = useStore(s => s.infraStatusLoading);
  const infraError = useStore(s => s.infraStatusError);
  const loadInfraStatus = useStore(s => s.loadInfraStatus);

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    await loadInfraStatus();
    setLastRefresh(Date.now());
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(refresh, 15000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh]);

  const services = infraStatus ? Object.entries(infraStatus) : [];
  const onlineCount = services.filter(([, s]) => s.connected).length;

  return (
    <PageWrapper loading={infraLoading && !infraStatus} error={infraError}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">基础设施监控</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              实时监控所有基础设施服务的连接状态与健康指标
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                autoRefresh
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400'
              }`}
            >
              {autoRefresh ? <Pause size={14} /> : <Play size={14} />}
              {autoRefresh ? '15s 自动刷新' : '手动刷新'}
            </button>
            <button
              onClick={refresh}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors active:scale-95"
            >
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </div>

        {/* Summary Bar */}
        {infraStatus && (
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-3">
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${onlineCount === services.length ? 'bg-green-500' : onlineCount === 0 ? 'bg-red-500' : 'bg-amber-500'}`} />
              服务: {onlineCount}/{services.length} 在线
            </span>
            {lastRefresh && (
              <span>最后刷新: {new Date(lastRefresh).toLocaleTimeString('zh-CN', { hour12: false })}</span>
            )}
          </div>
        )}

        {/* Service Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {services.map(([key, svc]) => {
            const Icon = INFRA_ICONS[key] || Shield;
            const desc = INFRA_DESCRIPTIONS[key] || '';
            return (
              <div key={key} className="space-y-2">
                <InfraStatusCard
                  name={INFRA_NAMES[key] || key}
                  icon={Icon}
                  connected={svc.connected}
                  info={svc.info}
                />
                <p className="text-[11px] text-gray-400 dark:text-slate-500 px-1">{desc}</p>
              </div>
            );
          })}
        </div>

        {/* Detail Panels */}
        {infraStatus && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">详细指标</h2>
            {services.map(([key, svc]) => {
              const infoEntries = Object.entries(svc.info).filter(([, v]) => v !== undefined && v !== null);
              if (infoEntries.length === 0) return null;

              return (
                <div key={key} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    {(() => { const Icon = INFRA_ICONS[key] || Shield; return <Icon size={16} className="text-gray-400 dark:text-slate-500" />; })()}
                    <span className="text-sm font-medium text-gray-900 dark:text-slate-100">{INFRA_NAMES[key] || key}</span>
                    <span className={`w-2 h-2 rounded-full ${svc.connected ? 'bg-green-500' : 'bg-red-500'}`} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {infoEntries.map(([k, v]) => (
                      <div key={k} className="bg-gray-50 dark:bg-slate-900/50 rounded-lg p-3">
                        <p className="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                          {k.replace(/_/g, ' ')}
                        </p>
                        <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
                          {typeof v === 'boolean' ? (v ? 'true' : 'false') : typeof v === 'number' ? v.toLocaleString() : String(v)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
