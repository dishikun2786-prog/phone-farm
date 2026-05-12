import { useState } from 'react';
import { Settings2, Monitor } from 'lucide-react';
import { api } from '../lib/api';

interface Props {
  deviceId: string;
  currentMaxSize?: number;
  currentBitRate?: number;
  currentMaxFps?: number;
  onSettingsChanged?: () => void;
}

const RESOLUTION_OPTIONS = [
  { label: '原始', value: 0 },
  { label: '1080p', value: 1080 },
  { label: '720p', value: 720 },
  { label: '540p', value: 540 },
];

const BITRATE_OPTIONS = [
  { label: '1 Mbps', value: 1_000_000 },
  { label: '2 Mbps', value: 2_000_000 },
  { label: '4 Mbps', value: 4_000_000 },
  { label: '8 Mbps', value: 8_000_000 },
];

const FPS_OPTIONS = [
  { label: '15 fps', value: 15 },
  { label: '30 fps', value: 30 },
  { label: '60 fps', value: 60 },
];

export default function VideoSettings({ deviceId, currentMaxSize = 1080, currentBitRate = 4_000_000, currentMaxFps = 30, onSettingsChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [maxSize, setMaxSize] = useState(currentMaxSize);
  const [bitRate, setBitRate] = useState(currentBitRate);
  const [maxFps, setMaxFps] = useState(currentMaxFps);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.scrcpyUpdateSettings(deviceId, { maxSize, bitRate, maxFps });
      setOpen(false);
      onSettingsChanged?.();
    } catch { /* */ }
    setSaving(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs text-gray-600 transition-colors"
      >
        <Settings2 size={12} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-56 z-50">
          <h4 className="font-semibold text-gray-900 text-sm mb-3 flex items-center gap-1.5">
            <Monitor size={14} /> 视频参数
          </h4>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">分辨率</label>
              <div className="flex gap-1">
                {RESOLUTION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setMaxSize(opt.value)}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      maxSize === opt.value ? 'bg-purple-100 text-purple-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">码率</label>
              <div className="flex gap-1 flex-wrap">
                {BITRATE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setBitRate(opt.value)}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      bitRate === opt.value ? 'bg-purple-100 text-purple-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">帧率</label>
              <div className="flex gap-1">
                {FPS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setMaxFps(opt.value)}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      maxFps === opt.value ? 'bg-purple-100 text-purple-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => setOpen(false)}
              className="flex-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded-md"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-2 py-1 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-40"
            >
              保存 (需重启)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
