import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';

import { useMediaQuery } from '../hooks/useMediaQuery';
import ScrcpyPlayer from '../components/ScrcpyPlayer';
import GroupControlPanel from '../components/GroupControlPanel';
import FileTransfer from '../components/FileTransfer';
import AdbConsole from '../components/AdbConsole';
import KeyMapEditor from '../components/KeyMapEditor';
import {
  ArrowLeft, Home, CornerUpLeft, Camera, Monitor, Image, FolderOpen,
  Terminal, Keyboard, Upload, Video, VideoOff, Brain, Info,
} from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../hooks/useToast';

const QUICK_ACTIONS = [
  { action: 'home', label: 'Home', icon: Home },
  { action: 'back', label: '返回', icon: CornerUpLeft },
  { action: 'screenshot', label: '截图', icon: Camera },
];

const MOBILE_TABS = [
  { key: 'info', label: '信息', icon: Info },
  { key: 'ai', label: 'AI', icon: Brain },
  { key: 'keymap', label: '键位', icon: Keyboard },
  { key: 'files', label: '文件', icon: FolderOpen },
] as const;

type MobileTabKey = typeof MOBILE_TABS[number]['key'];

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDesktop, isMobile } = useMediaQuery();
  const devices = useStore(s => s.devices);
  const liveInfo = useStore(s => s.liveInfo);
  const sendCommand = useStore(s => s.sendCommand);
  const loadDevices = useStore(s => s.loadDevices);

  const device = devices.find(d => d.id === id);
  const live: any = (id && liveInfo[id]) || {};
  const [mirrorMode, setMirrorMode] = useState<'screenshot' | 'scrcpy'>('screenshot');
  const [infoTab, setInfoTab] = useState<'info' | 'files' | 'console' | 'keymap'>('info');
  const [mobileTab, setMobileTab] = useState<MobileTabKey>('info');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  useEffect(() => {
    loadDevices();
  }, [id]);

  const [deploying, setDeploying] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [decisionStatus, setDecisionStatus] = useState<any>(null);

  const handleQuickAction = async (action: string) => {
    if (!id) return;
    await sendCommand(id, action);
  };

  const handleToggleStream = async () => {
    if (!id) return;
    setStreamLoading(true);
    try {
      if (streaming) {
        await api.streamStop(id);
        setStreaming(false);
        toast('success', '视频流已关闭');
      } else {
        await api.streamStart(id);
        setStreaming(true);
        toast('success', '视频流已开启');
      }
    } catch (err: any) {
      toast('error', `流控失败: ${err.message || '未知错误'}`);
    }
    setStreamLoading(false);
  };

  useEffect(() => {
    if (!id) return;
    const t = setInterval(async () => {
      try {
        const status = await api.decisionStatus(id);
        setDecisionStatus(status);
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(t);
  }, [id]);

  const handleDeployScripts = async () => {
    if (!id) return;
    setDeploying(true);
    try {
      const result = await api.deployScripts(id);
      toast('success', `脚本部署已发送: v${result.version}, ${result.fileCount} 个文件`);
    } catch (err: any) {
      toast('error', '部署失败: ' + (err.message || '未知错误'));
    }
    setDeploying(false);
  };

  if (!device) {
    return (
      <div className="text-center py-20 text-gray-400 dark:text-slate-500">
        设备不存在或已离线
      </div>
    );
  }

  const screenArea = (
    <div className="flex-1 max-w-sm mx-auto">
      {/* Mode toggle */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setMirrorMode('screenshot')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            mirrorMode === 'screenshot'
              ? 'bg-gray-200 dark:bg-slate-600 text-gray-900 dark:text-slate-100'
              : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
          }`}
        >
          <Image size={12} /> 截图
        </button>
        <button
          onClick={() => setMirrorMode('scrcpy')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            mirrorMode === 'scrcpy'
              ? 'bg-purple-200 dark:bg-purple-900/30 text-purple-900 dark:text-purple-300'
              : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
          }`}
        >
          <Monitor size={12} /> 实时镜像
        </button>
      </div>

      {mirrorMode === 'screenshot' ? (
        <div className="bg-black rounded-xl overflow-hidden aspect-9/16 relative">
          {live?.screenshot ? (
            <img
              src={`data:image/jpeg;base64,${live.screenshot}`}
              alt="screen"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
              等待设备画面...
            </div>
          )}
        </div>
      ) : (
        <ScrcpyPlayer
          deviceId={id!}
          tailscaleIp={device.tailscaleIp}
          deviceWidth={device.screenWidth || 1080}
          deviceHeight={device.screenHeight || 2400}
          groupId={activeGroupId || undefined}
        />
      )}

      {/* Quick actions */}
      <div className="flex gap-2 mt-3 flex-wrap">
        {QUICK_ACTIONS.map(({ action, label, icon: Icon }) => (
          <button
            key={action}
            onClick={() => handleQuickAction(action)}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg text-xs font-medium text-gray-700 dark:text-slate-300 transition-colors active:scale-95"
          >
            <Icon size={14} /> {label}
          </button>
        ))}
        <button
          onClick={handleToggleStream}
          disabled={streamLoading}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 active:scale-95 ${
            streaming
              ? 'bg-red-100 dark:bg-red-900/20 hover:bg-red-200 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400'
              : 'bg-purple-100 dark:bg-purple-900/20 hover:bg-purple-200 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-400'
          }`}
        >
          {streaming ? <VideoOff size={14} /> : <Video size={14} />}
          {streamLoading ? '...' : streaming ? '关闭实时' : '实时画面'}
        </button>
        <button
          onClick={handleDeployScripts}
          disabled={deploying}
          className="flex items-center gap-1 px-3 py-1.5 bg-green-100 dark:bg-green-900/20 hover:bg-green-200 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 active:scale-95"
        >
          <Upload size={14} /> {deploying ? '部署中...' : '部署脚本'}
        </button>
      </div>
    </div>
  );

  const deviceInfoPanel = (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
      <h3 className="font-semibold text-gray-900 dark:text-slate-100">{device.name}</h3>
      <div className="mt-3 space-y-2 text-sm">
        <InfoRow label="型号" value={device.model || '-'} />
        <InfoRow label="Android" value={device.androidVersion || '-'} />
        <InfoRow label="IP" value={device.tailscaleIp} />
        <InfoRow label="电量" value={live?.battery != null ? `${live.battery}%` : '-'} />
        <InfoRow label="状态" value={device.status === 'online' ? '在线' : device.status === 'busy' ? '忙碌' : '离线'} />
        <InfoRow label="运行时" value={device.runtime === 'autox' ? 'AutoX v7' : device.runtime || 'DeekeScript'} />
        <InfoRow label="当前APP" value={live?.currentApp || '-'} />
      </div>
    </div>
  );

  const aiPanel = (
    <>
      {live?.taskStatus && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-2">任务状态</h3>
          <div className="text-sm space-y-1">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
              live.taskStatus === 'running'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400'
            }`}>
              {live.taskStatus === 'running' ? '执行中' : live.taskStatus}
            </span>
            {live.taskMessage && <p className="text-gray-500 dark:text-slate-400 mt-1">{live.taskMessage}</p>}
          </div>
        </div>
      )}

      {decisionStatus?.active && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-purple-200 dark:border-purple-800 p-4">
          <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-2 flex items-center gap-1.5">
            <Brain size={14} className="text-purple-600 dark:text-purple-400" />
            AI 决策引擎
          </h3>
          <div className="text-sm space-y-1">
            <InfoRow label="目标" value={decisionStatus.taskPrompt || '-'} />
            <InfoRow label="步骤" value={`${decisionStatus.stepNumber ?? 0}/${decisionStatus.maxSteps ?? 50}`} />
            <InfoRow label="连续失败" value={String(decisionStatus.consecutiveFailures ?? 0)} />
            {decisionStatus.lastStep && (
              <>
                <InfoRow label="模型" value={decisionStatus.lastStep.modelUsed || '-'} />
                <InfoRow label="置信度" value={decisionStatus.lastStep.confidence != null ? `${(decisionStatus.lastStep.confidence * 100).toFixed(0)}%` : '-'} />
              </>
            )}
            {decisionStatus.lastStep?.thinking && (
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 line-clamp-2">{decisionStatus.lastStep.thinking}</p>
            )}
          </div>
        </div>
      )}
    </>
  );

  // ── Desktop Layout (≥1280px): 3-column ──
  if (isDesktop) {
    return (
      <div className="animate-fade-in">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 mb-4 transition-colors"
        >
          <ArrowLeft size={16} /> 返回
        </button>

        <div className="flex gap-6">
          {/* Left: Device Info + Quick Actions */}
          <div className="w-56 shrink-0 space-y-4">
            {deviceInfoPanel}
            <GroupControlPanel currentDeviceId={id} onGroupChange={setActiveGroupId} />
          </div>

          {/* Center: Screen */}
          {screenArea}

          {/* Right: AI + Tabs */}
          <div className="w-64 shrink-0 space-y-4">
            {aiPanel}

            <div className="flex gap-1 bg-gray-100 dark:bg-slate-700 rounded-lg p-0.5">
              {([
                { key: 'info', label: '信息', icon: Info },
                { key: 'files', label: '文件', icon: FolderOpen },
                { key: 'console', label: '控制台', icon: Terminal },
                { key: 'keymap', label: '键位', icon: Keyboard },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setInfoTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    infoTab === tab.key
                      ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-slate-100 shadow-sm'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
                  }`}
                >
                  <tab.icon size={12} />
                  <span className="hidden xl:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="min-h-40">
              {infoTab === 'files' && <FileTransfer deviceId={id!} tailscaleIp={device.tailscaleIp} />}
              {infoTab === 'console' && <AdbConsole deviceId={id!} tailscaleIp={device.tailscaleIp} />}
              {infoTab === 'keymap' && <KeyMapEditor onSelect={() => {}} />}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Tablet Layout (768-1279px): 2-column ──
  if (!isMobile) {
    return (
      <div className="animate-fade-in">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 mb-4 transition-colors"
        >
          <ArrowLeft size={16} /> 返回
        </button>

        {/* Full-width screen */}
        <div className="flex justify-center mb-6">
          {screenArea}
        </div>

        {/* Info + AI below */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-4">
            {deviceInfoPanel}
            <GroupControlPanel currentDeviceId={id} onGroupChange={setActiveGroupId} />
          </div>
          <div className="space-y-4">
            {aiPanel}
            <div className="flex gap-1 bg-gray-100 dark:bg-slate-700 rounded-lg p-0.5">
              {([
                { key: 'info', label: '信息', icon: Info },
                { key: 'files', label: '文件', icon: FolderOpen },
                { key: 'console', label: '控制台', icon: Terminal },
                { key: 'keymap', label: '键位', icon: Keyboard },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setInfoTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    infoTab === tab.key
                      ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-slate-100 shadow-sm'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
                  }`}
                >
                  <tab.icon size={12} /> {tab.label}
                </button>
              ))}
            </div>
            {infoTab === 'files' && <FileTransfer deviceId={id!} tailscaleIp={device.tailscaleIp} />}
            {infoTab === 'console' && <AdbConsole deviceId={id!} tailscaleIp={device.tailscaleIp} />}
            {infoTab === 'keymap' && <KeyMapEditor onSelect={() => {}} />}
          </div>
        </div>
      </div>
    );
  }

  // ── Mobile Layout (<768px): Fullscreen + bottom tab bar ──
  return (
    <div className="animate-fade-in -mx-4 -mt-6">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400"
        >
          <ArrowLeft size={16} /> 返回
        </button>
        <h3 className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate max-w-40">{device.name}</h3>
        <div className="w-8" />
      </div>

      {/* Full-width screen */}
      <div className="p-4">
        {screenArea}
      </div>

      {/* Bottom tab content */}
      <div className="px-4 pb-24">
        {mobileTab === 'info' && (
          <div className="space-y-4">
            {deviceInfoPanel}
            <GroupControlPanel currentDeviceId={id} onGroupChange={setActiveGroupId} />
            {aiPanel}
          </div>
        )}
        {mobileTab === 'ai' && (
          <div className="space-y-4">{aiPanel}</div>
        )}
        {mobileTab === 'keymap' && (
          <KeyMapEditor onSelect={() => {}} />
        )}
        {mobileTab === 'files' && (
          <FileTransfer deviceId={id!} tailscaleIp={device.tailscaleIp} />
        )}
      </div>

      {/* Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 z-50">
        <div className="flex items-center max-w-lg mx-auto">
          {MOBILE_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setMobileTab(tab.key)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                mobileTab === tab.key
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-slate-400'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 dark:text-slate-400">{label}</span>
      <span className="text-gray-900 dark:text-slate-200 font-mono text-xs max-w-40 truncate">{value}</span>
    </div>
  );
}
