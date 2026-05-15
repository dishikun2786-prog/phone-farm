/**
 * BridgeClient — 本地控制服务器隧道客户端。
 *
 * 主动出站连接公网 VPS BridgeServer，为每个远程手机设备创建
 * VirtualWebSocket 并注入本地 Hub，实现透明中转。
 *
 * 数据流：
 *   手机 → VPS BridgeServer → BridgeClient → VirtualWS → 本地 Hub → 业务处理
 *   本地 Hub → VirtualWS.send() → BridgeClient → VPS BridgeServer → 手机
 *
 * 前端 Dashboard 可直接连本地 Hub（无需经过 VPS），也可通过 VPS 远程访问。
 */

import { WebSocket } from 'ws';
import { EventEmitter } from 'events';

// ── Types ──

type SendToDeviceFn = (deviceId: string, payload: string) => void;
type SendToFrontendFn = (frontendId: string, payload: string) => void;

export interface BridgeClientOptions {
  /** VPS BridgeServer URL */
  relayUrl: string;
  /** 控制端认证 token */
  controlToken: string;
  /** 重连参数 */
  reconnect?: {
    baseMs?: number;
    maxMs?: number;
  };
}

export interface BridgeStatus {
  connected: boolean;
  relayUrl: string;
  activePhoneTunnels: number;
  activeFrontendTunnels: number;
  bytesSent: number;
  bytesReceived: number;
  lastReconnectAttempt: number;
}

// ── VirtualWebSocket ──

/**
 * 虚拟 WebSocket — 模拟 ws.WebSocket 接口，供本地 Hub 使用。
 * 不建立真实 TCP 连接，所有 send() 通过 BridgeClient 隧道发送。
 */
class VirtualWebSocket extends EventEmitter {
  public readyState: number = WebSocket.OPEN; // 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
  private _sendViaTunnel: (data: string | Buffer) => void;

  constructor(sendViaTunnel: (data: string | Buffer) => void) {
    super();
    this._sendViaTunnel = sendViaTunnel;
  }

  send(data: string | Buffer): void {
    if (this.readyState !== WebSocket.OPEN) return;
    try {
      this._sendViaTunnel(data);
    } catch { /* ignore */ }
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.emit('close', code ?? 1000, reason ?? '');
    this.removeAllListeners();
  }

  /** Hub 调用此方法来模拟收到消息 */
  injectMessage(data: string | Buffer): void {
    if (this.readyState === WebSocket.OPEN) {
      this.emit('message', data);
    }
  }

  /** 模拟连接断开 */
  injectClose(code = 1000, reason = ''): void {
    this.close(code, reason);
  }
}

// ── BridgeClient ──

export class BridgeClient {
  #ws: WebSocket | null = null;
  #relayUrl: string;
  #controlToken: string;
  #reconnectBaseMs: number;
  #reconnectMaxMs: number;
  #phoneTunnels = new Map<string, VirtualWebSocket>();
  #frontendTunnels = new Map<string, VirtualWebSocket>();
  #reconnectAttempts = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #intentionalClose = false;
  #bytesSent = 0;
  #bytesReceived = 0;
  #lastReconnectAttempt = 0;

  /** 外部注入：收到新手机连接时如何注入 Hub */
  onDeviceConnect: ((vws: VirtualWebSocket, deviceId: string, remoteAddress: string) => void) | null = null;
  /** 外部注入：收到新前端连接时如何注入 Hub */
  onFrontendConnect: ((vws: VirtualWebSocket, frontendId: string) => void) | null = null;
  /** UDP 帧回调（从 VPS 中继过来的音视频帧） */
  onUdpFrame: ((frame: Buffer) => void) | null = null;

  constructor(opts: BridgeClientOptions) {
    this.#relayUrl = opts.relayUrl;
    this.#controlToken = opts.controlToken;
    this.#reconnectBaseMs = opts.reconnect?.baseMs ?? 2000;
    this.#reconnectMaxMs = opts.reconnect?.maxMs ?? 60000;
  }

  // ── Lifecycle ──

  connect(): void {
    this.#intentionalClose = false;
    this.#doConnect();
  }

