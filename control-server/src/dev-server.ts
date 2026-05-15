/**
 * Dev server — self-contained, no PostgreSQL/Redis needed.
 * Uses JSON file store + WebSocket hub + REST API.
 * Start with: npx tsx src/dev-server.ts
 */
import 'dotenv/config';
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { registerVlmRoutes } from './vlm/vlm-routes';
import { registerVlmModelRoutes, DEFAULT_MODEL_SEEDS, type VlmModelConfig } from './vlm/vlm-model-routes';
import { AvRelayManager, registerScrcpyRoutes, FileManager, registerFileRoutes, registerAdbRoutes, registerScriptDeployRoutes } from './scrcpy';
import { RelayServer } from './relay/relay-server';
import { BridgeClient } from './relay/bridge-client';
import { config } from './config';

const DATA_FILE = path.join(process.cwd(), '.dev-data.json');
const PORT = parseInt(process.env.PORT || '8445');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const DEVICE_AUTH_TOKEN = process.env.DEVICE_AUTH_TOKEN || 'device-auth-token-change-me';

// ============== File Store ==============
interface Store {
  devices: any[];
  accounts: any[];
  taskTemplates: any[];
  tasks: any[];
  executions: any[];
  vlmModels: VlmModelConfig[];
}

function loadStore(): Store {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {}
  return { devices: [], accounts: [], taskTemplates: [], tasks: [], executions: [], vlmModels: [] };
}

// Atomic write: write to temp file then rename (POSIX atomic)
function saveStore(s: Store) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

let store = loadStore();

// Dirty-flag debounce: avoid writing on every heartbeat.
// Persist at most once per FLUSH_INTERVAL_MS, or immediately on structural changes.
let storeDirty = false;
let lastFlush = Date.now();
const FLUSH_INTERVAL_MS = 5000; // 5 seconds between persisted snapshots
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function markDirty() {
  storeDirty = true;
  const elapsed = Date.now() - lastFlush;
  if (elapsed >= FLUSH_INTERVAL_MS) {
    flushStore();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushStore, FLUSH_INTERVAL_MS - elapsed);
  }
}

function flushStore() {
  if (!storeDirty) return;
  storeDirty = false;
  lastFlush = Date.now();
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  try { saveStore(store); } catch { /* log but don't crash */ }
}

// Device index for O(1) lookup by ID (replaces store.devices.find())
const deviceIndex = new Map<string, any>();
for (const d of store.devices) deviceIndex.set(d.id, d);

// ============== WebSocket Hub ==============
import { WebSocket } from 'ws';

interface DevConn {
  ws: WebSocket;
  deviceId: string;
  publicIp: string;
  authenticated: boolean;
  lastHeartbeat: Date;
  currentTaskId?: string;
  runtime?: string;
}

