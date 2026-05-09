/**
 * Dev server — self-contained, no PostgreSQL/Redis needed.
 * Uses JSON file store + WebSocket hub + REST API.
 * Start with: npx tsx src/dev-server.ts
 */
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const DATA_FILE = path.join(process.cwd(), '.dev-data.json');
const PORT = parseInt(process.env.PORT || '8443');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const DEVICE_AUTH_TOKEN = process.env.DEVICE_AUTH_TOKEN || 'device-auth-token-change-me';

// ============== File Store ==============
interface Store {
  devices: any[];
  accounts: any[];
  taskTemplates: any[];
  tasks: any[];
  executions: any[];
}

function loadStore(): Store {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {}
  return { devices: [], accounts: [], taskTemplates: [], tasks: [], executions: [] };
}

function saveStore(s: Store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(s, null, 2));
}

let store = loadStore();

// ============== WebSocket Hub ==============
import { WebSocket } from 'ws';

interface DevConn {
  ws: WebSocket;
  deviceId: string;
  tailscaleIp: string;
  authenticated: boolean;
  lastHeartbeat: Date;
  currentTaskId?: string;
}

class DevHub {
  #devices = new Map<string, DevConn>();
  #frontends = new Set<{ ws: WebSocket; subs: Set<string> }>();
  #token: string;

  constructor(token: string) { this.#token = token; }

  handleDevice(ws: WebSocket, req: any) {
    const conn: DevConn = {
      ws, deviceId: '', tailscaleIp: req?.socket?.remoteAddress || 'unknown',
      authenticated: false, lastHeartbeat: new Date(),
    };

    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        if (m.type === 'auth' && m.token === this.#token) {
          conn.authenticated = true;
          conn.deviceId = m.device_id;
          conn.tailscaleIp = m.tailscale_ip || conn.tailscaleIp;
          this.#devices.set(conn.deviceId, conn);
          ws.send(JSON.stringify({ type: 'auth_ok' }));

          // Auto-register device in store
          const exists = store.devices.find(d => d.id === m.device_id);
          if (!exists) {
            store.devices.push({
              id: m.device_id,
              name: m.device_id,
              tailscaleIp: conn.tailscaleIp,
              model: m.model || 'Unknown',
              androidVersion: m.android_version || 'Unknown',
              deekeVersion: m.deeke_version || 'Unknown',
              status: 'online',
              lastSeen: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          } else {
            exists.status = 'online';
            exists.lastSeen = new Date().toISOString();
            exists.tailscaleIp = conn.tailscaleIp;
          }
          saveStore(store);

          this.#broadcast({ type: 'device_online', deviceId: conn.deviceId, tailscaleIp: conn.tailscaleIp });
        } else if (m.type === 'heartbeat' && conn.authenticated) {
          conn.lastHeartbeat = new Date();
          // Update device status
          const dev = store.devices.find(d => d.id === conn.deviceId);
          if (dev) {
            dev.battery = m.battery;
            dev.currentApp = m.current_app;
            dev.screenOn = m.screen_on;
            dev.lastSeen = new Date().toISOString();
            dev.status = 'online';
            saveStore(store);
          }
          this.#broadcast({ type: 'device_heartbeat', deviceId: conn.deviceId, battery: m.battery, currentApp: m.current_app, screenOn: m.screen_on });
        } else if (m.type === 'screenshot' && conn.authenticated) {
          this.#broadcast({ type: 'device_screenshot', deviceId: conn.deviceId, data: m.data }, conn.deviceId);
        } else if (m.type === 'task_status' && conn.authenticated) {
          this.#broadcast({ type: 'task_status_update', deviceId: conn.deviceId, taskId: m.task_id, status: m.status, step: m.step, message: m.message });
        } else if (m.type === 'task_result' && conn.authenticated) {
          // Update execution
          const exec = store.executions.find(e => e.id === m.task_id);
          if (exec) {
            exec.status = m.status;
            exec.stats = m.stats || {};
            exec.finishedAt = new Date().toISOString();
            saveStore(store);
          }
          this.#broadcast({ type: 'task_result', deviceId: conn.deviceId, taskId: m.task_id, status: m.status, stats: m.stats });
        }
      } catch {}
    });

    ws.on('close', () => {
      if (conn.deviceId) {
        this.#devices.delete(conn.deviceId);
        const dev = store.devices.find(d => d.id === conn.deviceId);
        if (dev) { dev.status = 'offline'; saveStore(store); }
        this.#broadcast({ type: 'device_offline', deviceId: conn.deviceId });
      }
    });
  }