  disconnect(): void {
    this.#intentionalClose = true;
    this.#clearReconnectTimer();
    // Close all virtual tunnels
    for (const [, vws] of this.#phoneTunnels) vws.injectClose(1001, 'Bridge disconnected');
    for (const [, vws] of this.#frontendTunnels) vws.injectClose(1001, 'Bridge disconnected');
    this.#phoneTunnels.clear();
    this.#frontendTunnels.clear();
    if (this.#ws) {
      try { this.#ws.close(); } catch { /* */ }
      this.#ws = null;
    }
  }

  getStatus(): BridgeStatus {
    return {
      connected: this.#ws !== null && this.#ws.readyState === WebSocket.OPEN,
      relayUrl: this.#relayUrl,
      activePhoneTunnels: this.#phoneTunnels.size,
      activeFrontendTunnels: this.#frontendTunnels.size,
      bytesSent: this.#bytesSent,
      bytesReceived: this.#bytesReceived,
      lastReconnectAttempt: this.#lastReconnectAttempt,
    };
  }

  /** 手动注入 UDP 帧到 phoneTunnels（用于本地 UDP relay 接收后转发） */
  injectUdpFrame(deviceId: string, frame: Buffer): void {
    const vws = this.#phoneTunnels.get(deviceId);
    if (vws) vws.injectMessage(frame);
  }

  // ── Internal ──

  #doConnect(): void {
    if (this.#ws) {
      try { this.#ws.close(); } catch { /* */ }
    }

    this.#lastReconnectAttempt = Date.now();
    const ws = new WebSocket(this.#relayUrl);
    this.#ws = ws;

    ws.on('open', () => {
      this.#reconnectAttempts = 0;
      // Send control auth
      ws.send(JSON.stringify({
        type: 'control_auth',
        token: this.#controlToken,
      }));
    });

    ws.on('message', (raw) => {
      this.#bytesReceived += typeof raw === 'string'
        ? Buffer.byteLength(raw)
        : (raw as Buffer).length;

      // UDP frames are sent as binary with 4-byte header: [idLen:4][deviceId:UTF-8][rawFrame]
      if (Buffer.isBuffer(raw) || raw instanceof ArrayBuffer) {
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        if (buf.length >= 4) {
          const idLen = buf.readUInt32BE(0);
          if (idLen > 0 && idLen <= 256 && buf.length >= 4 + idLen) {
            const deviceId = buf.subarray(4, 4 + idLen).toString('utf-8');
            const frame = buf.subarray(4 + idLen);
            if (deviceId !== 'unknown') {
              this.injectUdpFrame(deviceId, frame);
            } else {
              this.onUdpFrame?.(frame);
            }
            return;
          }
        }
        // Fallback: treat whole buffer as raw frame
        this.onUdpFrame?.(buf);
        return;
      }

      try {
        const m = JSON.parse(raw.toString());
        this.#handleMessage(m);
      } catch { /* ignore malformed */ }
    });

    ws.on('close', (code) => {
      // Close all virtual tunnels
      for (const [, vws] of this.#phoneTunnels) vws.injectClose(1001, 'Relay connection lost');
      for (const [, vws] of this.#frontendTunnels) vws.injectClose(1001, 'Relay connection lost');
      this.#phoneTunnels.clear();
      this.#frontendTunnels.clear();

      if (!this.#intentionalClose) {
        this.#scheduleReconnect();
      }
    });

    ws.on('error', () => {
      // Error will trigger 'close' event
    });
  }

  #handleMessage(m: Record<string, unknown>): void {
    switch (m.type) {
      case 'control_ready':
        console.log('[BridgeClient] Connected to VPS relay');
        break;

      case 'device_connected': {
        const deviceId = m.deviceId as string;
        const remoteAddress = m.remoteAddress as string;
        console.log(`[BridgeClient] Remote phone connected: ${deviceId} (${remoteAddress})`);

        // Create VirtualWS for this phone
        const vws = new VirtualWebSocket((data) => {
          this.#sendToPhone(deviceId, data);
        });
        this.#phoneTunnels.set(deviceId, vws);

        // Inject into Hub
        this.onDeviceConnect?.(vws, deviceId, remoteAddress);
        break;
      }

      case 'device_message': {
        const deviceId = m.deviceId as string;
        const payload = m.payload as string;
        const vws = this.#phoneTunnels.get(deviceId);
        if (vws) {
          vws.injectMessage(payload);
        }
        break;
      }

      case 'device_disconnected': {
        const deviceId = m.deviceId as string;
        const vws = this.#phoneTunnels.get(deviceId);
        if (vws) {
          vws.injectClose(1000, 'Device disconnected');
          this.#phoneTunnels.delete(deviceId);
        }
        console.log(`[BridgeClient] Remote phone disconnected: ${deviceId}`);
        break;
      }

      case 'frontend_connected': {
        const frontendId = m.frontendId as string;

        const vws = new VirtualWebSocket((data) => {
          this.#sendToFrontend(frontendId, data);
        });
        this.#frontendTunnels.set(frontendId, vws);

        this.onFrontendConnect?.(vws, frontendId);
        break;
      }

      case 'frontend_message': {
        const frontendId = m.frontendId as string;
        const payload = m.payload as string;
        const vws = this.#frontendTunnels.get(frontendId);
        if (vws) {
          vws.injectMessage(payload);
        }
        break;
      }

      case 'frontend_disconnected': {
        const frontendId = m.frontendId as string;
        const vws = this.#frontendTunnels.get(frontendId);
        if (vws) {
          vws.injectClose(1000, 'Frontend disconnected');
          this.#frontendTunnels.delete(frontendId);
        }
        break;
      }
    }
  }

  #sendToPhone(deviceId: string, data: string | Buffer): void {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) return;

    const payload = typeof data === 'string' ? data : data.toString('utf-8');
    const msg = JSON.stringify({ type: 'send_to_device', deviceId, payload });
    this.#ws.send(msg);
    this.#bytesSent += Buffer.byteLength(msg);
  }

  #sendToFrontend(frontendId: string, data: string | Buffer): void {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) return;

    const payload = typeof data === 'string' ? data : data.toString('utf-8');
    const msg = JSON.stringify({ type: 'send_to_frontend', frontendId, payload });
    this.#ws.send(msg);
    this.#bytesSent += Buffer.byteLength(msg);
  }

  #scheduleReconnect(): void {
    this.#clearReconnectTimer();
    const delay = Math.min(
      this.#reconnectBaseMs * Math.pow(2, this.#reconnectAttempts),
      this.#reconnectMaxMs,
    );
    this.#reconnectAttempts++;
    console.log(`[BridgeClient] Reconnecting in ${delay}ms (attempt ${this.#reconnectAttempts})`);
    this.#reconnectTimer = setTimeout(() => this.#doConnect(), delay);
  }

  #clearReconnectTimer(): void {
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
  }
}