class DevHub {
  #devices = new Map<string, DevConn>();
  #frontends = new Set<{ ws: WebSocket; subs: Set<string>; authenticated: boolean }>();
  #token: string;
  #jwtSecret: string;
  #sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(token: string, jwtSecret: string) {
    this.#token = token;
    this.#jwtSecret = jwtSecret;
    // Stale connection sweep every 30 seconds
    this.#sweepTimer = setInterval(() => this.#sweepStaleDevices(), 30000);
  }

  /** Disconnect devices that haven't heartbeated in 60 seconds */
  #sweepStaleDevices(): void {
    const now = Date.now();
    for (const [id, conn] of this.#devices) {
      if (now - conn.lastHeartbeat.getTime() > 60000) {
        try { conn.ws.close(); } catch { /* */ }
        this.#devices.delete(id);
        const dev = deviceIndex.get(id);
        if (dev) { dev.status = 'offline'; markDirty(); }
        this.#broadcast({ type: 'device_offline', deviceId: id });
      }
    }
  }

  /** Clean up the sweep timer (call on shutdown) */
  destroy(): void {
    if (this.#sweepTimer) { clearInterval(this.#sweepTimer); this.#sweepTimer = null; }
  }

  handleDevice(ws: WebSocket, req: any) {
    const conn: DevConn = {
      ws, deviceId: '', publicIp: req?.socket?.remoteAddress || 'unknown',
      authenticated: false, lastHeartbeat: new Date(),
    };

    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        if (m.type === 'auth' && m.token === this.#token) {
          conn.authenticated = true;
          conn.deviceId = m.device_id;
          conn.publicIp = m.public_ip || conn.publicIp;
          conn.runtime = m.runtime || 'deeke';
          this.#devices.set(conn.deviceId, conn);
          ws.send(JSON.stringify({
            type: 'auth_ok',
            udpPort: 8444,
            natProbeEnabled: true,
          }));

          // Track runtime for dual-runtime support (deeke | autox)
          const runtime = conn.runtime;

          // Auto-register device in store (O(1) with deviceIndex)
          const exists = deviceIndex.get(m.device_id);
          if (!exists) {
            const dev = {
              id: m.device_id,
              name: m.device_id,
              publicIp: conn.publicIp,
              model: m.model || 'Unknown',
              androidVersion: m.android_version || 'Unknown',
              deekeVersion: m.deeke_version || 'Unknown',
              runtime,
              status: 'online',
              lastSeen: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            store.devices.push(dev);
            deviceIndex.set(m.device_id, dev);
          } else {
            exists.status = 'online';
            exists.lastSeen = new Date().toISOString();
            exists.publicIp = conn.publicIp;
            exists.runtime = runtime;
          }
          saveStore(store); // structural change — persist immediately

          this.#broadcast({ type: 'device_online', deviceId: conn.deviceId, publicIp: conn.publicIp, runtime: conn.runtime });
        } else if (m.type === 'heartbeat' && conn.authenticated) {
          conn.lastHeartbeat = new Date();
          const dev = deviceIndex.get(conn.deviceId);
          if (dev) {
            dev.battery = m.battery;
            dev.currentApp = m.current_app;
            dev.screenOn = m.screen_on;
            dev.lastSeen = new Date().toISOString();
            dev.status = 'online';
            markDirty(); // debounced — not every heartbeat
          }
          this.#broadcast({ type: 'device_heartbeat', deviceId: conn.deviceId, battery: m.battery, currentApp: m.current_app, screenOn: m.screen_on });
        } else if (m.type === 'screenshot' && conn.authenticated) {
          this.#broadcast({ type: 'device_screenshot', deviceId: conn.deviceId, data: m.data }, conn.deviceId);
        } else if (m.type === 'task_status' && conn.authenticated) {
          this.#broadcast({ type: 'task_status_update', deviceId: conn.deviceId, taskId: m.task_id, status: m.status, step: m.step, message: m.message });
        } else if (m.type === 'task_result' && conn.authenticated) {
          const exec = store.executions.find(e => e.id === m.task_id);
          if (exec) {
            exec.status = m.status;
            exec.stats = m.stats || {};
            exec.finishedAt = new Date().toISOString();
            markDirty();
          }
          this.#broadcast({ type: 'task_result', deviceId: conn.deviceId, taskId: m.task_id, status: m.status, stats: m.stats });
        }
      } catch {}
    });

    ws.on('close', () => {
      if (conn.deviceId) {
        this.#devices.delete(conn.deviceId);
        const dev = deviceIndex.get(conn.deviceId);
        if (dev) { dev.status = 'offline'; markDirty(); }
        this.#broadcast({ type: 'device_offline', deviceId: conn.deviceId });
      }
    });
  }

  handleFrontend(ws: WebSocket) {
    const conn = { ws, subs: new Set<string>(), authenticated: false };
    this.#frontends.add(conn);

    // Require JWT auth within 10 seconds, else close
    const authTimeout = setTimeout(() => {
      if (!conn.authenticated) {
        try { ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' })); } catch { /* */ }
        ws.close();
      }
    }, 10000);

    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        // Auth message: { type: "auth", token: "jwt..." }
        if (m.type === 'auth' && m.token) {
          try {
            // Verify JWT (fastify-jwt verify)
            const jwt = require('jsonwebtoken');
            jwt.verify(m.token, this.#jwtSecret);
            conn.authenticated = true;
            clearTimeout(authTimeout);
            ws.send(JSON.stringify({ type: 'auth_ok' }));
            return;
          } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
            ws.close();
            return;
          }
        }
        // All other messages require authentication
        if (!conn.authenticated) return;

        if (m.type === 'subscribe' && m.deviceId) conn.subs.add(m.deviceId);
        else if (m.type === 'unsubscribe' && m.deviceId) conn.subs.delete(m.deviceId);
      } catch {}
    });
    ws.on('close', () => {
      clearTimeout(authTimeout);
      this.#frontends.delete(conn);
    });
  }

  sendToDevice(deviceId: string, msg: object): boolean {
    const c = this.#devices.get(deviceId);
    if (!c || c.ws.readyState !== WebSocket.OPEN) return false;
    c.ws.send(JSON.stringify(msg));
    return true;
  }

  isOnline(deviceId: string) { return this.#devices.has(deviceId); }
  onlineCount() { return this.#devices.size; }

  #broadcast(msg: object, onlyDevice?: string) {
    const s = JSON.stringify(msg);
    for (const c of this.#frontends) {
      if (c.ws.readyState === WebSocket.OPEN && (!onlyDevice || c.subs.has(onlyDevice))) {
        c.ws.send(s);
      }
    }
  }
}

