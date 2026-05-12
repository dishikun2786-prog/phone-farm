/**
 * StreamManager — 按需音视频流生命周期管理。
 *
 * 默认关闭, Dashboard 主动开启。
 * 自动关闭: 空闲 5 分钟无订阅者 / 最大 30 分钟。
 *
 * 管理 scrcpy ScreenEncoder 的启停和订阅者追踪。
 */
import { config } from "../config";

// ── Types ──

interface StreamSession {
  deviceId: string;
  status: "idle" | "streaming";
  resolution: string;
  startedAt: number;
  lastActivityAt: number;
  bytesTransferred: number;
  subscribers: Set<string>; // frontend connection IDs
  idleTimer: ReturnType<typeof setTimeout> | null;
  maxTimer: ReturnType<typeof setTimeout> | null;
}

interface StreamCallbacks {
  /** 向设备发送 start_stream / stop_stream 指令 */
  sendToDevice(deviceId: string, msg: Record<string, unknown>): void;
  /** 向前端订阅者转发音视频帧 */
  relayToFrontend(frontendId: string, data: Buffer): void;
  /** 流状态变更通知 */
  onStreamStateChange(deviceId: string, status: string): void;
}

// ── Manager ──

export class StreamManager {
  private sessions = new Map<string, StreamSession>();
  private callbacks: StreamCallbacks;
  private totalBytesTransferred = 0;

  constructor(callbacks: StreamCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Dashboard 请求开启视频流。
   */
  startStream(
    deviceId: string,
    frontendId: string,
    options?: { maxSize?: number; bitRate?: number; maxFps?: number; audio?: boolean }
  ): { status: string; deviceId: string } {
    let session = this.sessions.get(deviceId);

    if (!session) {
      session = {
        deviceId,
        status: "idle",
        resolution: `${options?.maxSize || config.SCRCPY_MAX_SIZE}p`,
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
        bytesTransferred: 0,
        subscribers: new Set(),
        idleTimer: null,
        maxTimer: null,
      };
      this.sessions.set(deviceId, session);
    }

    session.subscribers.add(frontendId);
    session.lastActivityAt = Date.now();

    if (session.status !== "streaming") {
      // Tell device to start encoding
      this.callbacks.sendToDevice(deviceId, {
        type: "start_stream",
        payload: {
          maxSize: options?.maxSize ?? config.SCRCPY_MAX_SIZE,
          bitRate: options?.bitRate ?? config.SCRCPY_BIT_RATE,
          maxFps: options?.maxFps ?? config.SCRCPY_MAX_FPS,
          audio: options?.audio ?? false,
        },
      });

      // Set max duration timer
      const maxMs = config.STREAM_MAX_DURATION_SEC * 1000;
      if (session.maxTimer) clearTimeout(session.maxTimer);
      session.maxTimer = setTimeout(() => this.stopStream(deviceId, "max_duration"), maxMs);
    }

    // Clear idle timer
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }

    return { status: "ok", deviceId };
  }

  /**
   * Dashboard 请求停止视频流。
   */
  stopStream(deviceId: string, reason = "user_requested"): { status: string; deviceId: string } {
    const session = this.sessions.get(deviceId);
    if (!session) return { status: "not_found", deviceId };

    // Tell device to stop encoding
    this.callbacks.sendToDevice(deviceId, {
      type: "stop_stream",
      payload: { reason },
    });

    this.cleanupSession(deviceId);
    return { status: "stopped", deviceId };
  }

  /**
   * 前端断开连接时移除订阅。
   */
  unsubscribe(deviceId: string, frontendId: string): void {
    const session = this.sessions.get(deviceId);
    if (!session) return;

    session.subscribers.delete(frontendId);

    // No subscribers left -> start idle timer
    if (session.subscribers.size === 0) {
      const idleMs = config.STREAM_IDLE_TIMEOUT_SEC * 1000;
      session.idleTimer = setTimeout(() => {
        this.stopStream(deviceId, "idle_timeout");
      }, idleMs);
    }
  }

  /**
   * 设备确认推流已开始。
   */
  handleStreamStarted(deviceId: string, info: { resolution?: string }): void {
    const session = this.sessions.get(deviceId);
    if (!session) return;

    session.status = "streaming";
    session.startedAt = Date.now();
    session.resolution = info.resolution || session.resolution;

    this.callbacks.onStreamStateChange(deviceId, "streaming");
  }

  /**
   * 设备确认推流已停止。
   */
  handleStreamStopped(deviceId: string): void {
    this.cleanupSession(deviceId);
  }

  /**
   * 记录转发的数据量。
   */
  recordBytesTransferred(deviceId: string, bytes: number): void {
    const session = this.sessions.get(deviceId);
    if (session) {
      session.bytesTransferred += bytes;
      session.lastActivityAt = Date.now();
    }
    this.totalBytesTransferred += bytes;
  }

  /**
   * 获取流状态。
   */
  getStreamStatus(deviceId: string) {
    const session = this.sessions.get(deviceId);
    if (!session) return { deviceId, status: "idle" as const };

    return {
      deviceId,
      status: session.status,
      resolution: session.resolution,
      subscribers: session.subscribers.size,
      startedAt: new Date(session.startedAt).toISOString(),
      bytesTransferred: session.bytesTransferred,
    };
  }

  /**
   * 全局流统计。
   */
  getGlobalStats() {
    let streamingCount = 0;
    for (const [, s] of this.sessions) {
      if (s.status === "streaming") streamingCount++;
    }

    return {
      totalStreams: this.sessions.size,
      streamingCount,
      totalBytesTransferred: this.totalBytesTransferred,
      totalSubscribers: Array.from(this.sessions.values()).reduce((sum, s) => sum + s.subscribers.size, 0),
    };
  }

  // ── Private ──

  private cleanupSession(deviceId: string): void {
    const session = this.sessions.get(deviceId);
    if (!session) return;

    if (session.idleTimer) clearTimeout(session.idleTimer);
    if (session.maxTimer) clearTimeout(session.maxTimer);

    this.sessions.delete(deviceId);
    this.callbacks.onStreamStateChange(deviceId, "stopped");
  }
}
