import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wifi, ArrowRight, Loader2, Check, Smartphone } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../lib/api';
import { toast } from '../hooks/useToast';

interface Props {
  onClose?: () => void;
}

export default function WirelessConnectWizard({ onClose }: Props) {
  const navigate = useNavigate();
  const devices = useStore(s => s.devices);
  const [step, setStep] = useState(1);
  const [tailscaleIp, setTailscaleIp] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleConnect = async () => {
    if (!tailscaleIp.trim()) return;
    setConnecting(true);
    setResult(null);

    try {
      // Try ADB connect via the server
      const adbTarget = `${tailscaleIp.trim()}:5555`;
      const res: any = await api.execAdb('_wizard_', tailscaleIp.trim(), 'echo ok');
      if (res.output?.includes('ok')) {
        setResult({ success: true, message: `成功连接到 ${adbTarget}` });
        setStep(3);
      } else {
        setResult({ success: false, message: res.error || '无法连接到设备' });
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message || '连接失败' });
    }
    setConnecting(false);
  };

  const handleSelectDevice = (ip: string) => {
    setTailscaleIp(ip);
    setStep(2);
  };

  const onlineDevices = devices.filter(d => d.status === 'online');

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-md mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              step > s ? 'bg-green-500 text-white' :
              step === s ? 'bg-purple-600 text-white' :
              'bg-gray-200 text-gray-500'
            }`}>
              {step > s ? <Check size={14} /> : s}
            </div>
            {s < 3 && <div className={`flex-1 h-0.5 ${step > s ? 'bg-green-500' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Select device or enter IP */}
      {step === 1 && (
        <>
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <Wifi size={18} /> 无线连接 — 选择设备
          </h3>
          <p className="text-sm text-gray-500 mb-4">从在线设备列表选择，或手动输入 Tailscale IP</p>

          {onlineDevices.length > 0 && (
            <div className="space-y-1 mb-4 max-h-48 overflow-y-auto">
              {onlineDevices.map(dev => (
                <button
                  key={dev.id}
                  onClick={() => handleSelectDevice(dev.tailscaleIp)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg text-sm transition-colors"
                >
                  <Smartphone size={16} className="text-green-500" />
                  <span className="font-medium">{dev.name}</span>
                  <span className="text-gray-400 text-xs ml-auto">{dev.tailscaleIp}</span>
                  <ArrowRight size={14} className="text-gray-300" />
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">或手动输入</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="mt-3">
            <input
              value={tailscaleIp}
              onChange={e => setTailscaleIp(e.target.value)}
              placeholder="100.64.x.x"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-400"
              onKeyDown={e => e.key === 'Enter' && handleConnect()}
            />
            <button
              onClick={handleConnect}
              disabled={!tailscaleIp.trim() || connecting}
              className="mt-2 w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-40 transition-colors"
            >
              {connecting ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
              连接设备
            </button>
          </div>
        </>
      )}

      {/* Step 2: Connecting */}
      {step === 2 && (
        <>
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <Loader2 size={18} className="animate-spin text-purple-600" /> 正在连接...
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            正在通过 Tailscale 网络连接到 {tailscaleIp}:5555
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 space-y-2">
            <p>1. ADB 连接测试中...</p>
            <p>2. 请在手机上确认 USB 调试授权对话框</p>
            <p>3. 等待设备上线...</p>
          </div>
          {result && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {result.message}
            </div>
          )}
        </>
      )}

      {/* Step 3: Success */}
      {step === 3 && (
        <>
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-green-500" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">连接成功</h3>
            <p className="text-sm text-gray-500 mb-4">设备已通过无线 ADB 连接</p>
            <button
              onClick={() => {
                navigate('/');
                onClose?.();
              }}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              返回设备列表
            </button>
          </div>
        </>
      )}
    </div>
  );
}
