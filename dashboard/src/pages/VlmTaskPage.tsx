import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { api } from '../lib/api';
import { Bot, Play, Square, Camera, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface VLMEpisode {
  episodeId: string;
  status: string;
  totalSteps: number;
  totalDurationMs: number;
  message: string;
}

export default function VlmTaskPage() {
  const navigate = useNavigate();
  const devices = useStore(s => s.devices);
  const liveInfo = useStore(s => s.liveInfo);

  const [deviceId, setDeviceId] = useState('');
  const [task, setTask] = useState('');
  const [modelName, setModelName] = useState('');
  const [maxSteps, setMaxSteps] = useState(50);
  const [running, setRunning] = useState(false);
  const [_episodeId, setEpisodeId] = useState('');
  const [episodes, setEpisodes] = useState<VLMEpisode[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [screenshot, setScreenshot] = useState('');
  const [stepLog, setStepLog] = useState<string[]>([]);

  const onlineDevices = devices.filter(d => d.status === 'online');

  useEffect(() => {
    api.vlmGetEpisodes().then(setEpisodes).catch(() => {});
  }, [running]);

  const handleExecute = useCallback(async () => {
    if (!deviceId || !task.trim()) return;
    setLoading(true);
    setStatus('Starting VLM task...');
    setStepLog([]);
    setScreenshot('');

    try {
      const result = await api.vlmExecute(deviceId, task.trim(), {
        modelName: modelName || undefined,
        maxSteps: maxSteps || undefined,
      });
      setEpisodeId(result.episodeId);
      setRunning(true);
      setStatus(`Running (model: ${result.modelName})`);
      setStepLog(l => [...l, `Episode ${result.episodeId} started`]);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [deviceId, task, modelName, maxSteps]);

  const handleStop = useCallback(async () => {
    if (!deviceId) return;
    try {
      await api.vlmStop(deviceId);
      setRunning(false);
      setStatus('Stopped by user');
      setStepLog(l => [...l, 'Task stopped by user']);
    } catch (err: any) {
      setStatus(`Stop error: ${err.message}`);
    }
  }, [deviceId]);

  // Watch for screenshots on the selected device
  useEffect(() => {
    const info = liveInfo[deviceId];
    if (info?.screenshot) {
      setScreenshot(info.screenshot);
    }
  }, [liveInfo, deviceId]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
          <Bot size={24} className="text-purple-600" />
          VLM AI 任务
        </h2>
        <span className="text-sm text-gray-500 dark:text-slate-400">
          自然语言驱动手机操作 · 基于 ClawGUI Agent
        </span>
      </div>

      {/* Task Form */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">目标设备</label>
            <select
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
              disabled={running}
              className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
            >
              <option value="">选择在线设备...</option>
              {onlineDevices.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.model}) — {d.tailscaleIp}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">模型 (可选)</label>
            <select
              value={modelName}
              onChange={e => setModelName(e.target.value)}
              disabled={running}
              className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
            >
              <option value="">默认 (autoglm-phone-9b)</option>
              <option value="autoglm-phone-9b">AutoGLM-Phone-9B</option>
              <option value="qwen3-vl-8b">Qwen3-VL-8B</option>
              <option value="uitars">UI-TARS</option>
              <option value="maiui">MAI-UI</option>
              <option value="guiowl">GUI-Owl</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">任务指令（自然语言）</label>
          <textarea
            value={task}
            onChange={e => setTask(e.target.value)}
            disabled={running}
            rows={3}
            placeholder="例如：打开抖音，搜索美食博主，浏览前5个视频，给点赞超过1万的视频点赞并关注作者"
            className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50 resize-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">最大步数</label>
            <input
              type="number"
              value={maxSteps}
              onChange={e => setMaxSteps(parseInt(e.target.value) || 50)}
              disabled={running}
              min={1}
              max={200}
              className="w-24 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
            />
          </div>
          <div className="flex gap-2 pt-5">
            {!running ? (
              <button
                onClick={handleExecute}
                disabled={loading || !deviceId || !task.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                执行任务
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                <Square size={16} />
                停止
              </button>
            )}
          </div>
        </div>

        {status && (
          <div className={`text-sm px-3 py-2 rounded-lg ${
            status.includes('Error') ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' :
            running ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300' :
            'bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-slate-300'
          }`}>
            {status}
          </div>
        )}
      </div>

      {/* Live Screenshot + Step Log */}
      {running && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <Camera size={16} />
              实时画面
              {screenshot && <span className="text-xs text-green-600 dark:text-green-400">接收中...</span>}
            </h3>
            <div className="bg-black rounded-lg overflow-hidden min-h-64 flex items-center justify-center">
              {screenshot ? (
                <img
                  src={`data:image/jpeg;base64,${screenshot}`}
                  alt="Device screenshot"
                  className="max-w-full max-h-96 object-contain"
                />
              ) : (
                <div className="text-gray-400 text-sm flex flex-col items-center gap-2">
                  <Camera size={32} />
                  等待设备截图...
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <Clock size={16} />
              执行日志
            </h3>
            <div className="bg-gray-900 text-green-400 font-mono text-xs rounded-lg p-3 h-64 overflow-y-auto space-y-1">
              {stepLog.length === 0 ? (
                <span className="text-gray-500">等待任务开始...</span>
              ) : (
                stepLog.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-gray-500 shrink-0">[{i + 1}]</span>
                    <span>{log}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Episode History */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
        <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">Episode 历史记录</h3>
        {episodes.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-slate-500">暂无 VLM 任务记录。执行一个任务后这里会显示。</p>
        ) : (
          <div className="space-y-2">
            {episodes.map(ep => (
              <div
                key={ep.episodeId}
                className="flex items-center justify-between p-3 border border-gray-100 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer"
                onClick={() => navigate(`/vlm/episodes/${ep.episodeId}`)}
              >
                <div className="flex items-center gap-3">
                  {ep.status === 'completed' ? (
                    <CheckCircle2 size={18} className="text-green-500" />
                  ) : ep.status === 'failed' ? (
                    <XCircle size={18} className="text-red-500" />
                  ) : (
                    <Clock size={18} className="text-gray-400" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{ep.episodeId}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {ep.status} · {ep.totalSteps} steps · {(ep.totalDurationMs / 1000).toFixed(1)}s
                    </p>
                  </div>
                </div>
                <span className="text-xs text-gray-400 dark:text-slate-500">{ep.message?.slice(0, 60)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
