import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Battery, Wifi, WifiOff } from 'lucide-react';

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

export default function DeviceList() {
  const navigate = useNavigate();
  const devices = useStore(s => s.devices);
  const liveInfo = useStore(s => s.liveInfo);
  const loadDevices = useStore(s => s.loadDevices);

  useEffect(() => {
    loadDevices();
    const timer = setInterval(loadDevices, 10000);
    return () => clearInterval(timer);
  }, [loadDevices]);

  const getDeviceLive = (deviceId: string) => liveInfo[deviceId] || {};

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">设备列表</h2>
        <span className="text-sm text-gray-500">
          共 {devices.length} 台，在线 {devices.filter(d => d.status === 'online').length} 台
        </span>
      </div>

      {devices.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">暂无设备</p>
          <p className="text-sm mt-1">等待手机连接...</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {devices.map(device => {
            const live = getDeviceLive(device.id);
            const isOnline = device.status === 'online';

            return (
              <div
                key={device.id}
                onClick={() => navigate(`/devices/${device.id}`)}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md hover:border-blue-300 transition-all"
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
                  {/* Online indicator */}
                  <div className="absolute top-2 right-2">
                    {isOnline ? (
                      <Wifi size={14} className="text-green-400" />
                    ) : (
                      <WifiOff size={14} className="text-red-400" />
                    )}
                  </div>
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
}
