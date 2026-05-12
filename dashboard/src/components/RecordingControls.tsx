import { useState } from 'react';
import { Video, Square, Download, Settings2 } from 'lucide-react';
import { api } from '../lib/api';

interface Props {
  deviceId: string;
}

export default function RecordingControls({ deviceId }: Props) {
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try {
      await api.scrcpyStartRecording(deviceId);
      setRecording(true);
    } catch (err: any) {
      // ignore
    }
    setLoading(false);
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await api.scrcpyStopRecording(deviceId);
      setRecording(false);
    } catch (err: any) {
      // ignore
    }
    setLoading(false);
  };

  const handleDownload = async () => {
    try {
      const blob = await api.scrcpyDownloadRecording(deviceId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording_${deviceId}_${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      // ignore
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {recording ? (
        <>
          <button
            onClick={handleStop}
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors"
          >
            <Square size={12} /> 停止录制
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs text-gray-600 transition-colors"
          >
            <Download size={12} />
          </button>
        </>
      ) : (
        <button
          onClick={handleStart}
          disabled={loading}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors"
        >
          <Video size={12} /> 录制
        </button>
      )}
    </div>
  );
}
