/**
 * AudioBridge — device audio forwarding via sndcpy (Android 10+).
 *
 * sndcpy uses Android's AudioPlaybackCapture API to capture device audio
 * and streams it as Opus-encoded PCM over a WebSocket to the browser.
 *
 * This module manages sndcpy lifecycle on the device and relays audio
 * packets to connected frontend WebSocket clients.
 *
 * Requires: Android 10+ (API 29+), sndcpy binary on device.
 */
import type { WebSocket } from 'ws';
import { spawn, execSync, type ChildProcess } from 'child_process';
import * as net from 'net';

export interface AudioSession {
  deviceId: string;
  tailscaleIp: string;
  sndcpyProcess: ChildProcess | null;
  forwardPort: number;
  localSocket: net.Socket | null;
  frontendClients: Set<WebSocket>;
  startedAt: Date;
}

export class AudioBridge {
  private sessions = new Map<string, AudioSession>();
  private sndcpyBinaryPath: string;

  constructor(sndcpyBinaryPath?: string) {
    this.sndcpyBinaryPath = sndcpyBinaryPath || '/data/local/tmp/sndcpy';
  }

  async start(deviceId: string, tailscaleIp: string): Promise<AudioSession> {
    if (this.sessions.has(deviceId)) {
      throw new Error(`Audio already streaming for device ${deviceId}`);
    }

    const adbTarget = `${tailscaleIp}:5555`;

    // Check Android version (must be >= 10)
    try {
      const sdkVersion = execSync(
        `adb -s ${adbTarget} shell getprop ro.build.version.sdk`,
        { encoding: 'utf-8', timeout: 5000 },
      ).trim();
      if (parseInt(sdkVersion, 10) < 29) {
        throw new Error(`Audio capture requires Android 10+ (SDK 29), device has SDK ${sdkVersion}`);
      }
    } catch (err: any) {
      throw new Error(`Cannot determine Android version: ${err.message}`);
    }

    // Start sndcpy on device
    const proc = spawn('adb', ['-s', adbTarget, 'shell', `${this.sndcpyBinaryPath}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const session: AudioSession = {
      deviceId,
      tailscaleIp,
      sndcpyProcess: proc,
      forwardPort: 0,
      localSocket: null,
      frontendClients: new Set(),
      startedAt: new Date(),
    };

    proc.on('exit', (code) => {
      console.log(`[AudioBridge] sndcpy exited (${code}) for ${deviceId}`);
      this.stopSession(deviceId);
    });

    this.sessions.set(deviceId, session);

    // Forward audio port (sndcpy uses port 28200 by default)
    try {
      const localPort = await new Promise<number>((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
          const port = (server.address() as net.AddressInfo).port;
          server.close(() => resolve(port));
        });
        server.on('error', reject);
      });

      execSync(
        `adb -s ${adbTarget} forward tcp:${localPort} tcp:28200`,
        { timeout: 5000 },
      );
      session.forwardPort = localPort;

      // Connect local socket to receive audio
      const socket = new net.Socket();
      await new Promise<void>((resolve, reject) => {
        socket.connect(localPort, '127.0.0.1', () => resolve());
        socket.once('error', reject);
        setTimeout(() => reject(new Error('Audio socket connect timeout')), 5000);
      });

      session.localSocket = socket;

      // Relay audio data to frontends
      socket.on('data', (chunk: Buffer) => {
        for (const ws of session.frontendClients) {
          if (ws.readyState === ws.OPEN) {
            try { ws.send(chunk); } catch { /* */ }
          }
        }
      });

      socket.on('error', () => {
        this.stopSession(deviceId);
      });
    } catch (err: any) {
      console.log(`[AudioBridge] Audio forward setup failed: ${err.message}`);
    }

    return session;
  }

  private stopSession(deviceId: string): void {
    const session = this.sessions.get(deviceId);
    if (!session) return;

    session.sndcpyProcess?.kill();
    session.localSocket?.destroy();

    if (session.forwardPort > 0) {
      try {
        execSync(
          `adb -s ${session.tailscaleIp}:5555 forward --remove tcp:${session.forwardPort}`,
          { timeout: 3000 },
        );
      } catch { /* */ }
    }

    const msg = JSON.stringify({ type: 'audio_closed', deviceId });
    for (const ws of session.frontendClients) {
      try { ws.send(msg); } catch { /* */ }
    }

    this.sessions.delete(deviceId);
  }

  stop(deviceId: string): void {
    this.stopSession(deviceId);
  }

  addFrontend(deviceId: string, ws: WebSocket): boolean {
    const session = this.sessions.get(deviceId);
    if (!session) return false;
    session.frontendClients.add(ws);
    return true;
  }

  removeFrontend(deviceId: string, ws: WebSocket): void {
    const session = this.sessions.get(deviceId);
    if (session) session.frontendClients.delete(ws);
  }

  getSession(deviceId: string): AudioSession | undefined {
    return this.sessions.get(deviceId);
  }

  async stopAll(): Promise<void> {
    for (const id of this.sessions.keys()) {
      this.stop(id);
    }
  }
}
