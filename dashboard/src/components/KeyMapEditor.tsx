import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Keyboard, Plus, Pencil, Trash2, Monitor } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../hooks/useToast';
import { BUILTIN_PRESETS } from '../pages/KeyMapPage';

interface KeyMapProfile {
  id: string;
  name: string;
  platform: string;
  deviceResolution: { width: number; height: number };
  mappings: any[];
  createdAt: string;
}

interface Props {
  onSelect: (profile: KeyMapProfile) => void;
  activeProfileId?: string;
  deviceWidth?: number;
  deviceHeight?: number;
}

export default function KeyMapEditor({ onSelect, activeProfileId, deviceWidth = 1080, deviceHeight = 2400 }: Props) {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
          <Keyboard size={16} /> 键位映射
        </h3>
        <button
          onClick={() => navigate('/keymaps')}
          className="flex items-center gap-1 px-2 py-1 bg-purple-600 text-white rounded-md text-xs font-medium hover:bg-purple-700 transition-colors"
        >
          <Plus size={12} /> 管理
        </button>
      </div>

      <p className="text-xs text-gray-400">
        激活键位后可使用键盘控制设备。{'\n'}
        分辨率: {deviceWidth}x{deviceHeight}
      </p>

      {activeProfileId && (
        <div className="mt-2 flex items-center gap-1.5 px-2 py-1 bg-purple-50 rounded-md text-xs text-purple-700">
          <Monitor size={12} />
          键位已激活 — 键盘事件将转换为触控
        </div>
      )}
    </div>
  );
}
