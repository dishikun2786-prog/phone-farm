/**
 * BridgeServer — 公网 VPS 中继服务器。
 *
 * 架构（分裂部署）：
 *   手机设备 ──→ VPS BridgeServer ──→ 本地控制服务器 (BridgeClient)
 *   前端 Dashboard ──→ VPS BridgeServer ──→ 本地控制服务器
 *
 * 三组 WebSocket 端点：
 *   /ws/control   — 本地控制服务器出站隧道连接（仅 1 个）
 *   /ws/phone     — 手机设备入站连接
 *   /ws/frontend  — Dashboard 前端入站连接
 *
 * 协议（Control ↔ BridgeServer）：
 *   Control → Server:  { type: "control_auth", token }
 *   Server → Control:  { type: "device_connected", deviceId, remoteAddress }
 *   Server → Control:  { type: "device_message", deviceId, payload: "..." }
 *   Control → Server:  { type: "send_to_device", deviceId, payload: "..." }
 *   Server → Control:  { type: "device_disconnected", deviceId }
 *   Server → Control:  { type: "frontend_connected", frontendId }
 *   Server → Control:  { type: "frontend_message", frontendId, payload: "..." }
 *   Control → Server:  { type: "send_to_frontend", frontendId, payload: "..." }
 *   Server → Control:  { type: "frontend_disconnected", frontendId }
 *
 * UDP :8444 → 音视频帧中继转发给 Control 隧道（二进制 message）
 */

import { randomUUID } from 'crypto';
import type { Socket as DgramSocket, RemoteInfo } from 'dgram';
import dgram from 'dgram';
import jwt from 'jsonwebtoken';
import { WebSocket } from 'ws';
import { AiBridgeRouter } from '../ai-orchestrator/ai-bridge-router';
import type { AiMessage } from '../ai-orchestrator/types';

// ── Types ──

interface PhoneConn {
  ws: WebSocket;
  deviceId: string;
  remoteAddress: string;
  authenticated: boolean;
  connectedAt: Date;
  lastActivity: Date;
}

interface FrontendConn {
  ws: WebSocket;
  frontendId: string;
  authenticated: boolean;
  connectedAt: Date;
  lastActivity: Date;
}

interface BridgeStats {
  controlConnected: boolean;
  activePhones: number;
  activeFrontends: number;
  startedAt: string;
}

// ── Constants ──

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 30_000;
const AUTH_TIMEOUT_MS = 10_000;

// ── BridgeServer ──

export class BridgeServer {
  #phones = new Map<string, PhoneConn>();
  #frontends = new Map<string, FrontendConn>();
  #controlWs: WebSocket | null = null;
  #controlToken: string;
  #deviceAuthToken: string;
  #jwtSecret: string;
  #sweepTimer: ReturnType<typeof setInterval> | null = null;
  #startedAt: Date;
  #udpSocket: DgramSocket | null = null;
  #udpPort: number;
  #aiRouter: AiBridgeRouter;