// ============== Seed Templates ==============
const SEED_TEMPLATES = [
  { name: '抖音推荐营销', platform: 'dy', scriptName: 'task_dy_toker', description: '刷推荐视频，根据条件评论/点赞/关注/私信' },
  { name: '抖音同城营销', platform: 'dy', scriptName: 'task_dy_toker_city', description: '刷同城视频，根据条件评论/点赞/关注/私信' },
  { name: '抖音评论区互动', platform: 'dy', scriptName: 'task_dy_toker_comment', description: '在视频评论区点赞评论' },
  { name: '抖音搜索用户营销', platform: 'dy', scriptName: 'task_dy_search_user', description: '搜索关键词，对用户进行操作' },
  { name: '抖音直播间弹幕', platform: 'dy', scriptName: 'task_dy_live_barrage', description: '直播间发弹幕互动' },
  { name: '抖音涨粉', platform: 'dy', scriptName: 'task_dy_fans_inc_main', description: '通过点赞关注涨粉' },
  { name: '抖音AI自动回复', platform: 'dy', scriptName: 'task_dy_ai_back', description: 'AI智能回复私信和评论' },
  { name: '快手推荐营销', platform: 'ks', scriptName: 'task_ks_toker', description: '刷推荐视频，根据条件评论/点赞/关注' },
  { name: '快手搜索用户营销', platform: 'ks', scriptName: 'task_ks_search_user', description: '搜索关键词，对用户进行操作' },
  { name: '微信视频号推荐营销', platform: 'wx', scriptName: 'task_wx_toker', description: '刷推荐视频，根据条件评论/点赞/关注' },
  { name: '微信视频号搜索营销', platform: 'wx', scriptName: 'task_wx_search_inquiry', description: '微信视频号搜索询盘' },
  { name: '小红书推荐营销', platform: 'xhs', scriptName: 'task_xhs_toker', description: '刷推荐笔记，根据条件评论/点赞/关注' },
  { name: '小红书涨粉', platform: 'xhs', scriptName: 'task_xhs_fans', description: '通过互动涨粉' },
  { name: '小红书养号', platform: 'xhs', scriptName: 'task_xhs_yanghao', description: '模拟真人操作养号' },
  { name: '小红书AI自动回复', platform: 'xhs', scriptName: 'task_xhs_ai_back', description: 'AI智能回复评论和私信' },
];

