/**
 * Native A/V Relay Manager — relays video/audio frames from PhoneFarm Native APK
 * to Dashboard frontend WebSocket clients.
 *
 * Architecture (after removing Tailscale):
 *   Phone APK (ScreenEncoder + AudioEncoder)
 *     → WebSocket binary (Protobuf VideoFrame/AudioFrame)
 *     → ws-hub → AvRelayManager → raw NAL/AAC → Dashboard MSE player
 *
 * Control (touch/key/scroll):
 *   Dashboard → WebSocket JSON → ws-hub → AvRelayManager
 *     → ws-hub.sendToDevice(JSON control message)
 *     → APK RemoteCommandHandler injects touch/key via AccessibilityService
 *
 * This replaces the old scrcpy-server.jar over ADB/Tailscale approach.
 * No ADB daemon, no scrcpy-server.jar, no Tailscale required.
 */

import { WebSocket } from 'ws';

// ── Types ──

export interface AvRelaySession {
  deviceId: string;
  deviceName: string;
  resolution: { width: number; height: number };
  frontendClients: Set<WebSocket>;
  startedAt: Date;
  /** Chunked H.264 buffer: list of pending chunks */
  h264Chunks: Buffer[];
  /** Total bytes in h264Chunks */
  h264TotalLen: number;
  intentionalStop: boolean;
  publicIp?: string;
  options?: { maxSize?: number; bitRate?: number; maxFps?: number };
}

const MAX_H264_BUFFER = 2 * 1024 * 1024; // 2MB
const MAX_CHUNKS = 200;

// ── AvRelayManager ──

type DeviceSender = (deviceId: string, message: object) => boolean;

export class AvRelayManager {
  private sessions = new Map<string, AvRelaySession>();
  private deviceSender: DeviceSender | null = null;

  /** Set the device message sender (from ws-hub) for control input forwarding */
  setDeviceSender(sender: DeviceSender): void {
    this.deviceSender = sender;
  }

  // ── Session lifecycle ──

  /** Create or update a relay session when a device starts streaming */
  ensureSession(
    deviceId: string,
    deviceName?: string,
    resolution?: { width: number; height: number },
    publicIp?: string,
  ): AvRelaySession {
    let session = this.sessions.get(deviceId);
    if (!session) {
      session = {
        deviceId,
        deviceName: deviceName || 'Unknown',
        resolution: resolution || { width: 1080, height: 2400 },
        frontendClients: new Set(),
        startedAt: new Date(),
        h264Chunks: [],
        h264TotalLen: 0,
        intentionalStop: false,
        publicIp,
      };
      this.sessions.set(deviceId, session);
    } else {
      if (deviceName) session.deviceName = deviceName;
      if (resolution) session.resolution = resolution;
    }
    return session;
  }

  getSession(deviceId: string): AvRelaySession | undefined {
    return this.sessions.get(deviceId);
  }

  hasSession(deviceId: string): boolean {
    return this.sessions.has(deviceId);
  }

  stopSession(deviceId: string): void {
    const session = this.sessions.get(deviceId);
    if (!session) return;

    session.intentionalStop = true;

    const msg = JSON.stringify({ type: 'session_closed', deviceId });
    for (const ws of session.frontendClients) {
      try { ws.send(msg); } catch { /* ignore */ }
    }

    this.sessions.delete(deviceId);
  }

