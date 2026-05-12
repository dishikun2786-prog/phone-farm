import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import {
  Battery, Wifi, WifiOff, Search, RefreshCw,
  CheckSquare, Square, X, Clock, Upload
} from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import { SkeletonGrid } from '../components/Skeleton';
import { toast } from '../hooks/useToast';
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
  { key: 'online', label: '仅在线' },
  { key: 'busy', label: '执行中' },
  { key: 'lowBattery', label: '电量低' },
] as const;

type FilterKey = typeof QUICK_FILTERS[number]['key'];

export default function DeviceList() {
  const navigate = useNavigate();
  const devices = useStore(s => s.devices);
  const devicesLoading = useStore(s => s.devicesLoading);
  const devicesError = useStore(s => s.devicesError);
  const devicesUpdatedAt = useStore(s => s.devicesUpdatedAt);
  const liveInfo = useStore(s => s.liveInfo);
  const loadDevices = useStore(s => s.loadDevices);
  const sendCommand = useStore(s => s.sendCommand);

  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<FilterKey>('all');
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);

  useEffect(() => {
    loadDevices();
    const timer = setInterval(loadDevices, 10000);
    return () => clearInterval(timer);
  }, [loadDevices]);

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

    switch (quickFilter) {
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
  }, [devices, searchQuery, quickFilter, liveInfo]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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

  const onlineCount = devices.filter(d => d.status === 'online').length;
  const hasFilter = searchQuery || quickFilter !== 'all';

  const content = (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">设备列表</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            共 {devices.length} 台，在线 {onlineCount} 台
            {hasFilter && (
              <span className="text-blue-600 ml-1">
                — 显示 {filteredDevices.length} 台
              </span>
            )}
            {devicesUpdatedAt > 0 && (
              <span className="inline-flex items-center gap-1 text-gray-400 ml-2">
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
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {selectedIds.size === filteredDevices.length ? <CheckSquare size={14} /> : <Square size={14} />}
                {selectedIds.size === filteredDevices.length ? '取消全选' : '全选'}
              </button>
              <span className="text-xs text-gray-500">已选 {selectedIds.size} 台</span>
              <button
                onClick={() => handleBatchAction('home')}
                disabled={batchRunning || selectedIds.size === 0}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                批量返回主页
              </button>
              <button
                onClick={() => handleBatchAction('screenshot')}
                disabled={batchRunning || selectedIds.size === 0}
                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                批量截图
              </button>
              <button
                onClick={handleBatchDeploy}
                disabled={batchRunning || selectedIds.size === 0}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                <Upload size={12} />
                部署脚本
              </button>
              <button
                onClick={() => { setBatchMode(false); setSelectedIds(new Set()); }}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"
              >
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setBatchMode(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <CheckSquare size={14} />
                批量操作
              </button>
              <button
                onClick={loadDevices}
                disabled={devicesLoading}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"
                title="刷新"
              >
                <RefreshCw size={16} className={devicesLoading ? 'animate-spin' : ''} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search + Quick Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索设备名称/IP/ID..."
            className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-52"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {QUICK_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setQuickFilter(f.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                quickFilter === f.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {devicesLoading && devices.length === 0 && <SkeletonGrid count={8} />}

      {/* Data grid */}
      {devices.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredDevices.map(device => {
            const live = getDeviceLive(device.id);
            const isOnline = device.status === 'online';
            const isSelected = selectedIds.has(device.id);

            return (
              <div
                key={device.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (batchMode) {
                    toggleSelect(device.id);
                  } else {
                    navigate(`/devices/${device.id}`);
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (batchMode) toggleSelect(device.id);
                    else navigate(`/devices/${device.id}`);
                  }
                }}
                className={`bg-white rounded-xl border overflow-hidden cursor-pointer hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isSelected
                    ? 'border-blue-400 ring-2 ring-blue-200'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                {/* Screenshot area */}
                <div className="aspect-[9/16] bg-gray-900 relative flex items-center justify-center">
                  {live.screenshot ? (
                    <img
                      src={`data:image/jpeg;base64,${live.screenshot}`}
                      alt="device screen"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-gray-500 text-xs">
                      {isOnline ? '等待画面...' : '离线'}
                    </div>
                  )}

                  {/* Batch select checkbox */}
                  {batchMode && (
                    <div className={`absolute top-2 left-2 w-6 h-6 rounded flex items-center justify-center ${
                      isSelected ? 'bg-blue-600 text-white' : 'bg-white/80 text-gray-400'
                    }`}>
                      {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </div>
                  )}

                  {/* Online indicator */}
                  <div className="absolute top-2 right-2">
                    {isOnline ? (
                      <Wifi size={14} className="text-green-400" />
                    ) : (
                      <WifiOff size={14} className="text-red-400" />
                    )}
                  </div>

                  {/* Hover action hint */}
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
                  <div className="font-medium text-sm text-gray-900 truncate">{device.name}</div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <BatteryIcon level={live.battery ?? device.battery ?? 0} />
                    <span className="truncate max-w-20">{getAppName(live.currentApp || device.currentApp)}</span>
                  </div>
                  {live.taskStatus && (
                    <div className="text-xs">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full ${
                        live.taskStatus === 'running' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {live.taskStatus === 'running' ? '执行中' : live.taskStatus}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
      emptyDescription="等待手机通过 Tailscale 连接并运行 remote-bridge.js"
      emptyResults={!devicesLoading && !devicesError && devices.length > 0 && filteredDevices.length === 0}
      onClearFilters={() => { setSearchQuery(''); setQuickFilter('all'); }}
    >
      {content}
    </PageWrapper>
  );
}
