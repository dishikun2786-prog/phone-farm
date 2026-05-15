import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';
import { toast } from '../hooks/useToast';
import InfraStatusCard from '../components/InfraStatusCard';
import FeatureFlagToggle from '../components/FeatureFlagToggle';
import {
  Server, Database, Radio, Wifi, Shield, HardDrive,
  Play, Pause, Trash2, Zap, Activity, Clock, Cpu,
  Smartphone, ListTodo, Box, Antenna, Monitor, Search,
  Download, Bot, Eye, EyeOff, Save, Loader2, AlertCircle,
  CheckCircle2, Settings, RotateCw,
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

  // ── GUI-Plus Configuration State ──
  const [guiPlusExpanded, setGuiPlusExpanded] = useState(false);
  const [guiPlusEnabled, setGuiPlusEnabled] = useState(false);
  const [guiPlusApiKey, setGuiPlusApiKey] = useState('');
  const [guiPlusModel, setGuiPlusModel] = useState('gui-plus-2026-02-26');
  const [guiPlusApiUrl, setGuiPlusApiUrl] = useState('https://dashscope.aliyuncs.com/compatible-mode/v1');
  const [guiPlusMaxSteps, setGuiPlusMaxSteps] = useState(30);
  const [guiPlusMaxTokens, setGuiPlusMaxTokens] = useState(32768);
  const [guiPlusTemperature, setGuiPlusTemperature] = useState(0.1);
  const [guiPlusCoordScale, setGuiPlusCoordScale] = useState(1000);
  const [guiPlusVlHighRes, setGuiPlusVlHighRes] = useState(true);
  const [showGuiPlusApiKey, setShowGuiPlusApiKey] = useState(false);
  const [guiPlusSaving, setGuiPlusSaving] = useState(false);
  const [guiPlusTesting, setGuiPlusTesting] = useState(false);
  const [guiPlusTestResult, setGuiPlusTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [guiPlusLoaded, setGuiPlusLoaded] = useState(false);

  const loadGuiPlusConfig = useCallback(async () => {
    try {
      const cfg: Record<string, any> = await api.getSystemConfig();
      setGuiPlusEnabled(cfg['ff.gui_plus'] === 'true' || cfg['ff.gui_plus'] === true);
      setGuiPlusApiKey(cfg['ai.gui_plus.api_key'] || '');
      setGuiPlusModel(cfg['ai.gui_plus.model'] || 'gui-plus-2026-02-26');
      setGuiPlusApiUrl(cfg['ai.gui_plus.api_url'] || 'https://dashscope.aliyuncs.com/compatible-mode/v1');
      setGuiPlusMaxSteps(Number(cfg['ai.gui_plus.max_steps'] || 30));
      setGuiPlusMaxTokens(Number(cfg['ai.gui_plus.max_tokens'] || 32768));
      setGuiPlusTemperature(Number(cfg['ai.gui_plus.temperature'] || 0.1));
      setGuiPlusCoordScale(Number(cfg['ai.gui_plus.coordinate_scale'] || 1000));
      setGuiPlusVlHighRes(cfg['ai.gui_plus.vl_high_resolution'] !== 'false' && cfg['ai.gui_plus.vl_high_resolution'] !== false);
      setGuiPlusLoaded(true);
    } catch {
      setGuiPlusLoaded(true); // show defaults even if load fails
    }
  }, []);

  const saveGuiPlusConfig = async () => {
    setGuiPlusSaving(true);
    try {
      const updates: [string, string][] = [
        ['ai.gui_plus.api_url', guiPlusApiUrl],
        ['ai.gui_plus.model', guiPlusModel],
        ['ai.gui_plus.max_steps', String(guiPlusMaxSteps)],
        ['ai.gui_plus.max_tokens', String(guiPlusMaxTokens)],
        ['ai.gui_plus.temperature', String(guiPlusTemperature)],
        ['ai.gui_plus.coordinate_scale', String(guiPlusCoordScale)],
        ['ai.gui_plus.vl_high_resolution', String(guiPlusVlHighRes)],
      ];
      if (guiPlusApiKey) {
        updates.push(['ai.gui_plus.api_key', guiPlusApiKey]);
      }
      // Save feature flag
      await api.toggleFeatureFlag('ff.gui_plus', true);
      // Save all config values
      await Promise.all(updates.map(([k, v]) => api.updateSystemConfig(k, v)));
      addLog('info', 'GUI-Plus 配置已保存');
      toast('success', 'GUI-Plus 配置已保存');
    } catch (err: any) {
      addLog('error', `GUI-Plus 配置保存失败: ${err.message}`);
      toast('error', `保存失败: ${err.message}`);
    } finally {
      setGuiPlusSaving(false);
    }
  };

  const testGuiPlusConnection = async () => {
    setGuiPlusTesting(true);
    setGuiPlusTestResult(null);
    try {
      // Test DashScope API connectivity for GUI-Plus
      const response = await fetch(guiPlusApiUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${guiPlusApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: guiPlusModel,
          messages: [{ role: 'user', content: 'reply "ok"' }],
          max_tokens: 10,
        }),
      });
      if (response.ok) {
        const latency = Date.now();
        setGuiPlusTestResult({ success: true, message: `连接成功 (HTTP ${response.status})` });
        addLog('info', `GUI-Plus 连接测试通过 (${guiPlusModel})`);
      } else {
        const errBody = await response.text().catch(() => '');
        setGuiPlusTestResult({ success: false, message: `HTTP ${response.status}: ${errBody.slice(0, 100)}` });
        addLog('warn', `GUI-Plus 连接测试失败: HTTP ${response.status}`);
      }
    } catch (err: any) {
      setGuiPlusTestResult({ success: false, message: `连接失败: ${err.message}` });
      addLog('error', `GUI-Plus 连接测试异常: ${err.message}`);
    } finally {
      setGuiPlusTesting(false);
    }
  }



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
    loadGuiPlusConfig();
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

      {/* GUI-Plus Configuration */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <button
          onClick={() => { if (!guiPlusExpanded && !guiPlusLoaded) loadGuiPlusConfig(); setGuiPlusExpanded(!guiPlusExpanded); }}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-orange-600" />
            <span className="font-medium text-gray-900 dark:text-slate-100 text-sm">
              阿里云百炼 GUI-Plus 配置
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              guiPlusEnabled
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
            }`}>
              {guiPlusEnabled ? '已启用' : '未启用'}
            </span>
          </div>
          <Settings size={16} className={`text-gray-400 transition-transform ${guiPlusExpanded ? 'rotate-90' : ''}`} />
        </button>

        {guiPlusExpanded && (
          <div className="p-4 pt-0 border-t border-gray-100 dark:border-slate-700">
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4 mt-4">
              GUI-Plus 是阿里云百炼推出的 GUI 自动化视觉模型，支持手机端 (mobile_use) 和电脑端 (computer_use) 操作。
              使用前需在阿里云百炼控制台开通服务并获取北京地域 API Key。
            </p>

            {/* Enable Toggle */}
            <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">启用 GUI-Plus</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">开启后将在 AI 自动化任务中可用</p>
              </div>
              <button
                onClick={async () => {
                  try {
                    await api.toggleFeatureFlag('ff.gui_plus', !guiPlusEnabled);
                    setGuiPlusEnabled(!guiPlusEnabled);
                    addLog('info', `GUI-Plus ${!guiPlusEnabled ? '已启用' : '已禁用'}`);
                  } catch (err: any) {
                    toast('error', `切换失败: ${err.message}`);
                  }
                }}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  guiPlusEnabled ? 'bg-orange-500' : 'bg-gray-300 dark:bg-slate-600'
                }`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  guiPlusEnabled ? 'translate-x-5.5 left-0.5' : 'left-0.5'
                }`} />
              </button>
            </div>

            {/* API Key */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                API Key <span className="text-gray-400 dark:text-slate-500">(DashScope 北京地域)</span>
              </label>
              <div className="relative">
                <input
                  type={showGuiPlusApiKey ? 'text' : 'password'}
                  value={guiPlusApiKey}
                  onChange={e => setGuiPlusApiKey(e.target.value)}
                  placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 pr-9 focus:ring-2 focus:ring-orange-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowGuiPlusApiKey(!showGuiPlusApiKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                >
                  {showGuiPlusApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Model + API URL */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">模型选择</label>
                <select
                  value={guiPlusModel}
                  onChange={e => setGuiPlusModel(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500"
                >
                  <option value="gui-plus-2026-02-26">GUI-Plus 2026-02-26 (推荐·思考模式)</option>
                  <option value="gui-plus">GUI-Plus (非思考模式)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">API 端点</label>
                <input
                  type="text"
                  value={guiPlusApiUrl}
                  onChange={e => setGuiPlusApiUrl(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 font-mono focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            {/* Max Steps + Max Tokens */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                  最大步数: <span className="text-orange-600 font-semibold">{guiPlusMaxSteps}</span>
                </label>
                <input
                  type="range"
                  value={guiPlusMaxSteps}
                  onChange={e => setGuiPlusMaxSteps(Number(e.target.value))}
                  min={1} max={100} step={1}
                  className="w-full accent-orange-500"
                />
                <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500">
                  <span>1</span><span>100</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Max Tokens: <span className="text-orange-600 font-semibold">{guiPlusMaxTokens.toLocaleString()}</span>
                </label>
                <input
                  type="range"
                  value={guiPlusMaxTokens}
                  onChange={e => setGuiPlusMaxTokens(Number(e.target.value))}
                  min={256} max={32768} step={256}
                  className="w-full accent-orange-500"
                />
                <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500">
                  <span>256</span><span>32,768</span>
                </div>
              </div>
            </div>

            {/* Temperature + Coordinate Scale */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Temperature: <span className="text-orange-600 font-semibold">{guiPlusTemperature.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  value={guiPlusTemperature}
                  onChange={e => setGuiPlusTemperature(Number(e.target.value))}
                  min={0} max={1} step={0.05}
                  className="w-full accent-orange-500"
                />
                <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500">
                  <span>0</span><span>1.0</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">坐标归一化分辨率</label>
                <input
                  type="number"
                  value={guiPlusCoordScale}
                  onChange={e => setGuiPlusCoordScale(Number(e.target.value))}
                  min={500} max={2000} step={100}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500"
                />
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                  默认 1000×1000，需根据截图分辨率调整映射
                </p>
              </div>
            </div>

            {/* VL High Resolution Toggle */}
            <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">高分辨率图像</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">VL 高分辨率模式，需设置 vl_high_resolution_images=true（推荐开启）</p>
              </div>
              <button
                onClick={() => setGuiPlusVlHighRes(!guiPlusVlHighRes)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  guiPlusVlHighRes ? 'bg-orange-500' : 'bg-gray-300 dark:bg-slate-600'
                }`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  guiPlusVlHighRes ? 'translate-x-5.5 left-0.5' : 'left-0.5'
                }`} />
              </button>
            </div>

            {/* Test Result */}
            {guiPlusTestResult && (
              <div className={`text-sm rounded-lg px-3 py-2 mb-4 ${
                guiPlusTestResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'
              }`}>
                <span className="inline-flex items-center gap-1">
                  {guiPlusTestResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {guiPlusTestResult.message}
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-slate-700">
              <button
                onClick={saveGuiPlusConfig}
                disabled={guiPlusSaving}
                className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {guiPlusSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                保存配置
              </button>
              <button
                onClick={testGuiPlusConnection}
                disabled={guiPlusTesting || !guiPlusApiKey}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {guiPlusTesting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                测试连接
              </button>
              <button
                onClick={() => { loadGuiPlusConfig(); toast('info', '已重新加载配置'); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-slate-400 rounded-lg text-sm transition-colors"
              >
                <RotateCw size={14} />
              </button>
            </div>

            {/* Info box */}
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-400">
              <p className="font-medium mb-1">使用说明</p>
              <ul className="space-y-0.5 text-blue-600 dark:text-blue-400">
                <li>· 需在阿里云百炼控制台开通 GUI-Plus 服务（北京地域）</li>
                <li>· 手机端通过 ADB 连接，输出 mobile_use 操作指令</li>
                <li>· 电脑端支持 Windows 桌面自动化，输出 computer_use 操作指令</li>
                <li>· 模型输出坐标基于归一化分辨率，执行前需映射到屏幕实际尺寸</li>
                <li>· 推荐使用 GUI-Plus 2026-02-26 思考模式，效果更优</li>
                <li>· 定价: 输入 1.5元/百万Token，输出 4.5元/百万Token</li>
              </ul>
            </div>
          </div>
        )}
      </div>

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
