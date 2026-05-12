/**
 * RelayServer — WebSocket-based NAT traversal relay for scrcpy/control traffic.
 *
 * When Tailscale direct connections are unavailable (symmetric NAT, firewall),
 * devices and frontends connect through this relay as a fallback path.
 *
 * Architecture:
 *   Device  ←→  /ws/relay/device      (auth: DEVICE_AUTH_TOKEN)
 *   Frontend ←→ /ws/relay/frontend/:id (auth: JWT)
 *
 * The relay pairs connections by deviceId and bridges messages bidirectionally.
 * Both text (JSON control) and binary (H.264 video) frames are relayed as-is.
 *
 * Safety: connection-level backpressure, per-device frontend fan-out,
 * idle timeout (5 min), and per-relay byte caps to prevent memory exhaustion.
 */
import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';

// ── Types ──

interface DeviceRelayConn {
  ws: WebSocket;
  deviceId: string;
  authenticated: boolean;
  connectedAt: Date;
  lastActivity: Date;
  bytesIn: number;
  bytesOut: number;
}

interface FrontendRelayConn {
  ws: WebSocket;
  deviceId: string;
  authenticated: boolean;
  connectedAt: Date;
  lastActivity: Date;
  relayId: string;
}

interface RelayStats {
  activeDevices: number;
  activeFrontends: number;
  totalBytesRelayed: number;
  startedAt: string;
}

// ── Constants ──

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes idle → disconnect
const SWEEP_INTERVAL_MS = 30_000;       // 30 seconds
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024; // 16MB max single message

// ── RelayServer ──

export class RelayServer {
  #devices = new Map<string, DeviceRelayConn>();
  #frontends = new Map<string, FrontendRelayConn[]>();
  #token: string;
  #jwtSecret: string;
  #sweepTimer: ReturnType<typeof setInterval> | null = null;
  #totalBytesRelayed = 0;
  #startedAt: Date;

  constructor(deviceAuthToken: string, jwtSecret: string) {
    this.#token = deviceAuthToken;
    this.#jwtSecret = jwtSecret;
    this.#startedAt = new Date();
    this.#sweepTimer = setInterval(() => this.#sweepIdle(), SWEEP_INTERVAL_MS);
  }

  // ── Public API ──

  /** Handle a device-side WebSocket connection */
  handleDevice(ws: WebSocket): void {
    const conn: DeviceRelayConn = {
      ws,
      deviceId: '',
      authenticated: false,
      connectedAt: new Date(),
      lastActivity: new Date(),
      bytesIn: 0,
      bytesOut: 0,
    };

    let authTimeout: ReturnType<typeof setTimeout> | undefined;

    const failAuth = (reason: string) => {
      try { ws.send(JSON.stringify({ type: 'relay_error', message: reason })); } catch { /* */ }
      ws.close();
    };

    ws.on('message', (raw) => {
      conn.lastActivity = new Date();

      // First message MUST be auth
      if (!conn.authenticated) {
        try {
          const m = JSON.parse(raw.toString());
          if (m.type !== 'auth' || m.token !== this.#token || !m.device_id) {
            return failAuth('Authentication required: { type: "auth", token, device_id }');
          }
          conn.authenticated = true;
          conn.deviceId = m.device_id;
          clearTimeout(authTimeout);

          // Register device, replacing any previous connection
          const prev = this.#devices.get(conn.deviceId);
          if (prev) {
            try { prev.ws.close(); } catch { /* */ }
          }
          this.#devices.set(conn.deviceId, conn);
          ws.send(JSON.stringify({ type: 'relay_ready', device_id: conn.deviceId }));

          // Notify waiting frontends
          const fronts = this.#frontends.get(conn.deviceId);
          if (fronts?.length) {
            for (const f of fronts) {
              try { f.ws.send(JSON.stringify({ type: 'relay_device_online', device_id: conn.deviceId })); } catch { /* */ }
            }
          }
          return;
        } catch {
          return failAuth('Invalid auth message');
        }
      }

      // Authenticated — relay to all frontends for this device
      conn.bytesIn += typeof raw === 'string' ? Buffer.byteLength(raw) : (raw as Buffer).length;
      this.#relayToFrontends(conn.deviceId, raw);
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (conn.deviceId) {
        this.#devices.delete(conn.deviceId);
        // Notify frontends
        const fronts = this.#frontends.get(conn.deviceId);
        if (fronts?.length) {
          const msg = JSON.stringify({ type: 'relay_device_offline', device_id: conn.deviceId });
          for (const f of fronts) {
            try { f.ws.send(msg); } catch { /* */ }
          }
        }
      }
    });

    ws.on('error', () => { /* handled by close */ });

    // Auth timeout: 10 seconds to authenticate
    authTimeout = setTimeout(() => {
      if (!conn.authenticated) {
        failAuth('Authentication timeout');
      }
    }, 10000);
  }

