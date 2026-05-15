import { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import zlib from 'zlib';
import { config } from './config.js';

// Optional modules — loaded at startup, used conditionally
let natsSync: any;
let signalingRelay: any;
try { natsSync = require('./nats/nats-sync.js')?.natsSync; } catch { /* NATS optional */ }
try { signalingRelay = require('./webrtc/signaling-relay.js'); } catch { /* signaling relay optional */ }

interface DeviceConnection {
  ws: WebSocket;
  deviceId: string;
  publicIp: string;
  authenticated: boolean;
  connectedAt: Date;
  lastHeartbeat: Date;
  currentTaskId?: string;
  runtime?: string;
  username?: string;
  /** Rate limiting: message count in current window */
  msgCount: number;
  msgWindowStart: number;
}

interface FrontendConnection {
  ws: WebSocket;
  subscribedDevices: Set<string>;
  authenticated: boolean;
  connectedAt: Date;
  /** Rate limiting: message count in current window */
  msgCount: number;
  msgWindowStart: number;
}

const MAX_MSG_SIZE = 1_048_576; // 1 MB max message size
const RATE_LIMIT_WINDOW_MS = 1000; // 1 second window
const RATE_LIMIT_MAX_MSGS = 60; // max 60 messages per second per connection
const STALE_HEARTBEAT_MS = 120_000; // disconnect after 2 min without heartbeat
const CLEANUP_INTERVAL_MS = 30_000; // run stale check every 30s

export class WsHub {
  #devices = new Map<string, DeviceConnection>();
  #frontends = new Set<FrontendConnection>();
  #deviceAuthToken: string;
  #jwtSecret: string;
  #taskTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  #TASK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes default
  #cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(deviceAuthToken: string, jwtSecret?: string) {
    this.#deviceAuthToken = deviceAuthToken;
    this.#jwtSecret = jwtSecret || deviceAuthToken;
    this.#startCleanup();
  }

  #startCleanup(): void {
    this.#cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [deviceId, conn] of this.#devices) {
        if (now - conn.lastHeartbeat.getTime() > STALE_HEARTBEAT_MS) {
          console.warn(`[ws-hub] Stale device connection: ${deviceId} (${Math.round((now - conn.lastHeartbeat.getTime()) / 1000)}s no heartbeat)`);
          conn.ws.close();
          this.#devices.delete(deviceId);
          this.#broadcastToFrontends({ type: 'device_offline', deviceId });
        }
      }
      for (const conn of this.#frontends) {
        if (now - conn.connectedAt.getTime() > 3600_000 && !conn.authenticated) {
          console.warn('[ws-hub] Stale unauthenticated frontend connection');
          conn.ws.close();
          this.#frontends.delete(conn);
        }
      }
    }, CLEANUP_INTERVAL_MS);
  }

  handleDeviceUpgrade(ws: WebSocket, req: any) {
    const now = Date.now();
    const conn: DeviceConnection = {
      ws,
      deviceId: '',
      publicIp: req?.socket?.remoteAddress || req?.ip || 'unknown',
      authenticated: false,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      msgCount: 0,
      msgWindowStart: now,
    };

    ws.on('message', (raw, isBinary) => {
      try {
        // Rate limit check
        if (!this.#checkRateLimit(conn)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' }));
          return;
        }

        // Message size limit
        const size = raw instanceof Buffer ? raw.length : (raw as ArrayBuffer).byteLength;
        if (size > MAX_MSG_SIZE) {
          ws.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
          return;
        }

        // Handle compressed binary messages (0x08 prefix = gzipped JSON)
        if (isBinary || (raw instanceof Buffer && raw.length > 0 && raw[0] === 0x08)) {
          const buffer = raw instanceof Buffer ? raw : Buffer.from(raw as ArrayBuffer);
          if (buffer.length > 1 && buffer[0] === 0x08) {
            const decompressed = zlib.gunzipSync(buffer.subarray(1));
            const msg = JSON.parse(decompressed.toString());
            this.#handleDeviceMessage(conn, msg);
            return;
          }
          // Binary but not compressed — try as text
          const msg = JSON.parse(buffer.toString());
          this.#handleDeviceMessage(conn, msg);
          return;
        }
        const msg = JSON.parse(raw.toString());
        this.#handleDeviceMessage(conn, msg);
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.on('close', () => {
      if (conn.deviceId) {
        // Clean up any task timeouts for this device
        for (const [taskId, timer] of this.#taskTimeouts) {
          const deviceConn = this.#devices.get(conn.deviceId);
          if (!deviceConn || deviceConn.currentTaskId === taskId) {
            clearTimeout(timer);
            this.#taskTimeouts.delete(taskId);
          }
        }
        this.#devices.delete(conn.deviceId);
        this.#broadcastToFrontends({ type: 'device_offline', deviceId: conn.deviceId });
        this.#publishNatsDeviceOffline(conn.deviceId);
      }
    });

    ws.on('error', (err) => { console.warn('[ws-hub] WebSocket error:', err.message); });
  }

  #handleDeviceMessage(conn: DeviceConnection, msg: any) {
    switch (msg.type) {
      case 'auth':
        if (this.#tryAuthenticate(conn, msg)) {
          this.#devices.set(conn.deviceId, conn);
          conn.ws.send(JSON.stringify({
            type: 'auth_ok',
            udpPort: 8444,
            natProbeEnabled: true,
            webrtc: {
              enabled: config.WEBRTC_ENABLED,
              turnServerUrl: config.TURN_SERVER_URL,
              turnUsername: config.TURN_USERNAME,
              turnCredential: config.TURN_CREDENTIAL,
              stunServerUrl: config.STUN_SERVER_URL,
            },
          }));
          this.#broadcastToFrontends({
            type: 'device_online',
            deviceId: conn.deviceId,
            publicIp: conn.publicIp,
            model: msg.model,
            androidVersion: msg.android_version,
            deekeVersion: msg.deeke_version || msg.clientVersion,
            runtime: conn.runtime,
          });
          this.#publishNatsDeviceOnline(conn.deviceId, {
            publicIp: conn.publicIp,
            model: msg.model,
            androidVersion: msg.android_version,
            deekeVersion: msg.deeke_version || msg.clientVersion,
            runtime: conn.runtime,
          });
        } else {
          conn.ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid token' }));
        }
        break;

      case 'heartbeat':
        if (!conn.authenticated) return;
        conn.lastHeartbeat = new Date();
        // Ack the heartbeat so the device can track connection health
        if (msg.seq != null) {
          conn.ws.send(JSON.stringify({ type: 'heartbeat_ack', seq: msg.seq }));
        }
        this.#broadcastToFrontends({
          type: 'device_heartbeat',
          deviceId: conn.deviceId,
          battery: msg.battery,
          currentApp: msg.current_app,
          screenOn: msg.screen_on,
        });
        break;

      case 'task_status':
        if (!conn.authenticated) return;
        conn.currentTaskId = msg.status === 'running' ? msg.task_id : undefined;
        if (msg.status === 'running' && msg.task_id) {
          this.#scheduleTaskTimeout(conn.deviceId, msg.task_id);
        }
        this.#broadcastToFrontends({
          type: 'task_status_update',
          deviceId: conn.deviceId,
          taskId: msg.task_id,
          status: msg.status,
          step: msg.step,
          message: msg.message,
        });
        break;

      case 'task_result':
        if (!conn.authenticated) return;
        this.#clearTaskTimeout(msg.task_id);
        conn.currentTaskId = undefined;
        this.#broadcastToFrontends({
          type: 'task_result',
          deviceId: conn.deviceId,
          taskId: msg.task_id,
          status: msg.status,
          stats: msg.stats,
        });
        break;

      case 'screenshot':
        if (!conn.authenticated) return;
        this.#broadcastToFrontends({
          type: 'device_screenshot',
          deviceId: conn.deviceId,
          data: msg.data,
        }, conn.deviceId);
        break;

      case 'log':
        if (!conn.authenticated) return;
        this.#broadcastToFrontends({
          type: 'device_log',
          deviceId: conn.deviceId,
          level: msg.level,
          message: msg.message,
        });
        break;

      default:
        // ── WebRTC signaling relay (Phase 2) ──
        // Dynamic check for webrtc_* message types — routed via signaling-relay.ts
        if (typeof msg.type === 'string' && msg.type.startsWith('webrtc_')) {
          if (!conn.authenticated) return;
          if (signalingRelay?.handleWebrtcSignaling) {
            try {
              signalingRelay.handleWebrtcSignaling(this, msg, conn.deviceId);
            } catch { console.warn('[ws-hub] Signaling relay error'); }
          }
        }
        break;
    }
  }

  handleFrontendUpgrade(ws: WebSocket, req: any) {
    const now = Date.now();
    // Extract token from query string for frontend auth
    const url = new URL(req?.url || '/', 'http://localhost');
    const token = url.searchParams.get('token') || '';

    const conn: FrontendConnection = {
      ws,
      subscribedDevices: new Set(),
      authenticated: false,
      connectedAt: new Date(),
      msgCount: 0,
      msgWindowStart: now,
    };

    // Verify JWT token for frontend connections
    try {
      const decoded = jwt.verify(token, this.#jwtSecret, { algorithms: ['HS256'] }) as any;
      if (decoded?.userId) {
        conn.authenticated = true;
      }
    } catch {
      // Token invalid or missing — allow connection but reject subscriptions
    }

    if (!conn.authenticated) {
      ws.send(JSON.stringify({ type: 'auth_required', message: 'Send auth message with JWT token' }));
    }

    this.#frontends.add(conn);

    ws.on('message', (raw) => {
      try {
        // Rate limit check
        if (!this.#checkRateLimit(conn)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' }));
          return;
        }

        const msg = JSON.parse(raw.toString());

        // Auth message for frontend connections
        if (msg.type === 'auth') {
          try {
            const decoded = jwt.verify(msg.token, this.#jwtSecret, { algorithms: ['HS256'] }) as any;
            if (decoded?.userId) {
              conn.authenticated = true;
              ws.send(JSON.stringify({ type: 'auth_ok' }));
            }
          } catch {
            ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid token' }));
          }
          return;
        }

        // Require auth for subscription operations
        if (!conn.authenticated) {
          ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
          return;
        }

        if (msg.type === 'subscribe' && msg.deviceId) {
          conn.subscribedDevices.add(msg.deviceId);
        } else if (msg.type === 'unsubscribe' && msg.deviceId) {
          conn.subscribedDevices.delete(msg.deviceId);
        }
      } catch { console.warn('[ws-hub] Failed to parse message'); }
    });

    ws.on('close', () => {
      this.#frontends.delete(conn);
    });

    ws.on('error', (err) => { console.warn('[ws-hub] WebSocket error:', err.message); });
  }

  sendToDevice(deviceId: string, message: object): boolean {
    const conn = this.#devices.get(deviceId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;
    conn.ws.send(JSON.stringify(message));
    return true;
  }

  broadcastToFrontends(message: object): void {
    this.#broadcastToFrontends(message);
  }

  broadcastToDevices(message: object): void {
    const msg = JSON.stringify(message);
    for (const conn of this.#devices.values()) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(msg);
      }
    }
  }

  isDeviceOnline(deviceId: string): boolean {
    const conn = this.#devices.get(deviceId);
    return !!(conn && conn.ws.readyState === WebSocket.OPEN);
  }

  getOnlineDevices(): string[] {
    return Array.from(this.#devices.keys());
  }

  getDeviceInfo(deviceId: string) {
    const conn = this.#devices.get(deviceId);
    if (!conn) return null;
    return {
      deviceId: conn.deviceId,
      publicIp: conn.publicIp,
      currentTaskId: conn.currentTaskId,
      runtime: conn.runtime,
    };
  }

  /** Schedule graceful task timeout — send stop_task, wait 5s, force-clear. */
  #scheduleTaskTimeout(deviceId: string, taskId: string): void {
    // Clear any existing timeout for this task
    this.#clearTaskTimeout(taskId);

    const timer = setTimeout(() => {
      const conn = this.#devices.get(deviceId);
      if (!conn || conn.currentTaskId !== taskId) {
        this.#taskTimeouts.delete(taskId);
        return;
      }

      // Phase 1: send stop_task
      conn.ws.send(JSON.stringify({
        type: 'stop_task',
        task_id: taskId,
        reason: 'timeout',
      }));

      // Phase 2: wait 5s, then force cancel
      setTimeout(() => {
        const currentConn = this.#devices.get(deviceId);
        if (currentConn?.currentTaskId === taskId) {
          currentConn.currentTaskId = undefined;
          currentConn.ws.send(JSON.stringify({
            type: 'task_complete',
            payload: {
              taskId,
              status: 'timeout',
              message: 'Task timed out after graceful shutdown',
            },
          }));
          this.#taskTimeouts.delete(taskId);
        }
      }, 5000);
    }, this.#TASK_TIMEOUT_MS);

    this.#taskTimeouts.set(taskId, timer);
  }

  /** Clear the timeout for a completed/cancelled task. */
  #clearTaskTimeout(taskId: string): void {
    const timer = this.#taskTimeouts.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.#taskTimeouts.delete(taskId);
    }
  }

  #broadcastToFrontends(message: object, onlyForDevice?: string) {
    const msg = JSON.stringify(message);
    for (const conn of this.#frontends) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        if (onlyForDevice && !conn.subscribedDevices.has(onlyForDevice)) continue;
        conn.ws.send(msg);
      }
    }
  }

  #tryAuthenticate(conn: DeviceConnection, msg: any): boolean {
    const token = msg.token;
    if (!token) return false;

    // Try JWT verification first (APK login flow)
    try {
      const decoded = jwt.verify(token, this.#jwtSecret, { algorithms: ['HS256'] }) as any;
      conn.authenticated = true;
      conn.username = decoded.username;
      conn.deviceId = msg.device_id || msg.deviceId || `device-${Date.now()}`;
      conn.publicIp = msg.public_ip || msg.ipAddress || conn.publicIp;
      conn.runtime = msg.runtime || 'phonefarm-native';
      return true;
    } catch {
      // Not a valid JWT, try device auth token
    }

    // Fallback: device auth token (phonefarm-relay bridge or direct device connection)
    if (token === this.#deviceAuthToken) {
      conn.authenticated = true;
      conn.deviceId = msg.device_id || msg.deviceId || `device-${Date.now()}`;
      conn.publicIp = msg.public_ip || msg.ipAddress || conn.publicIp;
      conn.runtime = msg.runtime || 'phonefarm-native';
      return true;
    }

    return false;
  }

  // ── NATS integration hooks (no-op when NATS is disabled) ──

  #publishNatsDeviceOnline(deviceId: string, info: Record<string, unknown>): void {
    if (natsSync?.isConnected) {
      try { natsSync.publishDeviceOnline(deviceId, info as any); } catch { /* NATS optional — no-op */ }
    }
  }

  #publishNatsDeviceOffline(deviceId: string): void {
    if (natsSync?.isConnected) {
      try { natsSync.publishDeviceOffline(deviceId); } catch { /* NATS optional — no-op */ }
    }
  }

  /** Rate-limit check: returns false if connection exceeded message rate. */
  #checkRateLimit(conn: DeviceConnection | FrontendConnection): boolean {
    const now = Date.now();
    if (now - conn.msgWindowStart > RATE_LIMIT_WINDOW_MS) {
      conn.msgCount = 0;
      conn.msgWindowStart = now;
    }
    conn.msgCount++;
    return conn.msgCount <= RATE_LIMIT_MAX_MSGS;
  }

  /** Gracefully shut down: close all connections, clear all timers. */
  dispose(): void {
    // Stop cleanup interval
    if (this.#cleanupInterval) {
      clearInterval(this.#cleanupInterval);
      this.#cleanupInterval = null;
    }
    // Clear all task timeouts
    for (const [taskId, timer] of this.#taskTimeouts) {
      clearTimeout(timer);
    }
    this.#taskTimeouts.clear();

    // Close all device connections
    for (const [deviceId, conn] of this.#devices) {
      this.#publishNatsDeviceOffline(deviceId);
      conn.ws.close();
    }
    this.#devices.clear();

    // Close all frontend connections
    for (const conn of this.#frontends) {
      conn.ws.close();
    }
    this.#frontends.clear();
  }
}

export let wsHub: WsHub;

export function initWsHub(deviceAuthToken: string): WsHub {
  wsHub = new WsHub(deviceAuthToken, process.env.JWT_SECRET);
  return wsHub;
}
