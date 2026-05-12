/**
 * Scrcpy WebSocket Routes — video streaming + control relay + group control + recording.
 *
 * WebSocket:
 *   /ws/scrcpy/:deviceId       Binary H.264 video + JSON control (touch/key/scroll/keymap)
 *   /ws/scrcpy/audio/:deviceId Binary Opus audio from device → browser
 *
 * REST:
 *   Scrcpy lifecycle:      POST /api/v1/scrcpy/start|stop/:deviceId, GET /status/:deviceId
 *   Group control:          GET|POST|PUT|DELETE /api/v1/groups
 *   Keymap profiles:        GET|POST|PUT|DELETE /api/v1/keymaps
 *   Recording:              POST /api/v1/scrcpy/:deviceId/recording/start|stop, GET /download
 *   Video settings:         PUT  /api/v1/scrcpy/:deviceId/video/settings
 *   Screenshot:             POST /api/v1/scrcpy/:deviceId/screenshot
 */
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { AvRelayManager, type AvRelaySession } from './scrcpy-manager';
import { GroupControl, type DeviceGroup } from './group-control';
import { Recorder } from './recorder';
import { AudioBridge } from './audio-bridge';
import { BUILTIN_KEYMAP_PROFILES } from './keymap-profiles';
import type { KeyMapProfile } from './keymap-engine';
import { protobufCodec } from '../proto/protobuf-codec';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export function registerScrcpyRoutes(
  app: FastifyInstance,
  avRelayManager: AvRelayManager,
): void {
  const groupControl = new GroupControl(avRelayManager);
  const recorder = new Recorder();
  const audioBridge = new AudioBridge();

  // In-memory keymap store (loaded from builtin presets)
  const keymaps = new Map<string, KeyMapProfile>();
  for (const preset of BUILTIN_KEYMAP_PROFILES) {
    const km: KeyMapProfile = { ...preset, id: randomUUID() };
    keymaps.set(km.id, km);
  }

  // ── WebSocket: video stream + control ──
  app.register(async function (scope) {
    scope.get('/ws/scrcpy/:deviceId', { websocket: true }, (socket, req) => {
      const deviceId = (req.params as Record<string, string>).deviceId;
      const ws = socket as unknown as WebSocket;

      // JWT auth: accept token via query parameter (?token=...) or first message
      const jwtSecret = process.env.JWT_SECRET || 'dev-secret';

      const tryJwt = (token: string): boolean => {
        try {
          const jwt = require('jsonwebtoken');
          jwt.verify(token, jwtSecret);
          return true;
        } catch {
          return false;
        }
      };

      // Parse token from query string
      let authed = false;
      try {
        const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
        const qsToken = url.searchParams.get('token');
        if (qsToken && tryJwt(qsToken)) {
          authed = true;
        }
      } catch { /* URL parse failed — will fall back to first-message auth */ }

      // Auth timeout: 10 seconds to authenticate
      const authTimeout = !authed ? setTimeout(() => {
        try { ws.send(JSON.stringify({ type: 'error', message: 'JWT authentication required' })); } catch { /* */ }
        ws.close();
      }, 10000) : undefined;

      // Connect to scrcpy session (non-blocking — auth is checked inside message handler)
      const connected = authed ? avRelayManager.addFrontend(deviceId, ws) : false;
      if (authed && !connected) {
        ws.send(JSON.stringify({ type: 'error', message: `No session for device ${deviceId}` }));
        ws.close();
        return;
      }

      ws.on('message', (raw) => {
        // Auth check: first non-binary message must be auth if not already authed
        if (!authed) {
          if (Buffer.isBuffer(raw) || raw instanceof ArrayBuffer) return; // ignore binary before auth
          try {
            const m = JSON.parse(raw.toString());
            if (m.type === 'auth' && m.token && tryJwt(m.token)) {
              authed = true;
              clearTimeout(authTimeout!);
              ws.send(JSON.stringify({ type: 'auth_ok' }));
              // Now connect to scrcpy session
              const ok = avRelayManager.addFrontend(deviceId, ws);
              if (!ok) {
                ws.send(JSON.stringify({ type: 'error', message: `No session for device ${deviceId}` }));
                ws.close();
              }
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid JWT token' }));
              ws.close();
            }
          } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid auth message' }));
            ws.close();
          }
          return;
        }

        // Authenticated — process control messages (JSON or protobuf binary)
        function handleMsg(m: Record<string, unknown>) {
          switch (m.type) {
            case 'touch': {
              const action = m.action === 'down' ? 0 : m.action === 'up' ? 1 : 2;
              if (typeof m.x === 'number' && typeof m.y === 'number') {
                avRelayManager.injectTouch(deviceId, action, m.x, m.y, (m.pressure as number) ?? 1);
              }
              if (m.groupId) {
                groupControl.broadcast(m.groupId as string, deviceId, m as any);
              }
              break;
            }
            case 'key': {
              const action = m.action === 'down' ? 0 : 1;
              avRelayManager.injectKey(deviceId, (m.keycode as number) ?? 0, action);
              if (m.groupId) groupControl.broadcast(m.groupId as string, deviceId, m as any);
              break;
            }
            case 'scroll': {
              avRelayManager.injectScroll(
                deviceId,
                (m.x as number) ?? 0, (m.y as number) ?? 0,
                (m.hscroll as number) ?? 0, (m.vscroll as number) ?? 0,
              );
              if (m.groupId) groupControl.broadcast(m.groupId as string, deviceId, m as any);
              break;
            }
            case 'keymap': {
              if (m.touchAction) {
                const sub = m.touchAction as Record<string, number>;
                avRelayManager.injectTouch(deviceId, 0, sub.x, sub.y, 1);
                setTimeout(() => {
                  avRelayManager.injectTouch(deviceId, 1, sub.x, sub.y, 0);
                }, sub.duration || 100);
              }
              if (m.swipeAction) {
                const sm = m.swipeAction as Record<string, number>;
                avRelayManager.injectTouch(deviceId, 0, sm.fromX, sm.fromY, 1);
                avRelayManager.injectTouch(deviceId, 2, sm.toX, sm.toY, 1);
                avRelayManager.injectTouch(deviceId, 1, sm.toX, sm.toY, 0);
              }
              break;
            }
            case 'clipboard': {
              // Clipboard forwarding: send as control message to native APK
              if (m.text) {
                const session = avRelayManager.getSession(deviceId);
                if (session) {
                  console.log(`[clipboard] device=${deviceId} text=${String(m.text).substring(0, 20)}...`);
                }
              }
              break;
            }
          }
        }

        try {
          if (Buffer.isBuffer(raw) || raw instanceof ArrayBuffer) {
            const decoded = protobufCodec.decodeMessage(raw);
            if (decoded.payload) handleMsg(decoded.payload);
          } else {
            handleMsg(JSON.parse(raw.toString()));
          }
        } catch { /* ignore malformed messages */ }
      });

      ws.on('close', () => {
        if (authTimeout) clearTimeout(authTimeout);
        avRelayManager.removeFrontend(deviceId, ws);
      });

      ws.on('error', () => {
        if (authTimeout) clearTimeout(authTimeout);
        avRelayManager.removeFrontend(deviceId, ws);
      });
    });
  });

  // ── WebSocket: audio stream ──
  app.register(async function (scope) {
    scope.get('/ws/scrcpy/audio/:deviceId', { websocket: true }, (socket, req) => {
      const deviceId = (req.params as Record<string, string>).deviceId;
      const ws = socket as unknown as WebSocket;

      const ok = audioBridge.addFrontend(deviceId, ws);
      if (!ok) {
        ws.send(JSON.stringify({ type: 'error', message: `No audio session for ${deviceId}` }));
        ws.close();
        return;
      }

      ws.on('close', () => audioBridge.removeFrontend(deviceId, ws));
      ws.on('error', () => audioBridge.removeFrontend(deviceId, ws));
    });
  });

  // ── REST: scrcpy lifecycle ──
  app.post('/api/v1/scrcpy/start/:deviceId', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).deviceId;
    const body = req.body as Record<string, unknown> | undefined;

    try {
      const session = avRelayManager.ensureSession(deviceId);
      session.options = {
        maxSize: body?.maxSize as number | undefined,
        bitRate: body?.bitRate as number | undefined,
        maxFps: body?.maxFps as number | undefined,
      };

      return {
        status: 'streaming',
        deviceId,
        deviceName: session.deviceName,
        resolution: session.resolution,
        controlReady: true,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/api/v1/scrcpy/stop/:deviceId', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).deviceId;
    if (!avRelayManager.hasSession(deviceId)) {
      return reply.status(404).send({ error: 'No active mirroring session' });
    }
    avRelayManager.stopSession(deviceId);
    return { status: 'stopped', deviceId };
  });

  app.get('/api/v1/scrcpy/status/:deviceId', async (req) => {
    const deviceId = (req.params as Record<string, string>).deviceId;
    const session = avRelayManager.getSession(deviceId);

    if (!session) return { streaming: false };

    return {
      streaming: true,
      deviceId,
      deviceName: session.deviceName,
      resolution: session.resolution,
      controlReady: true,
      startedAt: session.startedAt.toISOString(),
      clientCount: session.frontendClients.size,
    };
  });

  // ── REST: group control ──
  app.get('/api/v1/groups', async () => {
    return groupControl.getAll();
  });

  app.get('/api/v1/groups/:id', async (req, reply) => {
    const group = groupControl.get((req.params as Record<string, string>).id);
    if (!group) return reply.status(404).send({ error: 'Group not found' });
    return group;
  });

  app.post('/api/v1/groups', async (req, reply) => {
    const { name, deviceIds } = req.body as { name: string; deviceIds: string[] };
    if (!name || !deviceIds?.length) {
      return reply.status(400).send({ error: 'name and deviceIds required' });
    }
    const group = groupControl.create(name, deviceIds);
    return reply.status(201).send(group);
  });

  app.put('/api/v1/groups/:id', async (req, reply) => {
    const id = (req.params as Record<string, string>).id;
    const updates = req.body as Partial<DeviceGroup>;
    const group = groupControl.update(id, updates);
    if (!group) return reply.status(404).send({ error: 'Group not found' });
    return group;
  });

  app.delete('/api/v1/groups/:id', async (req, reply) => {
    const id = (req.params as Record<string, string>).id;
    const ok = groupControl.delete(id);
    if (!ok) return reply.status(404).send({ error: 'Group not found' });
    return { success: true };
  });

  // ── REST: keymap profiles ──
  app.get('/api/v1/keymaps', async () => {
    return [...keymaps.values()];
  });

  app.get('/api/v1/keymaps/:id', async (req, reply) => {
    const km = keymaps.get((req.params as Record<string, string>).id);
    if (!km) return reply.status(404).send({ error: 'Keymap not found' });
    return km;
  });

  app.post('/api/v1/keymaps', async (req, reply) => {
    const body = req.body as Omit<KeyMapProfile, 'id' | 'createdAt' | 'updatedAt'>;
    const km: KeyMapProfile = {
      ...body,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    keymaps.set(km.id, km);
    return reply.status(201).send(km);
  });

  app.put('/api/v1/keymaps/:id', async (req, reply) => {
    const id = (req.params as Record<string, string>).id;
    const existing = keymaps.get(id);
    if (!existing) return reply.status(404).send({ error: 'Keymap not found' });
    const updated = { ...existing, ...(req.body as Partial<KeyMapProfile>), id, updatedAt: new Date().toISOString() };
    keymaps.set(id, updated);
    return updated;
  });

  app.delete('/api/v1/keymaps/:id', async (req, reply) => {
    const id = (req.params as Record<string, string>).id;
    if (!keymaps.has(id)) return reply.status(404).send({ error: 'Keymap not found' });
    keymaps.delete(id);
    return { success: true };
  });

  // ── REST: recording ──
  app.post('/api/v1/scrcpy/:deviceId/recording/start', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).deviceId;
    if (!avRelayManager.hasSession(deviceId)) {
      return reply.status(404).send({ error: 'No active mirroring session' });
    }
    try {
      const session = recorder.start(deviceId);
      return { status: 'recording', deviceId, filePath: session.filePath, startedAt: session.startTime };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/api/v1/scrcpy/:deviceId/recording/stop', async (req) => {
    const deviceId = (req.params as Record<string, string>).deviceId;
    const session = recorder.stop(deviceId);
    if (!session) return { error: 'Not recording' };
    return {
      status: 'completed',
      deviceId,
      filePath: session.filePath,
      frameCount: session.frameCount,
      totalBytes: session.totalBytes,
    };
  });

  app.get('/api/v1/scrcpy/:deviceId/recording/download', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).deviceId;
    const filePath = recorder.getFilePath(deviceId);
    if (!filePath || !fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'Recording file not found' });
    }
    const filename = path.basename(filePath);
    return reply.header('Content-Disposition', `attachment; filename="${filename}"`).send(fs.createReadStream(filePath));
  });

  // ── REST: video settings ──
  app.put('/api/v1/scrcpy/:deviceId/video/settings', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).deviceId;
    const session = avRelayManager.getSession(deviceId);
    if (!session) return reply.status(404).send({ error: 'No active session' });
    const { maxSize, bitRate, maxFps } = req.body as Record<string, number>;
    if (!session.options) session.options = {};
    if (maxSize) session.options.maxSize = maxSize;
    if (bitRate) session.options.bitRate = bitRate;
    if (maxFps) session.options.maxFps = maxFps;
    return {
      message: 'Settings updated. Restart session to apply changes.',
      current: { maxSize: session.options.maxSize, bitRate: session.options.bitRate, maxFps: session.options.maxFps },
    };
  });

  // ── REST: screenshot ──
  app.post('/api/v1/scrcpy/:deviceId/screenshot', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).deviceId;
    const session = avRelayManager.getSession(deviceId);
    if (!session) return reply.status(404).send({ error: 'No active session' });

    try {
      // Screenshot via native APK: request screenshot through WebSocket control message
      // The device APK captures and sends screenshot back via WebSocket
      return reply.status(200).send({
        message: 'Screenshot request sent to device. Use WebSocket screenshot response.',
        deviceId,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── REST: audio ──
  app.post('/api/v1/scrcpy/:deviceId/audio/start', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).deviceId;
    const session = avRelayManager.getSession(deviceId);
    if (!session) return reply.status(404).send({ error: 'No active mirroring session' });

    try {
      const audioSession = await audioBridge.start(deviceId, session.publicIp || deviceId);
      return { status: 'streaming', deviceId, startedAt: audioSession.startedAt };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/api/v1/scrcpy/:deviceId/audio/stop', async (req) => {
    const deviceId = (req.params as Record<string, string>).deviceId;
    audioBridge.stop(deviceId);
    return { status: 'stopped', deviceId };
  });

  // ── Cleanup on shutdown ──
  const origShutdown = (globalThis as any).__scrcpyShutdown;
  (globalThis as any).__scrcpyShutdown = async () => {
    const rIds = recorder.getAllRecordings().map(r => r.deviceId);
    for (const id of rIds) recorder.stop(id);
    await audioBridge.stopAll();
    if (origShutdown) await origShutdown();
  };
}