  constructor(opts: {
    controlToken: string;
    deviceAuthToken: string;
    jwtSecret: string;
    udpPort?: number;
    aiAuthToken?: string;
  }) {
    this.#controlToken = opts.controlToken;
    this.#deviceAuthToken = opts.deviceAuthToken;
    this.#jwtSecret = opts.jwtSecret;
    this.#udpPort = opts.udpPort ?? 8444;
    this.#startedAt = new Date();
    this.#sweepTimer = setInterval(() => this.#sweepIdle(), SWEEP_INTERVAL_MS);

    // AI Orchestrator — 分布式 AI Agent 消息路由
    this.#aiRouter = new AiBridgeRouter(opts.aiAuthToken || opts.controlToken);
    // 将 AI 消息通过 control 隧道发送给 Claude Code
    this.#aiRouter.sendToControl = (msg: AiMessage) => {
      this.#notifyControl(msg);
    };
  }

  /** Access AiBridgeRouter for stats and worker management */
  get aiRouter(): AiBridgeRouter {
    return this.#aiRouter;
  }

  // ── UDP relay for A/V frames ──

  startUdpRelay(): void {
    const socket = dgram.createSocket('udp4');
    this.#udpSocket = socket;

    socket.on('message', (msg: Buffer, rinfo: RemoteInfo) => {
      const ctrl = this.#controlWs;
      if (!ctrl || ctrl.readyState !== WebSocket.OPEN) return;
      // Look up device by source IP to tag the frame
      const deviceId = this.#findDeviceByIp(rinfo.address);
      // Prepend 4-byte deviceId length + UTF-8 deviceId + raw frame data
      const idBuf = deviceId ? Buffer.from(deviceId, 'utf-8') : Buffer.from('unknown', 'utf-8');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(idBuf.length, 0);
      const framed = Buffer.concat([header, idBuf, msg]);
      try {
        ctrl.send(framed);
      } catch { /* ignore */ }
    });

    socket.on('error', (err: Error) => {
      console.error('[BridgeServer] UDP error:', err.message);
    });

    socket.bind(this.#udpPort, () => {
      console.log(`[BridgeServer] UDP relay listening on :${this.#udpPort}`);
    });
  }

  // ── Control connection (local server tunnel) ──

  handleControl(ws: WebSocket): void {
    if (this.#controlWs) {
      try { this.#controlWs.close(); } catch { /* */ }
    }
    this.#controlWs = ws;

    let authed = false;
    let authTimeout: ReturnType<typeof setTimeout> | undefined;

    const failAuth = (reason: string) => {
      try { ws.send(JSON.stringify({ type: 'control_error', message: reason })); } catch { /* */ }
      ws.close();
    };

    ws.on('message', (raw) => {
      // First message must be auth
      if (!authed) {
        try {
          const m = JSON.parse(raw.toString());
          if (m.type !== 'control_auth' || m.token !== this.#controlToken) {
            return failAuth('Control authentication required');
          }
          authed = true;
          clearTimeout(authTimeout);
          ws.send(JSON.stringify({ type: 'control_ready' }));
          console.log('[BridgeServer] Control connected');
          return;
        } catch {
          return failAuth('Invalid control auth message');
        }
      }

      // Authenticated — route to phone, frontend, or AI
      try {
        const m = JSON.parse(raw.toString());
        // AI orchestration messages — route to AiBridgeRouter
        if (m.type?.startsWith('ai_')) {
          this.#aiRouter.routeFromControl(m as AiMessage);
          return;
        }
        switch (m.type) {
          case 'send_to_device':
            this.#sendToPhone(m.deviceId, m.payload);
            break;
          case 'send_to_frontend':
            this.#sendToFrontend(m.frontendId, m.payload);
            break;
          case 'broadcast':
            // Broadcast to all frontends
            this.#broadcastToFrontends(m.payload);
            break;
        }
      } catch { /* ignore malformed JSON */ }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (this.#controlWs === ws) {
        this.#controlWs = null;
        console.log('[BridgeServer] Control disconnected');
        // Disconnect all phones and frontends
        for (const [, conn] of this.#phones) {
          try { conn.ws.close(); } catch { /* */ }
        }
        for (const [, conn] of this.#frontends) {
          try { conn.ws.close(); } catch { /* */ }
        }
        this.#phones.clear();
        this.#frontends.clear();
      }
    });

    ws.on('error', () => { /* handled by close */ });

    authTimeout = setTimeout(() => {
      if (!authed) failAuth('Control authentication timeout');
    }, AUTH_TIMEOUT_MS);
  }

  // ── Phone device connection ──

  handlePhone(ws: WebSocket, remoteAddress: string): void {
    let authed = false;
    let deviceId = '';
    let authTimeout: ReturnType<typeof setTimeout> | undefined;

    const failAuth = (reason: string) => {
      try { ws.send(JSON.stringify({ type: 'error', message: reason })); } catch { /* */ }
      ws.close();
    };

    ws.on('message', (raw) => {
      try {
        // First message must be auth — try JWT first, then device auth token
        if (!authed) {
          const m = JSON.parse(raw.toString());
          if (m.type !== 'auth' || !m.token) {
            return failAuth('Device authentication required');
          }
          // Try JWT verification first (APK login flow), fallback to device auth token
          let tokenValid = false;
          try {
            jwt.verify(m.token, this.#jwtSecret, { algorithms: ['HS256'] });
            tokenValid = true;
          } catch {
            // Not a valid JWT, try device auth token
            if (m.token === this.#deviceAuthToken) {
              tokenValid = true;
            }
          }
          if (!tokenValid) {
            return failAuth('Invalid token');
          }
          authed = true;
          deviceId = m.device_id || m.deviceId || '';
          clearTimeout(authTimeout);

          const conn: PhoneConn = {
            ws, deviceId, remoteAddress, authenticated: true,
            connectedAt: new Date(), lastActivity: new Date(),
          };

          // Replace previous connection for same deviceId
          const prev = this.#phones.get(deviceId);
          if (prev) try { prev.ws.close(); } catch { /* */ }
          this.#phones.set(deviceId, conn);

          // Notify control
          this.#notifyControl({
            type: 'device_connected',
            deviceId,
            remoteAddress,
          });

          return;
        }

        // Authenticated — forward to control
        const conn = this.#phones.get(deviceId);
        if (conn) conn.lastActivity = new Date();

        this.#notifyControl({
          type: 'device_message',
          deviceId,
          payload: raw.toString(),
        });
      } catch { /* ignore */ }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (authed && deviceId) {
        this.#phones.delete(deviceId);
        this.#notifyControl({ type: 'device_disconnected', deviceId });
      }
    });

    ws.on('error', () => { /* handled by close */ });

    authTimeout = setTimeout(() => {
      if (!authed) failAuth('Device authentication timeout');
    }, AUTH_TIMEOUT_MS);
  }

  // ── Frontend (Dashboard) connection ──

  handleFrontend(ws: WebSocket, req?: any): void {
    const frontendId = randomUUID();
    let authed = false;
    let authTimeout: ReturnType<typeof setTimeout> | undefined;

    const tryAuth = (token: string): boolean => {
      try {
        jwt.verify(token, this.#jwtSecret);
        authed = true;
        clearTimeout(authTimeout);
        return true;
      } catch {
        return false;
      }
    };

    const failAuth = (reason: string) => {
      try { ws.send(JSON.stringify({ type: 'auth_error', message: reason })); } catch { /* */ }
      ws.close();
    };

    // Try token from URL query param first (sent by dashboard frontend)
    const urlToken = (() => {
      try {
        const url = new URL(req?.url || '/', 'http://localhost');
        return url.searchParams.get('token') || '';
      } catch { return ''; }
    })();

    if (urlToken && tryAuth(urlToken)) {
      const conn: FrontendConn = {
        ws, frontendId, authenticated: true,
        connectedAt: new Date(), lastActivity: new Date(),
      };
      this.#frontends.set(frontendId, conn);
      ws.send(JSON.stringify({ type: 'auth_ok' }));
      this.#notifyControl({ type: 'frontend_connected', frontendId });
    }

    ws.on('message', (raw) => {
      try {
        // Handle ping heartbeat (don't forward to control)
        const m = JSON.parse(raw.toString());
        if (m.type === 'ping') {
          // Already authenticated or not — still keep connection alive
          const conn = this.#frontends.get(frontendId);
          if (conn) conn.lastActivity = new Date();
          return;
        }

        // First message must be JWT auth (if not already authed via URL)
        if (!authed) {
          if (m.type !== 'auth' || !m.token) {
            return failAuth('JWT authentication required — send { type: "auth", token: "..." }');
          }
          if (!tryAuth(m.token)) {
            return failAuth('Invalid JWT token');
          }

          const conn: FrontendConn = {
            ws, frontendId, authenticated: true,
            connectedAt: new Date(), lastActivity: new Date(),
          };
          this.#frontends.set(frontendId, conn);
          ws.send(JSON.stringify({ type: 'auth_ok' }));
          this.#notifyControl({ type: 'frontend_connected', frontendId });
          return;
        }

        // Authenticated — forward to control
        const conn = this.#frontends.get(frontendId);
        if (conn) conn.lastActivity = new Date();

        this.#notifyControl({
          type: 'frontend_message',
          frontendId,
          payload: raw.toString(),
        });
      } catch { /* ignore */ }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (authed) {
        this.#frontends.delete(frontendId);
        this.#notifyControl({ type: 'frontend_disconnected', frontendId });
      }
    });

    ws.on('error', () => { /* handled by close */ });

    // Set auth timeout only if not already authenticated via URL token
    if (!authed) {
      authTimeout = setTimeout(() => {
        if (!authed) failAuth('Frontend authentication timeout (30s)');
      }, 30_000); // Increased from 10s to 30s
    }
  }

  // ── AI Worker / AI Control connections ──

  /** Handle AI worker connection (/ws/ai/worker) */
  handleAiWorker(ws: WebSocket, remoteAddress: string): void {
    this.#aiRouter.handleWorkerConnection(ws, remoteAddress);
  }

  /** Handle AI control connection (/ws/ai/control) — Claude Code CLI direct connect */
  handleAiControl(ws: WebSocket): void {
    let authed = false;
    let authTimeout: ReturnType<typeof setTimeout> | undefined;

    const failAuth = (reason: string) => {
      try { ws.send(JSON.stringify({ type: 'ai_handshake_ack', success: false, error: reason })); } catch { /* */ }
      ws.close();
    };

    ws.on('message', (raw) => {
      try {
        if (!authed) {
          const m = JSON.parse(raw.toString());
          // Accept ai_handshake with token or direct ai_task_assign with auth header
          const token = m.payload?.token || m.token;
          if (!token || (token !== this.#controlToken)) {
            return failAuth('AI authentication required');
          }
          authed = true;
          clearTimeout(authTimeout);
          ws.send(JSON.stringify({
            type: 'ai_handshake_ack',
            msgId: randomUUID(),
            ts: new Date().toISOString(),
            payload: { success: true, role: 'control' },
          }));
          return;
        }

        // Route AI messages from Claude Code to workers
        const msg = JSON.parse(raw.toString());
        this.#aiRouter.routeFromControl(msg);
      } catch { /* ignore */ }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
    });

    ws.on('error', () => { /* handled by close */ });

    authTimeout = setTimeout(() => {
      if (!authed) failAuth('Authentication timeout');
    }, AUTH_TIMEOUT_MS);
  }

  // ── Stats ──

  getStats(): BridgeStats {
    return {
      controlConnected: this.#controlWs !== null && this.#controlWs.readyState === WebSocket.OPEN,
      activePhones: this.#phones.size,
      activeFrontends: this.#frontends.size,
      startedAt: this.#startedAt.toISOString(),
    };
  }

  // ── Cleanup ──

  destroy(): void {
    if (this.#sweepTimer) { clearInterval(this.#sweepTimer); this.#sweepTimer = null; }
    if (this.#udpSocket) { try { this.#udpSocket.close(); } catch { /* */ } this.#udpSocket = null; }
    if (this.#controlWs) { try { this.#controlWs.close(); } catch { /* */ } }
    for (const [, conn] of this.#phones) { try { conn.ws.close(); } catch { /* */ } }
    for (const [, conn] of this.#frontends) { try { conn.ws.close(); } catch { /* */ } }
    this.#phones.clear();
    this.#frontends.clear();
    this.#aiRouter.destroy();
  }

  // ── Internal ──

  #notifyControl(msg: object): void {
    if (this.#controlWs && this.#controlWs.readyState === WebSocket.OPEN) {
      try { this.#controlWs.send(JSON.stringify(msg)); } catch { /* */ }
    }
  }

  #sendToPhone(deviceId: string, payload: string): void {
    const conn = this.#phones.get(deviceId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      try { conn.ws.send(payload); } catch { /* */ }
    }
  }

  #sendToFrontend(frontendId: string, payload: string): void {
    const conn = this.#frontends.get(frontendId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      try { conn.ws.send(payload); } catch { /* */ }
    }
  }

  #broadcastToFrontends(payload: string): void {
    for (const [, conn] of this.#frontends) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        try { conn.ws.send(payload); } catch { /* */ }
      }
    }
  }

  #findDeviceByIp(ip: string): string | null {
    for (const [deviceId, conn] of this.#phones) {
      if (conn.remoteAddress === ip) return deviceId;
    }
    return null;
  }

  #sweepIdle(): void {
    const now = Date.now();
    for (const [id, conn] of this.#phones) {
      if (now - conn.lastActivity.getTime() > IDLE_TIMEOUT_MS) {
        try { conn.ws.close(); } catch { /* */ }
        this.#phones.delete(id);
        this.#notifyControl({ type: 'device_disconnected', deviceId: id });
      }
    }
    for (const [id, conn] of this.#frontends) {
      if (now - conn.lastActivity.getTime() > IDLE_TIMEOUT_MS) {
        try { conn.ws.close(); } catch { /* */ }
        this.#frontends.delete(id);
        this.#notifyControl({ type: 'frontend_disconnected', frontendId: id });
      }
    }
  }
}
