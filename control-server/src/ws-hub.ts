import { WebSocket } from 'ws';

interface DeviceConnection {
  ws: WebSocket;
  deviceId: string;
  publicIp: string;
  authenticated: boolean;
  connectedAt: Date;
  lastHeartbeat: Date;
  currentTaskId?: string;
  runtime?: string;
}

interface FrontendConnection {
  ws: WebSocket;
  subscribedDevices: Set<string>;
}

class WsHub {
  #devices = new Map<string, DeviceConnection>();
  #frontends = new Set<FrontendConnection>();
  #deviceAuthToken: string;

  constructor(deviceAuthToken: string) {
    this.#deviceAuthToken = deviceAuthToken;
  }

  handleDeviceUpgrade(ws: WebSocket, req: any) {
    const conn: DeviceConnection = {
      ws,
      deviceId: '',
      publicIp: req?.socket?.remoteAddress || req?.ip || 'unknown',
      authenticated: false,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    };

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.#handleDeviceMessage(conn, msg);
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.on('close', () => {
      if (conn.deviceId) {
        this.#devices.delete(conn.deviceId);
        this.#broadcastToFrontends({ type: 'device_offline', deviceId: conn.deviceId });
      }
    });

    ws.on('error', () => {});
  }

  #handleDeviceMessage(conn: DeviceConnection, msg: any) {
    switch (msg.type) {
      case 'auth':
        if (msg.token === this.#deviceAuthToken) {
          conn.authenticated = true;
          conn.deviceId = msg.device_id;
          conn.publicIp = msg.public_ip || conn.publicIp;
          conn.runtime = msg.runtime;
          this.#devices.set(conn.deviceId, conn);
          conn.ws.send(JSON.stringify({
            type: 'auth_ok',
            udpPort: 8444,
            natProbeEnabled: true,
          }));
          this.#broadcastToFrontends({
            type: 'device_online',
            deviceId: conn.deviceId,
            publicIp: conn.publicIp,
            model: msg.model,
            androidVersion: msg.android_version,
            deekeVersion: msg.deeke_version,
            runtime: conn.runtime,
          });
        } else {
          conn.ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid token' }));
        }
        break;

      case 'heartbeat':
        if (!conn.authenticated) return;
        conn.lastHeartbeat = new Date();
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
    }
  }

  handleFrontendUpgrade(ws: WebSocket, _req: any) {
    const conn: FrontendConnection = {
      ws,
      subscribedDevices: new Set(),
    };
    this.#frontends.add(conn);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'subscribe' && msg.deviceId) {
          conn.subscribedDevices.add(msg.deviceId);
        } else if (msg.type === 'unsubscribe' && msg.deviceId) {
          conn.subscribedDevices.delete(msg.deviceId);
        }
      } catch { /* ignore */ }
    });

    ws.on('close', () => {
      this.#frontends.delete(conn);
    });

    ws.on('error', () => {});
  }

  sendToDevice(deviceId: string, message: object): boolean {
    const conn = this.#devices.get(deviceId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;
    conn.ws.send(JSON.stringify(message));
    return true;
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

  #broadcastToFrontends(message: object, onlyForDevice?: string) {
    const msg = JSON.stringify(message);
    for (const conn of this.#frontends) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        if (onlyForDevice && !conn.subscribedDevices.has(onlyForDevice)) continue;
        conn.ws.send(msg);
      }
    }
  }
}

export let wsHub: WsHub;

export function initWsHub(deviceAuthToken: string): WsHub {
  wsHub = new WsHub(deviceAuthToken);
  return wsHub;
}