  handleFrontend(ws: WebSocket) {
    const conn = { ws, subs: new Set<string>() };
    this.#frontends.add(conn);
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        if (m.type === 'subscribe' && m.deviceId) conn.subs.add(m.deviceId);
        else if (m.type === 'unsubscribe' && m.deviceId) conn.subs.delete(m.deviceId);
      } catch {}
    });
    ws.on('close', () => this.#frontends.delete(conn));
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
  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyJwt, { secret: JWT_SECRET });
  await app.register(fastifyWebsocket);

  const hub = new DevHub(DEVICE_AUTH_TOKEN);

  // WebSocket routes
  app.register(async function (scope) {
    scope.get('/ws/device', { websocket: true }, (socket, req) => hub.handleDevice(socket, req));
    scope.get('/ws/frontend', { websocket: true }, (socket) => hub.handleFrontend(socket));
  });

  // Auth
  app.post('/api/v1/auth/login', async (req, reply) => {
    const { username, password } = req.body as any;
    if (username === 'admin' && password === 'admin123') {
      return { token: app.jwt.sign({ username, role: 'admin' }) };
    }
    return reply.status(401).send({ error: 'Invalid credentials' });
  });

  // Health
  app.get('/api/v1/health', async () => ({
    status: 'ok', uptime: process.uptime(), devicesOnline: hub.onlineCount(), mode: 'dev',
  }));

  // Devices
  app.get('/api/v1/devices', async () => store.devices.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)));

  app.get('/api/v1/devices/:id', async (req, reply) => {
    const d = store.devices.find(d => d.id === req.params.id);
    if (!d) return reply.status(404).send({ error: 'Not found' });
    return { ...d, online: hub.isOnline(d.id) };
  });

  app.post('/api/v1/devices/:id/command', async (req, reply) => {
    const d = store.devices.find(d => d.id === req.params.id);
    if (!d) return reply.status(404).send({ error: 'Not found' });
    const body = req.body as any;
    return { success: hub.sendToDevice(d.id, { type: 'command', action: body.action, params: body.params || {} }) };
  });

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

  app.get('/api/v1/tasks/:id', async (req) => {
    return store.tasks.find(t => t.id === req.params.id) || { error: 'Not found' };
  });

  app.post('/api/v1/tasks', async (req, reply) => {
    const body = req.body as any;
    const task = { ...body, id: randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    store.tasks.push(task);
    saveStore(store);
    return reply.status(201).send(task);
  });

  app.put('/api/v1/tasks/:id', async (req) => {
    const idx = store.tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return { error: 'Not found' };
    store.tasks[idx] = { ...store.tasks[idx], ...(req.body as any), updatedAt: new Date().toISOString() };
    saveStore(store);
    return store.tasks[idx];
  });

  app.delete('/api/v1/tasks/:id', async () => {
    store.tasks = store.tasks.filter(t => t.id !== req.params.id);
    saveStore(store);
    return { success: true };
  });

  app.post('/api/v1/tasks/:id/run', async (req, reply) => {
    const task = store.tasks.find(t => t.id === req.params.id);
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
      exec.errorMessage = 'Device offline';
      saveStore(store);
      return reply.status(400).send({ error: 'Device is offline' });
    }

    exec.status = 'running';
    exec.startedAt = new Date().toISOString();
    saveStore(store);
    return { execution: exec, sent };
  });

  app.post('/api/v1/tasks/:id/stop', async (req) => {
    const task = store.tasks.find(t => t.id === req.params.id);
    if (!task) return { error: 'Not found' };
    return { success: hub.sendToDevice(task.deviceId, { type: 'stop_task', task_id: task.id }) };
  });

  app.get('/api/v1/tasks/:id/logs', async (req) => {
    return store.executions
      .filter(e => e.taskId === req.params.id)
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
    store.accounts = store.accounts.filter(a => a.id !== req.params.id);
    saveStore(store);
    return { success: true };
  });

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`\n  Dev server running at http://localhost:${PORT}`);
    console.log(`  WebSocket:   ws://localhost:${PORT}/ws/device`);
    console.log(`  WebSocket:   ws://localhost:${PORT}/ws/frontend`);
    console.log(`  Mode:        dev (JSON file store — no PostgreSQL needed)\n`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
