import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Keyboard, Plus, Pencil, Trash2, ArrowLeft, Monitor, Smartphone } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../hooks/useToast';

interface KeyMapProfile {
  id: string;
  name: string;
  platform: string;
  deviceResolution: { width: number; height: number };
  mappings: { keyCode: string; keyName: string; action: string; x?: number; y?: number }[];
  createdAt: string;
}

export const BUILTIN_PRESETS = [
  { name: 'TikTok 上下滑动', platform: '抖音', mappings: 5 },
  { name: 'TikTok 评论互动', platform: '抖音', mappings: 4 },
  { name: '微信视频号浏览', platform: '微信', mappings: 4 },
  { name: '快手推荐浏览', platform: '快手', mappings: 4 },
  { name: '通用导航', platform: '通用', mappings: 7 },
];

export default function KeyMapPage() {
  const navigate = useNavigate();
  const [keymaps, setKeymaps] = useState<KeyMapProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadKeymaps();
  }, []);

  const loadKeymaps = async () => {
    setLoading(true);
    try {
      const data = await api.getKeymaps();
      setKeymaps(data);
    } catch {
      toast('error', '加载键位配置失败');
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteKeymap(id);
      setKeymaps(prev => prev.filter(k => k.id !== id));
      toast('info', '键位已删除');
    } catch {
      toast('error', '删除失败');
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 text-gray-400">加载中...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Keyboard size={20} /> 键位映射
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">键盘快捷键映射到触控坐标，实现键盘控制设备</p>
        </div>
        <button
          onClick={() => navigate('/keymaps/new')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
        >
          <Plus size={16} /> 导入键位
        </button>
      </div>

      {/* Preset info */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-purple-900 mb-2 flex items-center gap-1.5">
          <Monitor size={14} /> 已内置 5 套预设键位
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {BUILTIN_PRESETS.map(p => (
            <div key={p.name} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-purple-100 text-sm">
              <Smartphone size={14} className="text-purple-500" />
              <div>
                <p className="font-medium text-gray-900 text-xs">{p.name}</p>
                <p className="text-gray-400 text-xs">{p.platform} · {p.mappings} 个映射</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Keymap list */}
      {keymaps.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Keyboard size={40} className="mx-auto mb-3 opacity-20" />
          <p>暂无自定义键位配置</p>
          <p className="text-xs mt-1">预设键位已自动加载，选择设备后即可使用</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {keymaps.map(km => (
            <div key={km.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900">{km.name}</h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  {km.platform} · {km.mappings.length} 个映射 · {km.deviceResolution.width}x{km.deviceResolution.height}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navigate(`/keymaps/${km.id}`)}
                  className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(km.id)}
                  className="p-1.5 hover:bg-red-50 rounded-md text-gray-500 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
