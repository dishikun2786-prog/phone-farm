import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Keyboard, Plus, Pencil, Trash2, Monitor, Smartphone, FilePlus } from 'lucide-react';
import KeyMapVisualizer from '../components/KeyMapVisualizer';
import type { KeyMapProfile } from '../components/KeyMapVisualizer';
import { api } from '../lib/api';
import { toast } from '../hooks/useToast';

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
  const [editingProfile, setEditingProfile] = useState<KeyMapProfile | null>(null);

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

  const handleCreateFromPreset = (preset: typeof BUILTIN_PRESETS[number]) => {
    const profile: KeyMapProfile = {
      id: `new_${Date.now()}`,
      name: preset.name,
      platform: preset.platform,
      deviceResolution: { width: 1080, height: 2400 },
      mappings: [],
      createdAt: new Date().toISOString(),
    };
    setEditingProfile(profile);
  };

  if (editingProfile) {
    return (
      <KeyMapVisualizer
        profile={editingProfile}
        onUpdate={(mappings) => {
          setEditingProfile(prev => prev ? { ...prev, mappings } : null);
        }}
        onClose={() => {
          setEditingProfile(null);
          loadKeymaps();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
            <Keyboard size={20} /> 键位映射
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            键盘快捷键映射到触控坐标，实现键盘控制设备
          </p>
        </div>
        <button
          onClick={() => navigate('/keymaps/new')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 dark:bg-purple-700 text-white rounded-lg text-sm font-medium hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors active:scale-95"
        >
          <Plus size={16} /> 导入键位
        </button>
      </div>

      {/* Preset cards */}
      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-300 mb-2 flex items-center gap-1.5">
          <Monitor size={14} /> 内置 5 套预设键位
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {BUILTIN_PRESETS.map(p => (
            <div
              key={p.name}
              className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-purple-100 dark:border-purple-800/50 text-sm group hover:shadow-sm transition-all"
            >
              <Smartphone size={14} className="text-purple-500 dark:text-purple-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-slate-100 text-xs truncate">{p.name}</p>
                <p className="text-gray-400 dark:text-slate-500 text-xs">{p.platform} · {p.mappings} 个映射</p>
              </div>
              <button
                onClick={() => handleCreateFromPreset(p)}
                className="p-1 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                title="从模板创建"
              >
                <FilePlus size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Custom keymap list */}
      {keymaps.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-slate-500">
          <Keyboard size={40} className="mx-auto mb-3 opacity-20" />
          <p>暂无自定义键位配置</p>
          <p className="text-xs mt-1">预设键位已自动加载，选择设备后即可使用</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {keymaps.map(km => (
            <div
              key={km.id}
              className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 flex items-center justify-between hover:shadow-sm transition-all animate-scale-in"
            >
              <div>
                <h4 className="font-medium text-gray-900 dark:text-slate-100">{km.name}</h4>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  {km.platform} · {km.mappings.length} 个映射 · {km.deviceResolution.width}x{km.deviceResolution.height}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditingProfile(km)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                >
                  <Pencil size={14} /> 编辑
                </button>
                <button
                  onClick={() => handleDelete(km.id)}
                  className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md text-gray-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
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
