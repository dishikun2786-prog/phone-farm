import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import {
  Battery, Wifi, WifiOff, RefreshCw,
  CheckSquare, Square, X, Clock, Upload,
  Monitor, Camera, FileCode2, Copy, ChevronRight,
} from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import { SkeletonGrid } from '../components/Skeleton';
import SearchBar from '../components/SearchBar';
import FilterBar from '../components/FilterBar';
import { toast } from '../hooks/useToast';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { api } from '../lib/api';

function timeAgo(ts: number): string {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 5) return '刚刚更新';
  if (sec < 60) return `${sec} 秒前更新`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前更新`;
  return `${Math.floor(sec / 3600)} 小时前更新`;
}

const APP_NAMES: Record<string, string> = {
  'com.ss.android.ugc.aweme': '抖音',
  'com.smile.gifmaker': '快手',
  'com.tencent.mm': '微信',
  'com.xingin.xhs': '小红书',
};

function getAppName(pkg: string) {
  return APP_NAMES[pkg] || pkg || '-';
}

function BatteryIcon({ level }: { level: number }) {
  const color = level > 60 ? 'text-green-500' : level > 20 ? 'text-yellow-500' : 'text-red-500';
  return (
    <div className={`flex items-center gap-0.5 ${color}`}>
      <Battery size={14} />
      <span className="text-xs font-medium">{level}%</span>
    </div>
  );
}

const QUICK_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'online', label: '在线' },
  { key: 'busy', label: '忙碌' },
  { key: 'lowBattery', label: '低电量' },
];

export default function DeviceList() {
  const navigate = useNavigate();
  const { isDesktop } = useMediaQuery();
  const devices = useStore(s => s.devices);
  const devicesLoading = useStore(s => s.devicesLoading);
  const devicesError = useStore(s => s.devicesError);
  const devicesUpdatedAt = useStore(s => s.devicesUpdatedAt);
  const liveInfo = useStore(s => s.liveInfo);
  const loadDevices = useStore(s => s.loadDevices);
  const sendCommand = useStore(s => s.sendCommand);

  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; deviceId: string; deviceName: string;
  } | null>(null);

  const currentFilter = quickFilter;

  useEffect(() => {
    loadDevices();
    const timer = setInterval(loadDevices, 10000);
    return () => clearInterval(timer);
  }, [loadDevices]);

  // Close context menu on any click
  useEffect(() => {
    if (contextMenu) {
      const close = () => setContextMenu(null);
      document.addEventListener('click', close);
      return () => document.removeEventListener('click', close);
    }
  }, [contextMenu]);

  const getDeviceLive = (deviceId: string) => liveInfo[deviceId] || {};

  const filteredDevices = useMemo(() => {
    let list = devices;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        d.tailscaleIp.includes(q)
      );
    }

    switch (currentFilter) {
      case 'online':
        list = list.filter(d => d.status === 'online');
        break;
      case 'busy':
        list = list.filter(d => d.status === 'busy');
        break;
      case 'lowBattery': {
        list = list.filter(d => {
          const live = getDeviceLive(d.id);
          const batt = live.battery ?? d.battery ?? 100;
          return batt < 30;
        });
        break;
      }
    }

    return list;
  }, [devices, searchQuery, currentFilter, liveInfo]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDevices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDevices.map(d => d.id)));
    }
  };

  const handleBatchAction = async (action: string) => {
    if (selectedIds.size === 0) return;
    setBatchRunning(true);
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await sendCommand(id, action);
      await new Promise(r => setTimeout(r, 200));
    }
    toast('success', `已向 ${ids.length} 台设备发送 ${action} 命令`);
    setBatchRunning(false);
    setBatchMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchDeploy = async () => {
    if (selectedIds.size === 0) return;
    setBatchRunning(true);
    try {
      const ids = Array.from(selectedIds);
      const result = await api.deployScriptsBatch(ids);
      toast('success', `脚本部署已发送: ${result.successCount} 台成功, ${result.failCount} 台失败`);
    } catch (err: any) {
      toast('error', '部署失败: ' + (err.message || '未知错误'));
    }
    setBatchRunning(false);
    setBatchMode(false);
    setSelectedIds(new Set());
  };

  const handleContextMenu = (e: React.MouseEvent, deviceId: string, deviceName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (batchMode) return;
    setContextMenu({ x: e.clientX, y: e.clientY, deviceId, deviceName });
  };

  const contextActions = (deviceId: string) => [
    { label: '查看详情', icon: Monitor, action: () => navigate(`/devices/${deviceId}`) },
    { label: '发送截图命令', icon: Camera, action: () => { sendCommand(deviceId, 'screenshot'); toast('info', '已发送截图命令'); } },
    { label: '部署脚本', icon: FileCode2, action: () => { api.deployScriptsBatch([deviceId]).catch(() => toast('error', '部署失败')); } },
    { label: '复制设备 ID', icon: Copy, action: () => { navigator.clipboard.writeText(deviceId); toast('success', '设备 ID 已复制'); } },
  ];

  const onlineCount = devices.filter(d => d.status === 'online').length;
  const hasFilter = searchQuery || currentFilter;

  const renderDeviceCard = (device: typeof devices[0], index: number) => {
    const live = getDeviceLive(device.id);
    const isOnline = device.status === 'online';
    const isSelected = selectedIds.has(device.id);

    return (
      <div
        key={device.id}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (batchMode) { toggleSelect(device.id); }
          else { navigate(`/devices/${device.id}`); }
        }}
        onContextMenu={(e) => handleContextMenu(e, device.id, device.name)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (batchMode) toggleSelect(device.id);
            else navigate(`/devices/${device.id}`);
          }
        }}
        className={`bg-white dark:bg-slate-800 rounded-xl border overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-blue-500 animate-scale-in ${
          isSelected
            ? 'border-blue-400 dark:border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
            : 'border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-slate-600'
        }`}
        style={{ animationDelay: `${index * 40}ms` }}
      >
        {/* Screenshot area */}
        <div className="aspect-9/16 bg-slate-900 relative flex items-center justify-center">
          {live.screenshot ? (
            <img
              src={`data:image/jpeg;base64,${live.screenshot}`}
              alt="device screen"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-slate-500 text-xs">
              {isOnline ? '等待画面...' : '离线'}
            </div>
          )}

          {/* Batch select checkbox */}
          {batchMode && (
            <div className={`absolute top-2 left-2 w-6 h-6 rounded flex items-center justify-center transition-colors ${
              isSelected ? 'bg-blue-600 text-white' : 'bg-white/80 text-gray-400'
            }`}>
              {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            </div>
          )}

          {/* Online indicator */}
          <div className="absolute top-2 right-2">
            {isOnline ? (
              <Wifi size={14} className="text-green-400 drop-shadow-sm" />
            ) : (
              <WifiOff size={14} className="text-red-400 drop-shadow-sm" />
            )}
          </div>

          {/* Device name overlay on screenshot */}
          {!live.screenshot && (
            <div className="absolute bottom-2 left-2 right-2">
              <p className="text-white/80 text-xs font-medium truncate">{device.name}</p>
            </div>
          )}

          {/* Hover action overlay */}
          {!batchMode && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-3 py-1.5 rounded-full">
                {isOnline ? '查看详情' : '离线'}
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 space-y-1.5">
          {live.screenshot && (
            <div className="font-medium text-sm text-gray-900 dark:text-slate-100 truncate">{device.name}</div>
          )}
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
            <BatteryIcon level={live.battery ?? device.battery ?? 0} />
            <span className="truncate max-w-20">{getAppName(live.currentApp || device.currentApp)}</span>
          </div>
          {live.taskStatus && (
            <div className="text-xs">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs ${
                live.taskStatus === 'running'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400'
              }`}>
                {live.taskStatus === 'running' ? '执行中' : live.taskStatus}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMobileListItem = (device: typeof devices[0], index: number) => {
    const live = getDeviceLive(device.id);
    const isOnline = device.status === 'online';
    const isSelected = selectedIds.has(device.id);

    return (
      <div
        key={device.id}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (batchMode) { toggleSelect(device.id); }
          else { navigate(`/devices/${device.id}`); }
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (batchMode) toggleSelect(device.id);
            else navigate(`/devices/${device.id}`);
          }
        }}
        className={`flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors animate-fade-in ${
          isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
        }`}
        style={{ animationDelay: `${index * 30}ms` }}
      >
        {batchMode && (
          <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
            isSelected ? 'bg-blue-600 text-white' : 'border-2 border-gray-300 dark:border-slate-500'
          }`}>
            {isSelected && <CheckSquare size={12} />}
          </div>
        )}
        <div className={`w-2 h-2 rounded-full shrink-0 ${
          isOnline ? 'bg-green-500' : device.status === 'busy' ? 'bg-amber-500' : 'bg-gray-400'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{device.name}</span>
            <BatteryIcon level={live.battery ?? device.battery ?? 0} />
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            <span>{device.tailscaleIp || '-'}</span>
            <span>·</span>
            <span>Android {device.androidVersion}</span>
            <span>·</span>
            <span>{getAppName(live.currentApp || device.currentApp)}</span>
          </div>
        </div>
        {!batchMode && <ChevronRight size={16} className="text-gray-400 shrink-0" />}
      </div>
    );
  };

  const content = (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">设备列表</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            共 {devices.length} 台，在线 {onlineCount} 台
            {hasFilter && (
              <span className="text-blue-600 dark:text-blue-400 ml-1">
                — 显示 {filteredDevices.length} 台
              </span>
            )}
            {devicesUpdatedAt > 0 && (
              <span className="inline-flex items-center gap-1 text-gray-400 dark:text-slate-500 ml-2">
                <Clock size={10} />
                {timeAgo(devicesUpdatedAt)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {batchMode ? (
            <>
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {selectedIds.size === filteredDevices.length ? <CheckSquare size={14} /> : <Square size={14} />}
                {selectedIds.size === filteredDevices.length ? '取消全选' : '全选'}
              </button>
              <span className="text-xs text-gray-500 dark:text-slate-400">已选 {selectedIds.size} 台</span>
            </>
          ) : (
            <>
              <button
                onClick={() => setBatchMode(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <CheckSquare size={14} />
                批量操作
              </button>
              <button
                onClick={loadDevices}
                disabled={devicesLoading}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-gray-400 dark:text-slate-500 transition-colors"
                title="刷新"
              >
                <RefreshCw size={16} className={devicesLoading ? 'animate-spin' : ''} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜索设备名称/IP/ID..."
          className="w-52"
        />
        <FilterBar
          options={QUICK_FILTERS}
          value={currentFilter}
          onChange={setQuickFilter}
        />
      </div>

      {/* Loading */}
      {devicesLoading && devices.length === 0 && <SkeletonGrid count={8} />}

      {/* Desktop Grid View */}
      {isDesktop && devices.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredDevices.map((device, i) => renderDeviceCard(device, i))}
        </div>
      )}

      {/* Mobile List View */}
      {!isDesktop && devices.length > 0 && (
        <div className="-mx-4 bg-white dark:bg-slate-800 border-y border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
          {filteredDevices.map((device, i) => renderMobileListItem(device, i))}
        </div>
      )}

      {/* Floating batch action bar */}
      {batchMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
          <div className="flex items-center gap-2 bg-gray-900 dark:bg-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl">
            <span className="text-xs text-gray-400 mr-1">已选 {selectedIds.size} 台</span>
            <button
              onClick={() => handleBatchAction('home')}
              disabled={batchRunning}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
            >
              Home
            </button>
            <button
              onClick={() => handleBatchAction('screenshot')}
              disabled={batchRunning}
              className="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
            >
              截图
            </button>
            <button
              onClick={handleBatchDeploy}
              disabled={batchRunning}
              className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Upload size={10} />
              部署
            </button>
            <button
              onClick={() => { setBatchMode(false); setSelectedIds(new Set()); }}
              className="p-1 hover:bg-slate-700 rounded-md text-gray-400 transition-colors ml-1"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-200 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl py-1 w-44 animate-scale-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 text-xs text-gray-400 dark:text-slate-500 truncate border-b border-gray-100 dark:border-slate-700">
            {contextMenu.deviceName}
          </div>
          {contextActions(contextMenu.deviceId).map((action, i) => (
            <button
              key={i}
              onClick={() => { action.action(); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-left"
            >
              <action.icon size={14} className="text-gray-400" />
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <PageWrapper
      loading={false}
      error={devicesError}
      empty={!devicesLoading && !devicesError && devices.length === 0}
      emptyTitle="暂无设备"
      emptyDescription="等待手机通过 PhoneFarm APK 连接"
      emptyResults={!devicesLoading && !devicesError && devices.length > 0 && filteredDevices.length === 0}
      onClearFilters={() => { setSearchQuery(''); setQuickFilter(''); }}
    >
      {content}
    </PageWrapper>
  );
}
