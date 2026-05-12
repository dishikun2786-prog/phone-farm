/**
 * ScrcpyPlayer — real-time Android screen mirroring via scrcpy + WebSocket.
 *
 * Receives H.264 Annex B NAL units as WebSocket binary frames,
 * transmuxes to fMP4 via mux.js, and plays via <video> + MediaSource.
 *
 * Captures pointer events on the video element and sends them back
 * through the WebSocket as JSON control messages (touch/key/scroll).
 *
 * States: idle → connecting → streaming → disconnected/error
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Square, Maximize2, Loader2, Wifi, WifiOff, Upload } from 'lucide-react';
// @ts-ignore mux.js has no types
import muxjs from 'mux.js';
import { useClipboardSync } from '../hooks/useClipboardSync';
import RecordingControls from './RecordingControls';
import { api } from '../lib/api';
import { toast } from '../hooks/useToast';

type MirrorState = 'idle' | 'connecting' | 'streaming' | 'disconnected' | 'reconnecting' | 'error';

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

interface Props {
  deviceId: string;
  tailscaleIp?: string;
  deviceWidth?: number;
  deviceHeight?: number;
  className?: string;
  groupId?: string;
  keymapProfile?: any;
}

export default function ScrcpyPlayer({
  deviceId,
  tailscaleIp,
  deviceWidth = 1080,
  deviceHeight = 2400,
  className = '',
  groupId,
  keymapProfile,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const transmuxerRef = useRef<any>(null);
  const sbQueueRef = useRef<Uint8Array[]>([]);
  const sbUpdatingRef = useRef(false);
  const [state, setState] = useState<MirrorState>('idle');
  const [error, setError] = useState('');
  const [controlReady, setControlReady] = useState(false);
  const [codecInfo, setCodecInfo] = useState('');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const queuedNalsRef = useRef<Uint8Array[]>([]);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const [dragOver, setDragOver] = useState(false);
  const [keymapEnabled, setKeymapEnabled] = useState(!!keymapProfile);
  const [uploadProgress, setUploadProgress] = useState<{ filename: string; progress: number } | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const intentionalStopRef = useRef(false);

  // Clipboard sync
  useClipboardSync({ deviceId, wsRef, enabled: state === 'streaming' });

  const cleanup = useCallback(() => {
    // Clear reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    // Clean up MSE
    try {
      if (sourceBufferRef.current && mediaSourceRef.current) {
        const ms = mediaSourceRef.current;
        if (ms.readyState === 'open') {
          try { ms.endOfStream(); } catch { /* */ }
        }
      }
    } catch { /* */ }
    sourceBufferRef.current = null;
    mediaSourceRef.current = null;
    transmuxerRef.current = null;
    sbQueueRef.current = [];
    sbUpdatingRef.current = false;
    queuedNalsRef.current = [];
    setControlReady(false);
    setCodecInfo('');
    reconnectCountRef.current = 0;
  }, []);

  const start = useCallback(() => {
    if (!tailscaleIp) return;
    setState('connecting');
    setError('');
    intentionalStopRef.current = false;
    reconnectCountRef.current = 0;
    cleanup();

    connectWs();
  }, [deviceId, tailscaleIp, cleanup]);

  /** Connect WebSocket with JWT auth token */
  function connectWs() {
    const token = localStorage.getItem('token');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/scrcpy/${deviceId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      // If token wasn't in query string, send as auth message
      if (!localStorage.getItem('token')) {
        // No auth — server will close after timeout
      }

      // Tell the server to start scrcpy for this device
      fetch(`/api/v1/scrcpy/start/${deviceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tailscaleIp,
          maxSize: 1080,
          bitRate: 4000000,
        }),
      }).then(res => res.json()).then(data => {
        if (data.error) {
          setError(data.error);
          setState('error');
          return;
        }
      }).catch(err => {
        setError(err.message);
        setState('error');
      });
    };

    ws.onmessage = (event) => {
      // Reset reconnect counter on successful data
      reconnectCountRef.current = 0;

      // Text messages are JSON control/data messages
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'auth_ok':
              // Authenticated successfully
              break;
            case 'device_meta':
              setCodecInfo(`${msg.deviceName} ${msg.resolution?.width}x${msg.resolution?.height}`);
              break;
            case 'control_ready':
              setControlReady(true);
              break;
            case 'session_closed':
              if (!intentionalStopRef.current) {
                scheduleReconnect();
              } else {
                setState('disconnected');
              }
              break;
            case 'error':
              setError(msg.message);
              setState('error');
              break;
          }
        } catch { /* */ }
        return;
      }

      // Binary messages are H.264 NAL units
      const nalUnit = new Uint8Array(event.data as unknown as ArrayBuffer);

      if (!mediaSourceRef.current) {
        // First NAL unit — initialize MediaSource
        initMSE(nalUnit);
        setState('streaming');
      } else {
        feedNal(nalUnit);
      }
    };

    ws.onclose = () => {
      if (!intentionalStopRef.current && reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
        scheduleReconnect();
      } else {
        setState('disconnected');
        cleanup();
      }
    };

    ws.onerror = () => {
      // Let onclose handle reconnect
    };
  }

  function scheduleReconnect() {
    if (intentionalStopRef.current) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, reconnectCountRef.current),
      RECONNECT_MAX_MS,
    );
    reconnectCountRef.current++;
    setReconnectAttempt(reconnectCountRef.current);
    setState('reconnecting');

    reconnectTimerRef.current = setTimeout(() => {
      connectWs();
    }, delay);
  }

  const stop = useCallback(() => {
    intentionalStopRef.current = true;
    fetch(`/api/v1/scrcpy/stop/${deviceId}`, { method: 'POST' }).catch(() => {});
    cleanup();
    setState('idle');
    setReconnectAttempt(0);
  }, [deviceId, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  // ── MSE helpers ──

  function initMSE(firstNal: Uint8Array) {
    const ms = new MediaSource();
    mediaSourceRef.current = ms;

    if (videoRef.current) {
      videoRef.current.src = URL.createObjectURL(ms);
    }

    ms.addEventListener('sourceopen', () => {
      // Extract codec string from SPS in the first NAL unit
      const codecStr = parseCodecFromSps(firstNal) || 'avc1.42E01E';

      try {
        const sb = ms.addSourceBuffer(`video/mp4; codecs="${codecStr}"`);
        sb.mode = 'sequence';
        sourceBufferRef.current = sb;

        sb.addEventListener('updateend', () => {
          sbUpdatingRef.current = false;
          processQueue();
        });

        sb.addEventListener('error', () => {
          setError('MediaSource buffer error');
          setState('error');
        });

        // Create transmuxer
        const transmuxer = new muxjs.mp4.Transmuxer();
        transmuxerRef.current = transmuxer;

        transmuxer.on('data', (segment: any) => {
          if (segment.type === 'video' || segment.type === 'combined') {
            appendToBuffer(segment.data);
          }
        });

        // Feed the first NAL
        feedNal(firstNal);
      } catch (err: any) {
        setError(`MediaSource init failed: ${err.message}`);
        setState('error');
      }
    });
  }

  function feedNal(nalUnit: Uint8Array) {
    if (!transmuxerRef.current) {
      // Queue until transmuxer is ready
      queuedNalsRef.current.push(nalUnit);
      return;
    }

    // Feed queued NALs first
    while (queuedNalsRef.current.length > 0) {
      const q = queuedNalsRef.current.shift()!;
      try { transmuxerRef.current.push(q); } catch { /* */ }
    }

    try {
      transmuxerRef.current.push(nalUnit);
      transmuxerRef.current.flush();
    } catch { /* */ }
  }

  function appendToBuffer(data: Uint8Array) {
    if (!sourceBufferRef.current) return;

    if (sbUpdatingRef.current) {
      sbQueueRef.current.push(data);
      return;
    }

    try {
      sbUpdatingRef.current = true;
      sourceBufferRef.current.appendBuffer(data.buffer as ArrayBuffer);
    } catch (err: any) {
      if (err.name === 'QuotaExceededError') {
        // Buffer full — clear and restart
        if (sourceBufferRef.current && mediaSourceRef.current) {
          try {
            sourceBufferRef.current.abort();
            // Remove old data
            const sb = sourceBufferRef.current;
            const start = sb.buffered.length > 0 ? sb.buffered.start(0) : 0;
            const end = sb.buffered.length > 0 ? sb.buffered.end(sb.buffered.length - 1) : 0;
            if (end - start > 5) {
              sb.remove(start, start + (end - start) * 0.5);
            }
          } catch { /* */ }
        }
        sbUpdatingRef.current = false;
        processQueue();
      } else {
        sbUpdatingRef.current = false;
      }
    }
  }

  function processQueue() {
    if (sbQueueRef.current.length === 0) return;
    const data = sbQueueRef.current.shift()!;
    appendToBuffer(data);
  }

  // ── Touch/mouse event handler ──

  function sendControl(msg: object) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Attach groupId for group control broadcast
      const fullMsg = groupId ? { ...msg, groupId } : msg;
      wsRef.current.send(JSON.stringify(fullMsg));
    }
  }

  function getVideoCoords(e: React.PointerEvent<HTMLVideoElement>) {
    const video = videoRef.current;
    if (!video) return { x: 0, y: 0 };
    const rect = video.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * deviceWidth,
      y: (e.clientY - rect.top) / rect.height * deviceHeight,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLVideoElement>) {
    if (!controlReady) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const { x, y } = getVideoCoords(e);
    activePointersRef.current.set(e.pointerId, { x, y });

    for (const [id, state] of activePointersRef.current) {
      sendControl({ type: 'touch', action: id === e.pointerId ? 'down' : 'move', x: state.x, y: state.y, pressure: e.pressure || 1, pointerId: id });
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLVideoElement>) {
    if (!controlReady) return;
    const { x, y } = getVideoCoords(e);
    activePointersRef.current.set(e.pointerId, { x, y });

    for (const [id, state] of activePointersRef.current) {
      sendControl({ type: 'touch', action: 'move', x: state.x, y: state.y, pressure: e.pressure || 1, pointerId: id });
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLVideoElement>) {
    if (!controlReady) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    const { x, y } = getVideoCoords(e);
    activePointersRef.current.delete(e.pointerId);

    sendControl({ type: 'touch', action: 'up', x, y, pressure: 0, pointerId: e.pointerId });

    // Send remaining active pointers as 'move'
    for (const [id, state] of activePointersRef.current) {
      sendControl({ type: 'touch', action: 'move', x: state.x, y: state.y, pressure: 1, pointerId: id });
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLVideoElement>) {
    if (!controlReady) return;
    e.preventDefault();
    const video = videoRef.current;
    if (!video) return;

    const rect = video.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * deviceWidth;
    const y = (e.clientY - rect.top) / rect.height * deviceHeight;

    sendControl({
      type: 'scroll',
      x,
      y,
      hscroll: Math.round(e.deltaX),
      vscroll: Math.round(e.deltaY),
    });
  }

  function handleFullscreen() {
    containerRef.current?.requestFullscreen?.();
  }

  // Keyboard → touch conversion (keymap engine)
  function handleKeyDown(e: React.KeyboardEvent) {
    if (!keymapEnabled || !keymapProfile?.mappings) return;
    const mapping = keymapProfile.mappings.find((m: any) => m.keyCode === e.code);
    if (!mapping) return;

    switch (mapping.action) {
      case 'tap': {
        if (mapping.x == null || mapping.y == null) return;
        const x = (mapping.x / 100) * deviceWidth;
        const y = (mapping.y / 100) * deviceHeight;
        sendControl({ type: 'keymap', touchAction: { x, y, duration: 100 } });
        break;
      }
      case 'swipe': {
        if (mapping.fromX == null || mapping.fromY == null || mapping.toX == null || mapping.toY == null) return;
        const fromX = (mapping.fromX / 100) * deviceWidth;
        const fromY = (mapping.fromY / 100) * deviceHeight;
        const toX = (mapping.toX / 100) * deviceWidth;
        const toY = (mapping.toY / 100) * deviceHeight;
        sendControl({ type: 'keymap', swipeAction: { fromX, fromY, toX, toY, duration: mapping.duration || 300 } });
        break;
      }
      case 'long_press': {
        if (mapping.x == null || mapping.y == null) return;
        const x = (mapping.x / 100) * deviceWidth;
        const y = (mapping.y / 100) * deviceHeight;
        sendControl({ type: 'keymap', touchAction: { x, y, duration: mapping.duration || 800 } });
        break;
      }
    }
  }

  // Drag-and-drop file upload
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function handleDragLeave() { setDragOver(false); }
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!tailscaleIp || e.dataTransfer.files.length === 0) return;

    const files = Array.from(e.dataTransfer.files);

    for (const file of files) {
      setUploadProgress({ filename: file.name, progress: 0 });

      try {
        const result = await api.uploadFileChunked(
          deviceId,
          file,
          tailscaleIp,
          '/sdcard/Download/',
          (progress) => {
            setUploadProgress({ filename: file.name, progress });
          },
        );

        if (result.success) {
          if (file.name.endsWith('.apk')) {
            await api.installApk(deviceId, tailscaleIp, `/sdcard/Download/${file.name}`);
            toast('success', `${file.name} 已安装`);
          } else {
            toast('success', `${file.name} 上传完成`);
          }
        } else {
          toast('error', `${file.name}: ${result.error || '上传失败'}`);
        }
      } catch (err: any) {
        toast('error', `${file.name}: ${err.message}`);
      } finally {
        setUploadProgress(null);
      }
    }
  }

  // Keymap toggle
  function toggleKeymap() {
    setKeymapEnabled(!keymapEnabled);
  }

  // ── Render ──

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Video container — phone aspect ratio */}
      <div
        ref={containerRef}
        className={`relative bg-black rounded-xl overflow-hidden ${dragOver ? 'ring-2 ring-purple-400 ring-offset-2' : ''}`}
        style={{ aspectRatio: `${deviceWidth} / ${deviceHeight}` }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* Video element */}
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          autoPlay
          playsInline
          muted
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          style={{ touchAction: controlReady ? 'none' : 'auto' }}
        />

        {/* Upload progress overlay */}
        {uploadProgress && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur px-3 py-2 z-10">
            <div className="flex items-center gap-2 text-xs text-white/80 mb-1">
              <Upload size={12} />
              <span className="truncate flex-1">{uploadProgress.filename}</span>
              <span>{Math.round(uploadProgress.progress * 100)}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-400 rounded-full transition-all duration-200"
                style={{ width: `${Math.round(uploadProgress.progress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-purple-500/30 text-white z-10">
            <Upload size={40} />
            <span className="text-sm font-medium mt-2">拖放文件到此处上传</span>
          </div>
        )}

        {/* State overlay */}
        {state !== 'streaming' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-2">
            {state === 'idle' && (
              <>
                <Play size={40} className="opacity-60" />
                <span className="text-sm opacity-60">点击「启动镜像」开始</span>
              </>
            )}
            {state === 'connecting' && (
              <>
                <Loader2 size={40} className="animate-spin text-purple-400" />
                <span className="text-sm">连接中...</span>
              </>
            )}
            {state === 'disconnected' && (
              <>
                <WifiOff size={40} className="text-red-400" />
                <span className="text-sm">连接已断开</span>
              </>
            )}
            {state === 'reconnecting' && (
              <>
                <Loader2 size={40} className="animate-spin text-yellow-400" />
                <span className="text-sm">重新连接中... ({reconnectAttempt}/{MAX_RECONNECT_ATTEMPTS})</span>
              </>
            )}
            {state === 'error' && (
              <>
                <WifiOff size={40} className="text-red-400" />
                <span className="text-sm text-red-400">{error || '连接错误'}</span>
              </>
            )}
          </div>
        )}

        {/* Control status indicator */}
        {state === 'streaming' && (
          <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur text-xs text-white/80">
            {controlReady ? (
              <>
                <Wifi size={10} className="text-green-400" />
                <span>触控就绪</span>
              </>
            ) : (
              <>
                <Loader2 size={10} className="animate-spin" />
                <span>仅观看</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {state === 'idle' || state === 'disconnected' || state === 'reconnecting' || state === 'error' ? (
            <button
              onClick={start}
              disabled={!tailscaleIp}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Play size={14} />
              启动镜像
            </button>
          ) : (
            <button
              onClick={stop}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors"
            >
              <Square size={14} />
              停止
            </button>
          )}
          {state === 'streaming' && <RecordingControls deviceId={deviceId} />}
          {keymapProfile && state === 'streaming' && (
            <button
              onClick={toggleKeymap}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                keymapEnabled ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              键位
            </button>
          )}
          <button
            onClick={handleFullscreen}
            className="flex items-center gap-1 px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs text-gray-600 transition-colors"
          >
            <Maximize2 size={14} />
          </button>
        </div>
        {codecInfo && (
          <span className="text-xs text-gray-400 truncate max-w-48">{codecInfo}</span>
        )}
      </div>
    </div>
  );
}

// ── Utility: extract H.264 codec string from SPS NAL unit ──
function parseCodecFromSps(nalUnit: Uint8Array): string | null {
  try {
    // Find SPS (NAL type 7, first byte & 0x1F == 7)
    // Skip Annex B start code (00 00 00 01 or 00 00 01)
    let offset = 0;
    if (nalUnit[0] === 0 && nalUnit[1] === 0 && nalUnit[2] === 0 && nalUnit[3] === 1) offset = 4;
    else if (nalUnit[0] === 0 && nalUnit[1] === 0 && nalUnit[2] === 1) offset = 3;
    else return null;

    const nalType = nalUnit[offset]! & 0x1F;
    if (nalType !== 7) return null; // Not SPS

    // Extract profile_idc, constraint flags, level_idc
    const profileIdc = nalUnit[offset + 1];
    // constraint byte at offset+2
    const levelIdc = nalUnit[offset + 3];

    // Build codec string: avc1.<profile><constraint><level>
    // profile: hex of profile_idc
    // constraint: hex of constraint flags
    // level: hex of level_idc
    const constraintByte = nalUnit[offset + 2]!;
    const codecStr = 'avc1.' +
      profileIdc.toString(16).padStart(2, '0').toUpperCase() +
      constraintByte.toString(16).padStart(2, '0').toUpperCase() +
      levelIdc.toString(16).padStart(2, '0').toUpperCase();

    return codecStr;
  } catch {
    return null;
  }
}