// ============== Server ==============
async function main() {
  const app = Fastify({ logger: false });
  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  });
  await app.register(fastifyJwt, { secret: JWT_SECRET });
  await app.register(fastifyWebsocket);

  const hub = new DevHub(DEVICE_AUTH_TOKEN, JWT_SECRET);
  const relay = new RelayServer(DEVICE_AUTH_TOKEN, JWT_SECRET);

  // ── VPS Bridge (optional — only when BRIDGE_RELAY_URL is set) ──
  const bridgeMode = !!process.env.BRIDGE_RELAY_URL;
  let bridgeClient: BridgeClient | null = null;
  if (bridgeMode) {
    bridgeClient = new BridgeClient({
      relayUrl: process.env.BRIDGE_RELAY_URL!,
      controlToken: process.env.BRIDGE_CONTROL_TOKEN || 'control-token-change-me',
    });

    // When a remote phone connects through VPS, inject VirtualWS into local Hub
    bridgeClient.onDeviceConnect = (vws, deviceId, remoteAddress) => {
      console.log(`[Bridge] Injecting remote phone: ${deviceId} (${remoteAddress})`);
      const fakeReq = { socket: { remoteAddress } };
      hub.handleDevice(vws as unknown as WebSocket, fakeReq);
    };

    // When a remote frontend connects through VPS, inject VirtualWS into local Hub
    bridgeClient.onFrontendConnect = (vws) => {
      console.log(`[Bridge] Injecting remote frontend`);
      hub.handleFrontend(vws as unknown as WebSocket);
    };

    bridgeClient.connect();
    console.log(`[Bridge] Client connected to ${process.env.BRIDGE_RELAY_URL}`);
  }

  // WebSocket routes
  app.register(async function (scope) {
    scope.get('/ws/device', { websocket: true }, (socket, req) => hub.handleDevice(socket, req));
    scope.get('/ws/frontend', { websocket: true }, (socket) => hub.handleFrontend(socket));
    // Relay server — NAT traversal fallback
    scope.get('/ws/relay/device', { websocket: true }, (socket) => relay.handleDevice(socket as unknown as WebSocket));
    scope.get('/ws/relay/frontend/:deviceId', { websocket: true }, (socket, req) => {
      const deviceId = (req.params as Record<string, string>).deviceId;
      relay.handleFrontend(socket as unknown as WebSocket, deviceId);
    });
  });

  // Auth
  app.post('/api/v1/auth/login', async (req, reply) => {
    const { account, password } = req.body as any;
    if (account === 'admin' && password === 'admin123') {
      return { token: app.jwt.sign({ username: account, role: 'admin' }) };
    }
    return reply.status(401).send({ error: 'Invalid credentials' });
  });

  // Health
  app.get('/api/v1/health', async () => ({
    status: 'ok', uptime: process.uptime(), version: '1.0.0', devicesOnline: hub.onlineCount(), mode: 'dev',
  }));

  // Relay stats
  app.get('/api/v1/relay/stats', async () => relay.getStats());
  app.get('/api/v1/relay/devices', async () => ({ count: relay.getStats().activeDevices }));

  // Bridge status (when in bridge mode)
  app.get('/api/v1/bridge/status', async () => {
    if (!bridgeClient) return { enabled: false };
    return { enabled: true, ...bridgeClient.getStatus() };
  });

  // Devices
  app.get('/api/v1/devices', async () => store.devices.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)));

  app.get('/api/v1/devices/:id', async (req, reply) => {
    const d = deviceIndex.get((req.params as Record<string, string>).id);
    if (!d) return reply.status(404).send({ error: 'Not found' });
    return { ...d, online: hub.isOnline(d.id) };
  });

  // Send command to device (moved to remote/remote-command-routes.ts)
  // app.post('/api/v1/devices/:id/command', async (req, reply) => {
  //   const d = deviceIndex.get((req.params as Record<string, string>).id);
  //   if (!d) return reply.status(404).send({ error: 'Not found' });
  //   const body = req.body as any;
  //   return { success: hub.sendToDevice(d.id, { type: 'command', action: body.action, params: body.params || {} }) };
  // });

  // Task templates
  app.get('/api/v1/task-templates', async () => {
    if (store.taskTemplates.length === 0) {
      store.taskTemplates = SEED_TEMPLATES.map(t => ({ ...t, id: randomUUID(), defaultConfig: {}, createdAt: new Date().toISOString() }));
      saveStore(store);
    }
    return store.taskTemplates;
  });

  app.post('/api/v1/seed-templates', async () => {
    store.taskTemplates = SEED_TEMPLATES.map(t => ({ ...t, id: randomUUID(), defaultConfig: {}, createdAt: new Date().toISOString() }));
    saveStore(store);
    return { seeded: store.taskTemplates.length };
  });

  // Tasks
  app.get('/api/v1/tasks', async () => store.tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

  app.get('/api/v1/tasks/:id', async (req, reply) => {
    const task = store.tasks.find(t => t.id === (req.params as Record<string, string>).id);
    if (!task) return reply.status(404).send({ error: 'Not found' });
    return task;
  });

  app.post('/api/v1/tasks', async (req, reply) => {
    const body = req.body as any;
    const task = { ...body, id: randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    store.tasks.push(task);
    saveStore(store);
    return reply.status(201).send(task);
  });

  app.put('/api/v1/tasks/:id', async (req, reply) => {
    const idx = store.tasks.findIndex(t => t.id === (req.params as Record<string, string>).id);
    if (idx === -1) return reply.status(404).send({ error: 'Not found' });
    store.tasks[idx] = { ...store.tasks[idx], ...(req.body as any), updatedAt: new Date().toISOString() };
    saveStore(store);
    return store.tasks[idx];
  });

  app.delete('/api/v1/tasks/:id', async (req) => {
    store.tasks = store.tasks.filter(t => t.id !== (req.params as Record<string, string>).id);
    saveStore(store);
    return { success: true };
  });

  app.post('/api/v1/tasks/:id/run', async (req, reply) => {
    const task = store.tasks.find(t => t.id === (req.params as Record<string, string>).id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    const tmpl = store.taskTemplates.find(t => t.id === task.templateId);
    const script = tmpl?.scriptName || 'task_dy_toker';

    const exec = {
      id: randomUUID(),
      taskId: task.id,
      deviceId: task.deviceId,
      status: 'pending',
      startedAt: null,
      finishedAt: null,
      stats: {},
      logs: [],
      createdAt: new Date().toISOString(),
    };
    store.executions.push(exec);
    saveStore(store);

    const sent = hub.sendToDevice(task.deviceId, {
      type: 'start_task',
      task_id: exec.id,
      script,
      config: task.config || {},
    });

    if (!sent) {
      exec.status = 'failed';
      (exec as any).errorMessage = 'Device offline';
      saveStore(store);
      return reply.status(400).send({ error: 'Device is offline' });
    }

    exec.status = 'running';
    (exec as any).startedAt = new Date().toISOString();
    saveStore(store);
    return { execution: exec, sent };
  });

  app.post('/api/v1/tasks/:id/stop', async (req, reply) => {
    const task = store.tasks.find(t => t.id === (req.params as Record<string, string>).id);
    if (!task) return reply.status(404).send({ error: 'Not found' });
    return { success: hub.sendToDevice(task.deviceId, { type: 'stop_task', task_id: task.id }) };
  });

  app.get('/api/v1/tasks/:id/logs', async (req) => {
    return store.executions
      .filter(e => e.taskId === (req.params as Record<string, string>).id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
  });

  // Accounts
  app.get('/api/v1/accounts', async () => store.accounts);

  app.post('/api/v1/accounts', async (req, reply) => {
    const body = req.body as any;
    const acct = { ...body, id: randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    store.accounts.push(acct);
    saveStore(store);
    return reply.status(201).send(acct);
  });

  app.delete('/api/v1/accounts/:id', async (req) => {
    store.accounts = store.accounts.filter(a => a.id !== (req.params as Record<string, string>).id);
    saveStore(store);
    return { success: true };
  });

  // ── VLM Agent routes ──
  registerVlmRoutes(app, hub as any);

  // ── VLM Model config routes ──
  // Seed default models on first start
  if (store.vlmModels.length === 0) {
    const now = new Date().toISOString();
    store.vlmModels = DEFAULT_MODEL_SEEDS.map(s => ({
      ...s,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    }));
    saveStore(store);
  }

  const getModels = () => store.vlmModels;
  const setModels = (m: VlmModelConfig[]) => { store.vlmModels = m; saveStore(store); };
  registerVlmModelRoutes(app, getModels, setModels);

  // ── Native A/V relay (replaces scrcpy over ADB/Tailscale) ──
  const avRelayManager = new AvRelayManager();
  // Set device sender so control input (touch/key/scroll) can be forwarded to devices
  avRelayManager.setDeviceSender((deviceId: string, message: object) => hub.sendToDevice(deviceId, message));
  registerScrcpyRoutes(app, avRelayManager);

  // ── File management ──
  const fileManager = new FileManager((ip: string) => `${ip}:5555`);
  registerFileRoutes(app, fileManager);

  // ── ADB command console ──
  registerAdbRoutes(app);

  // ── OTA Script deployment ──
  registerScriptDeployRoutes(app, hub as any);

  // Cleanup on shutdown
  const shutdown = async () => {
    console.log('\n  Shutting down...');
    flushStore(); // ensure final state is persisted
    hub.destroy();
    relay.destroy();
    if (bridgeClient) bridgeClient.disconnect();
    await avRelayManager.stopAll();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`\n  Dev server running at http://localhost:${PORT}`);
    console.log(`  WebSocket:   ws://localhost:${PORT}/ws/device`);
    console.log(`  WebSocket:   ws://localhost:${PORT}/ws/frontend`);
    console.log(`  Relay WS:    ws://localhost:${PORT}/ws/relay/device`);
    console.log(`  Relay WS:    ws://localhost:${PORT}/ws/relay/frontend/:id`);
    console.log(`  Mode:        dev (JSON file store — no PostgreSQL needed)\n`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
