import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';
import InfraStatusCard from '../components/InfraStatusCard';
import FeatureFlagToggle from '../components/FeatureFlagToggle';
import {
  Server, Database, Radio, Wifi, Shield, HardDrive,
  Play, Pause, Trash2, Zap, Activity, Clock, Cpu,
  Smartphone, ListTodo, Box, Antenna, Monitor, Search,
  Download,
} from 'lucide-react';

interface HealthData {
  status: string;
  uptime: number;
  devicesOnline: number;
  mode: string;
  version?: string;
}

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

let logIdCounter = 0;

export default function SystemControlPanel() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logPaused, setLogPaused] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const devices = useStore(s => s.devices);
  const loadDevices = useStore(s => s.loadDevices);
  const infraStatus = useStore(s => s.infraStatus);
  const loadInfraStatus = useStore(s => s.loadInfraStatus);
  const featureFlags = useStore(s => s.featureFlags);
  const loadFeatureFlags = useStore(s => s.loadFeatureFlags);
  const toggleFeatureFlag = useStore(s => s.toggleFeatureFlag);

  const activeTaskCount = devices.filter(d => d.status === 'busy').length;

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    const entry: LogEntry = {
      id: ++logIdCounter,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      level,
      message,
    };
    setLogs(prev => {
      const next = [...prev, entry];
      return next.length > 50 ? next.slice(-50) : next;
    });
  }, []);

  const handleWsMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case 'device_online':
        addLog('info', `设备上线: ${msg.deviceId}`);
        break;
      case 'device_offline':
        addLog('warn', `设备离线: ${msg.deviceId} (${msg.reason || '未知原因'})`);
        break;
      case 'task_status_update':
        addLog('info', `任务状态: ${msg.taskId} → ${msg.status}`);
        break;
      case 'config_update':
        addLog('debug', `配置更新: ${msg.configKey} (scope=${msg.scope})`);
        break;
      case 'alert_notification':
        addLog('warn', `告警: [${msg.alertType}] ${msg.title}`);
        break;
    }
  }, [addLog]);

  const { connectionState } = useWebSocket(handleWsMessage);

  useEffect(() => {
    loadDevices();
    addLog('info', `WebSocket ${connectionState === 'connected' ? '已连接' : connectionState}`);
  }, []);

  useEffect(() => {
    addLog('debug', `WebSocket 状态: ${connectionState}`);
  }, [connectionState]);

  useEffect(() => {
    setHealthLoading(true);
    setHealthError('');
    api.health()
      .then((data: HealthData) => {
        setHealth(data);
        addLog('info', `健康检查通过 (mode=${data.mode}, devices=${data.devicesOnline})`);
      })
      .catch((err: any) => {
        setHealthError(err.message || '无法连接服务器');
        addLog('error', `健康检查失败: ${err.message}`);
      })
      .finally(() => setHealthLoading(false));

    loadInfraStatus();
    loadFeatureFlags();
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const clearLogs = () => setLogs([]);

  const isHealthy = health?.status === 'ok';

  const statsCards = [
    {
      label: '服务状态',
      value: healthLoading ? '...' : healthError ? '异常' : isHealthy ? '正常' : '异常',
      icon: Activity,
      color: healthLoading ? 'text-gray-400' : healthError || !isHealthy ? 'text-red-500' : 'text-green-500',
      bg: healthLoading ? 'bg-gray-50 dark:bg-slate-800' : healthError || !isHealthy ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20',
    },
    {
      label: '在线设备',
      value: String(devices.filter(d => d.status === 'online').length),
      icon: Smartphone,
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: '活跃任务',
      value: String(activeTaskCount),
      icon: ListTodo,
      color: 'text-amber-500',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
    },
    {
      label: '连接状态',
      value: connectionState === 'connected' ? '已连接' : connectionState === 'connecting' ? '连接中' : '断开',
      icon: Radio,
      color: connectionState === 'connected' ? 'text-green-500' : connectionState === 'connecting' ? 'text-amber-500' : 'text-red-500',
      bg: connectionState === 'connected' ? 'bg-green-50 dark:bg-green-900/20' : connectionState === 'connecting' ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-red-50 dark:bg-red-900/20',
    },
  ];

  const INFRA_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    control_server: Server,
    postgresql: Database,
    redis: Zap,
    nats: Antenna,
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">服务控制面板</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          实时监控服务状态、在线设备、活跃任务与系统日志
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((card, i) => (
          <div
            key={card.label}
            className={`rounded-xl border border-gray-200 dark:border-slate-700 p-4 ${card.bg} animate-scale-in`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <card.icon size={16} className={card.color} />
              <span className="text-xs text-gray-500 dark:text-slate-400">{card.label}</span>
            </div>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Uptime + Mode bar */}
      {health && (
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
          <span className="flex items-center gap-1"><Clock size={12} /> 运行时间: {formatUptime(health.uptime)}</span>
          <span className="flex items-center gap-1"><Cpu size={12} /> 模式: {health.mode || 'production'}</span>
          {health.version && <span className="flex items-center gap-1"><HardDrive size={12} /> 版本: {health.version}</span>}
        </div>
      )}

      {/* Infrastructure Status Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">基础设施状态</h2>
          <button
            onClick={loadInfraStatus}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            刷新
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {infraStatus ? (
            Object.entries(infraStatus).map(([key, svc]) => {
              const Icon = INFRA_ICONS[key] || Shield;
              return (
                <InfraStatusCard
                  key={key}
                  name={INFRA_NAMES[key] || key}
                  icon={Icon}
                  connected={svc.connected}
                  info={svc.info}
                />
              );
            })
          ) : (
            <p className="col-span-full text-xs text-gray-400 dark:text-slate-500 text-center py-4">
              加载基础设施状态中...
            </p>
          )}
        </div>
      </div>

      {/* Feature Flags */}
      {featureFlags && Object.keys(featureFlags).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">功能开关</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(featureFlags).map(([key, flag]) => (
              <FeatureFlagToggle
                key={key}
                flagKey={key}
                displayName={flag.displayName || key}
                enabled={flag.enabled}
                source={flag.source}
                categoryKey={flag.categoryKey}
                readOnly={flag.source === 'env'}
                onToggle={toggleFeatureFlag}
              />
            ))}
          </div>
        </div>
      )}

      {/* Log Stream */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">实时日志</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLogPaused(!logPaused)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors ${
                logPaused
                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                  : 'bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-600'
              }`}
            >
              {logPaused ? <Play size={12} /> : <Pause size={12} />}
              {logPaused ? '继续' : '暂停'}
            </button>
            <button
              onClick={clearLogs}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
            >
              <Trash2 size={12} /> 清空
            </button>
          </div>
        </div>
        <div className="bg-slate-900 dark:bg-slate-950 rounded-xl border border-slate-700 p-4 h-64 overflow-y-auto font-mono text-xs leading-relaxed">
          {logs.length === 0 ? (
            <p className="text-slate-500 text-center mt-20">等待日志...</p>
          ) : (
            logs.map(entry => (
              <div key={entry.id} className="flex gap-2 animate-fade-in">
                <span className="text-slate-500 shrink-0">{entry.timestamp}</span>
                <span className={`shrink-0 w-10 text-right ${
                  entry.level === 'error' ? 'text-red-400' :
                  entry.level === 'warn' ? 'text-amber-400' :
                  entry.level === 'debug' ? 'text-slate-500' :
                  'text-blue-400'
                }`}>[{entry.level}]</span>
                <span className={`${
                  entry.level === 'error' ? 'text-red-300' :
                  entry.level === 'warn' ? 'text-amber-300' :
                  'text-slate-300'
                }`}>{entry.message}</span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