  /** Handle a frontend-side WebSocket connection */
  handleFrontend(ws: WebSocket, deviceId: string): void {
    const relayId = randomUUID();
    const conn: FrontendRelayConn = {
      ws,
      deviceId,
      authenticated: false,
      connectedAt: new Date(),
      lastActivity: new Date(),
      relayId,
    };

    let authTimeout: ReturnType<typeof setTimeout> | undefined;

    const failAuth = (reason: string) => {
      try { ws.send(JSON.stringify({ type: 'relay_error', message: reason })); } catch { /* */ }
      ws.close();
    };

    ws.on('message', (raw) => {
      conn.lastActivity = new Date();

      // First message MUST be JWT auth
      if (!conn.authenticated) {
        try {
          const m = JSON.parse(raw.toString());
          if (m.type !== 'auth' || !m.token) {
            return failAuth('JWT authentication required');
          }
          try {
            const jwt = require('jsonwebtoken');
            jwt.verify(m.token, this.#jwtSecret);
            conn.authenticated = true;
            clearTimeout(authTimeout);
          } catch {
            return failAuth('Invalid JWT token');
          }

          // Register frontend
          let fronts = this.#frontends.get(deviceId);
          if (!fronts) {
            fronts = [];
            this.#frontends.set(deviceId, fronts);
          }
          fronts.push(conn);
          ws.send(JSON.stringify({ type: 'relay_ready', device_id: deviceId }));

          // Notify if device is online
          if (this.#devices.has(deviceId)) {
            ws.send(JSON.stringify({ type: 'relay_device_online', device_id: deviceId }));
          }
          return;
        } catch {
          return failAuth('Invalid auth message');
        }
      }

      // Authenticated — relay to device
      this.#relayToDevice(deviceId, raw);
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      const fronts = this.#frontends.get(deviceId);
      if (fronts) {
        const idx = fronts.findIndex(f => f.relayId === relayId);
        if (idx !== -1) fronts.splice(idx, 1);
        if (fronts.length === 0) this.#frontends.delete(deviceId);
      }
    });

    ws.on('error', () => { /* handled by close */ });

    // Auth timeout
    authTimeout = setTimeout(() => {
      if (!conn.authenticated) {
        failAuth('Authentication timeout');
      }
    }, 10000);
  }

  /** Check if a device is currently connected to the relay */
  isDeviceConnected(deviceId: string): boolean {
    return this.#devices.has(deviceId);
  }

  /** Get relay statistics */
  getStats(): RelayStats {
    return {
      activeDevices: this.#devices.size,
      activeFrontends: [...this.#frontends.values()].reduce((s, f) => s + f.length, 0),
      totalBytesRelayed: this.#totalBytesRelayed,
      startedAt: this.#startedAt.toISOString(),
    };
  }

  /** Clean up on shutdown */
  destroy(): void {
    if (this.#sweepTimer) {
      clearInterval(this.#sweepTimer);
      this.#sweepTimer = null;
    }
    for (const [, conn] of this.#devices) {
      try { conn.ws.close(); } catch { /* */ }
    }
    for (const [, fronts] of this.#frontends) {
      for (const f of fronts) {
        try { f.ws.close(); } catch { /* */ }
      }
    }
    this.#devices.clear();
    this.#frontends.clear();
  }

  // ── Internal ──

  #relayToFrontends(deviceId: string, data: any): void {
    const fronts = this.#frontends.get(deviceId);
    if (!fronts?.length) return;

    const len = typeof data === 'string' ? Buffer.byteLength(data) : (data as Buffer).length;
    if (len > MAX_PAYLOAD_BYTES) return;

    let sent = 0;
    for (const f of fronts) {
      if (f.ws.readyState === WebSocket.OPEN) {
        try {
          f.ws.send(data);
          sent++;
        } catch { /* */ }
      }
    }
    this.#totalBytesRelayed += len * sent;
  }

  #relayToDevice(deviceId: string, data: any): void {
    const device = this.#devices.get(deviceId);
    if (!device || device.ws.readyState !== WebSocket.OPEN) return;

    const len = typeof data === 'string' ? Buffer.byteLength(data) : (data as Buffer).length;
    if (len > MAX_PAYLOAD_BYTES) return;

    try {
      device.ws.send(data);
      device.bytesOut += len;
      this.#totalBytesRelayed += len;
    } catch { /* */ }
  }

  #sweepIdle(): void {
    const now = Date.now();

    // Sweep idle devices
    for (const [id, conn] of this.#devices) {
      if (now - conn.lastActivity.getTime() > IDLE_TIMEOUT_MS) {
        try { conn.ws.close(); } catch { /* */ }
        this.#devices.delete(id);
        const fronts = this.#frontends.get(id);
        if (fronts?.length) {
          const msg = JSON.stringify({ type: 'relay_device_offline', device_id: id });
          for (const f of fronts) {
            try { f.ws.send(msg); } catch { /* */ }
          }
        }
      }
    }

    // Sweep idle frontends
    for (const [deviceId, fronts] of this.#frontends) {
      const active = fronts.filter(f => {
        if (now - f.lastActivity.getTime() > IDLE_TIMEOUT_MS) {
          try { f.ws.close(); } catch { /* */ }
          return false;
        }
        return true;
      });
      if (active.length === 0) {
        this.#frontends.delete(deviceId);
      } else if (active.length !== fronts.length) {
        this.#frontends.set(deviceId, active);
      }
    }
  }
}
