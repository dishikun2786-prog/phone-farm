import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';
import { ArrowLeft, Home, CornerUpLeft, Camera } from 'lucide-react';

const QUICK_ACTIONS = [
  { action: 'home', label: 'Home', icon: Home },
  { action: 'back', label: '返回', icon: CornerUpLeft },
  { action: 'screenshot', label: '截图', icon: Camera },
];

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const devices = useStore(s => s.devices);
  const liveInfo = useStore(s => s.liveInfo);
  const sendCommand = useStore(s => s.sendCommand);
  const loadDevices = useStore(s => s.loadDevices);
  const { subscribe } = useWebSocket(() => {});

  const device = devices.find(d => d.id === id);
  const live: any = (id && liveInfo[id]) || {};

  useEffect(() => {
    loadDevices();
    if (id) subscribe(id);
  }, [id]);

  const handleQuickAction = async (action: string) => {
    if (!id) return;
    await sendCommand(id, action);
  };

  if (!device) {
    return (
      <div className="text-center py-20 text-gray-400">设备不存在或已离线</div>
    );
  }

  return (
    <div>
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={16} /> 返回
      </button>

      <div className="flex gap-6">
        {/* Screen area */}
        <div className="flex-1 max-w-sm">
          <div className="bg-black rounded-xl overflow-hidden aspect-[9/16] relative">
            {live?.screenshot ? (
              <img
                src={`data:image/jpeg;base64,${live.screenshot}`}
                alt="screen"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                等待设备画面...
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 mt-3">
            {QUICK_ACTIONS.map(({ action, label, icon: Icon }) => (
              <button
                key={action}
                onClick={() => handleQuickAction(action)}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 transition-colors"
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Info panel */}
        <div className="w-72 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900">{device.name}</h3>
            <div className="mt-3 space-y-2 text-sm">
              <InfoRow label="型号" value={device.model || '-'} />
              <InfoRow label="Android" value={device.androidVersion || '-'} />
              <InfoRow label="Tailscale IP" value={device.tailscaleIp} />
              <InfoRow label="电量" value={live?.battery != null ? `${live.battery}%` : '-'} />
              <InfoRow label="状态" value={device.status === 'online' ? '在线' : '离线'} />
              <InfoRow label="当前APP" value={live?.currentApp || '-'} />
            </div>
          </div>

          {live?.taskStatus && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-2">任务状态</h3>
              <div className="text-sm space-y-1">
                <div>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                    live.taskStatus === 'running'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {live.taskStatus === 'running' ? '执行中' : live.taskStatus}
                  </span>
                </div>
                {live.taskMessage && <p className="text-gray-500 mt-1">{live.taskMessage}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-mono text-xs max-w-40 truncate">{value}</span>
    </div>
  );
}
