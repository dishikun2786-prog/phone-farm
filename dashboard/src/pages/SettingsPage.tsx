import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Wifi, Monitor, Keyboard, FolderOpen, Terminal } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../lib/api';

export default function SettingsPage() {
  const navigate = useNavigate();
  const loadDevices = useStore(s => s.loadDevices);
  const loadTemplates = useStore(s => s.loadTemplates);

  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.health().then(setHealth).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const quickLinks = [
    { label: '设备列表', icon: Monitor, path: '/' },
    { label: '群控管理', icon: Monitor, path: '/groups' },
    { label: '键位映射', icon: Keyboard, path: '/keymaps' },
    { label: 'ADB 控制台', icon: Terminal, path: '/settings' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Settings size={20} /> 系统设置
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">全局系统信息和快捷入口</p>
      </div>

      {/* Server status */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">服务器状态</h3>
        {loading ? (
          <p className="text-sm text-gray-400">加载中...</p>
        ) : health ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Info label="状态" value={health.status === 'ok' ? '正常' : '异常'} />
            <Info label="运行时间" value={formatUptime(health.uptime)} />
            <Info label="在线设备" value={`${health.devicesOnline || 0}`} />
            <Info label="模式" value={health.mode || 'dev'} />
          </div>
        ) : (
          <p className="text-sm text-red-500">无法连接到服务器</p>
        )}
      </div>

      {/* Quick links */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">快速入口</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {quickLinks.map(link => (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors"
            >
              <link.icon size={16} className="text-purple-500" />
              {link.label}
            </button>
          ))}
        </div>
      </div>

      {/* About */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">关于 PhoneFarm</h3>
        <div className="text-sm text-gray-500 space-y-1">
          <p>远程手机群控自动化平台 v1.0</p>
          <p>基于 scrcpy + ADB + Tailscale + WebSocket</p>
          <p>支持屏幕镜像、群控同步、键位映射、文件管理、ADB 控制台</p>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500 text-xs">{label}</span>
      <p className="text-gray-900 font-medium">{value}</p>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