  stopAll(): void {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      this.stopSession(id);
    }
  }

  // ── Frontend management ──

  addFrontend(deviceId: string, ws: WebSocket): boolean {
    const session = this.sessions.get(deviceId);
    if (!session) return false;

    session.frontendClients.add(ws);

    // Send current device meta immediately
    ws.send(JSON.stringify({
      type: 'device_meta',
      deviceId,
      deviceName: session.deviceName,
      resolution: session.resolution,
    }));

    return true;
  }

  removeFrontend(deviceId: string, ws: WebSocket): void {
    const session = this.sessions.get(deviceId);
    if (session) {
      session.frontendClients.delete(ws);
    }
  }

  // ── A/V frame relay ──

  /**
   * Handle an H.264 NAL unit from the native APK.
   * NAL units arrive as raw Annex B (with 0x00 0x00 0x00 0x01 start codes).
   * Relay directly to all subscribed frontend WebSocket clients.
   */
  relayNalUnit(deviceId: string, nalUnit: Buffer): void {
    const session = this.sessions.get(deviceId);
    if (!session) return;

    for (const ws of session.frontendClients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(nalUnit);
        } catch { /* ignore */ }
      }
    }
  }

  /**
   * Handle an AAC audio frame from the native APK.
   * AAC frames arrive as ADTS-framed data.
   */
  relayAudioFrame(deviceId: string, audioData: Buffer): void {
    const session = this.sessions.get(deviceId);
    if (!session) return;

    // Prefixed with 0x05 to distinguish audio from video (0x02) on the frontend
    const framed = Buffer.alloc(1 + audioData.length);
    framed[0] = 0x05; // audio frame marker
    audioData.copy(framed, 1);

    for (const ws of session.frontendClients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(framed);
        } catch { /* ignore */ }
      }
    }
  }

  // ── Bulk H.264 relay (for incoming Protobuf-decoded NAL units) ──

  /**
   * Add a raw H.264 chunk to the session's reassembly buffer and attempt
   * to extract complete NAL units for relay.
   */
  addH264Chunk(deviceId: string, chunk: Buffer): void {
    const session = this.sessions.get(deviceId);
    if (!session) return;

    session.h264Chunks.push(chunk);
    session.h264TotalLen += chunk.length;

    // Cap enforcement
    while (
      session.h264TotalLen > MAX_H264_BUFFER ||
      session.h264Chunks.length > MAX_CHUNKS
    ) {
      const removed = session.h264Chunks.shift();
      if (removed) session.h264TotalLen -= removed.length;
    }

    this.relayH264(deviceId);
  }

  private relayH264(deviceId: string): void {
    const session = this.sessions.get(deviceId);
    if (!session || session.h264Chunks.length === 0) return;

    const START_CODE = Buffer.from([0x00, 0x00, 0x00, 0x01]);

    const buffer = session.h264Chunks.length === 1
      ? session.h264Chunks[0]!
      : Buffer.concat(session.h264Chunks, session.h264TotalLen);

    let offset = 0;

    while (offset < buffer.length) {
      const startIdx = buffer.indexOf(START_CODE, offset);
      if (startIdx === -1) break;

      const nextStart = buffer.indexOf(START_CODE, startIdx + 4);
      if (nextStart === -1) break;

      const nalUnit = buffer.subarray(startIdx, nextStart);
      this.relayNalUnit(deviceId, nalUnit);
      offset = nextStart;
    }

    if (offset > 0) {
      const remaining = buffer.subarray(offset);
      session.h264Chunks = remaining.length > 0 ? [remaining] : [];
      session.h264TotalLen = remaining.length;
    }
  }

  // ── Control input (forwarded to APK via WebSocket JSON) ──

  /** List all active device IDs */
  getActiveDeviceIds(): string[] {
    return [...this.sessions.keys()];
  }

  // ── Control injection (forwarded to APK via WebSocket) ──

  injectTouch(deviceId: string, action: number, x: number, y: number, pressure: number): boolean {
    if (!this.deviceSender) return false;
    return this.deviceSender(deviceId, {
      type: 'control_input',
      payload: { type: 'touch', action, x, y, pressure },
    });
  }

  injectKey(deviceId: string, keycode: number, action: number): boolean {
    if (!this.deviceSender) return false;
    return this.deviceSender(deviceId, {
      type: 'control_input',
      payload: { type: 'key', keycode, action },
    });
  }

  injectScroll(deviceId: string, x: number, y: number, hscroll: number, vscroll: number): boolean {
    if (!this.deviceSender) return false;
    return this.deviceSender(deviceId, {
      type: 'control_input',
      payload: { type: 'scroll', x, y, hscroll, vscroll },
    });
  }

  /** Broadcast control input to a group of devices (for group control) */
  broadcastToGroup(
    deviceIds: string[],
    sourceDeviceId: string,
    msg: {
      type: string; action?: string; x?: number; y?: number; pressure?: number;
      keycode?: number; hscroll?: number; vscroll?: number; pointerId?: number;
    },
    sendToDevice: (deviceId: string, message: object) => boolean,
  ): number {
    let dispatched = 0;
    for (const deviceId of deviceIds) {
      if (deviceId === sourceDeviceId) continue;
      if (!this.hasSession(deviceId)) continue;

      setImmediate(() => {
        // Forward as JSON control message to the APK
        // The APK's RemoteCommandHandler will interpret and inject
        sendToDevice(deviceId, {
          type: 'control_input',
          payload: msg,
        });
      });
      dispatched++;
    }
    return dispatched;
  }
}

export const avRelayManager = new AvRelayManager();
