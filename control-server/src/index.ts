import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyWebsocket from '@fastify/websocket';
import 'dotenv/config';
import Fastify from 'fastify';
import type { WebSocket } from 'ws';
import { config } from './config.js';
import { db, pool } from './db.js';
import { BridgeClient } from './relay/bridge-client.js';
import { accountRoutes, deviceRoutes, taskRoutes } from './routes.js';
import { taskTemplates, users } from './schema.js';
import { registerVlmRoutes } from './vlm/vlm-routes.js';
import { initWsHub } from './ws-hub.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { AuthService, requireAuth } from './auth/auth-middleware.js';

// ── Decision Engine (New Architecture) ──
import { DecisionEngine } from './decision/decision-engine.js';
import { DecisionRouter } from './decision/decision-router.js';
import { DeepSeekClient } from './decision/deepseek-client.js';
import { QwenVLClient } from './decision/qwen-vl-client.js';
import { PromptBuilder } from './decision/prompt-builder.js';
import { SafetyGuard } from './decision/safety-guard.js';
import { registerDecisionRoutes } from './decision/decision-routes.js';

// ── Cross-Device Memory ──
import { MemoryStore } from './memory/memory-store.js';
import { MemoryRetriever } from './memory/memory-retriever.js';
import { ExperienceCompiler } from './memory/experience-compiler.js';
import { registerMemoryRoutes } from './memory/memory-routes.js';

// ── On-Demand Streaming ──
import { StreamManager } from './stream/stream-manager.js';
import { registerStreamRoutes } from './stream/stream-routes.js';

// ── Modular Routes (newly registered) ──
import { activationRoutes } from './activation/activation-routes.js';
import { deviceGroupRoutes } from './device-group-routes.js';
import { apiKeyRoutes } from './auth/api-key-routes.js';
import { scriptsManifestRoutes } from './scripts-manifest-routes.js';
import { platformAccountRoutes } from './platform-account-routes.js';
import { modelRoutes } from './model-routes.js';
import { deviceConfigRoutes } from './device-config-routes.js';
import { accountDeleteRoutes } from './account/account-delete-routes.js';
import { remoteCommandRoutes } from './remote/remote-command-routes.js';
import { alertRoutes } from './alerts/alert-routes.js';
import { queueRoutes } from './queue/queue-routes.js';
import { webhookRoutes } from './webhook/webhook-routes.js';
import { statsRoutes } from './stats/stats-routes.js';
import { crashRoutes } from './crash/crash-routes.js';
import { promptTemplateRoutes } from './vlm/prompt-template-routes.js';
import { registerScriptDeployRoutes } from './scrcpy/script-deploy-routes.js';
import { billingRoutes } from './billing/billing-routes.js';
import { configRoutes } from './config-manager/config-routes.js';

const app = Fastify({ logger: true });

// Plugins
await app.register(fastifyCors, { origin: true });
await app.register(fastifyJwt, { secret: config.JWT_SECRET });
await app.register(fastifyWebsocket);

// WebSocket hub
const hub = initWsHub(config.DEVICE_AUTH_TOKEN);
(app as any).wsHub = hub;

// ── VPS Bridge (optional — only when BRIDGE_RELAY_URL is set) ──
const bridgeMode = !!process.env.BRIDGE_RELAY_URL;
let bridgeClient: BridgeClient | null = null;
if (bridgeMode) {
  bridgeClient = new BridgeClient({
    relayUrl: process.env.BRIDGE_RELAY_URL!,
    controlToken: process.env.BRIDGE_CONTROL_TOKEN || 'control-token-change-me',
  });

  bridgeClient.onDeviceConnect = (vws, deviceId, remoteAddress) => {
    console.log(`[Bridge] Injecting remote phone: ${deviceId} (${remoteAddress})`);
    const fakeReq = { socket: { remoteAddress }, ip: remoteAddress };
    hub.handleDeviceUpgrade(vws as unknown as WebSocket, fakeReq);
  };

  bridgeClient.onFrontendConnect = (vws) => {
    console.log(`[Bridge] Injecting remote frontend`);
    hub.handleFrontendUpgrade(vws as unknown as WebSocket, {});
  };

  bridgeClient.connect();
  console.log(`[Bridge] Client connected to ${process.env.BRIDGE_RELAY_URL}`);
}

// ── Decision Engine initialization (when API keys configured) ──
let decisionEngine: DecisionEngine | null = null;
let streamManager: StreamManager | null = null;
let experienceCompiler: ExperienceCompiler | null = null;

if (config.FF_DECISION_ENGINE && config.DEEPSEEK_API_KEY) {
  const memoryStore = new MemoryStore(pool);
  const memoryRetriever = new MemoryRetriever(memoryStore);
  experienceCompiler = new ExperienceCompiler(memoryStore);

  const deepseek = new DeepSeekClient({
    apiKey: config.DEEPSEEK_API_KEY,
    apiUrl: config.DEEPSEEK_API_URL,
    model: config.DEEPSEEK_MODEL,
    maxTokens: config.DEEPSEEK_MAX_TOKENS,
    temperature: config.DEEPSEEK_TEMPERATURE,
  });

  const qwenVL = new QwenVLClient({
    apiKey: config.DASHSCOPE_API_KEY,
    apiUrl: config.DASHSCOPE_API_URL,
    model: config.DASHSCOPE_VL_MODEL,
    maxTokens: config.DASHSCOPE_VL_MAX_TOKENS,
    temperature: config.DASHSCOPE_VL_TEMPERATURE,
  });

  const promptBuilder = new PromptBuilder();
  const safetyGuard = new SafetyGuard();

  const router = new DecisionRouter({
    deepseek,
    qwenVL,
    promptBuilder,
    safetyGuard,
    memoryRetriever,
  });

  decisionEngine = new DecisionEngine(router, {
    sendToDevice(deviceId, decision) {
      hub.sendToDevice(deviceId, {
        type: 'execute_decision',
        payload: decision,
      });
    },
    onTaskComplete(deviceId, result) {
      console.log(`[Decision] Task complete: ${deviceId} ${result.status} (${result.totalSteps} steps)`);
      hub.sendToDevice(deviceId, {
        type: 'task_complete',
        payload: result,
      });
    },
  });

  // Stream manager
  streamManager = new StreamManager({
    sendToDevice(deviceId, msg) {
      hub.sendToDevice(deviceId, msg);
    },
    relayToFrontend(_frontendId, _data) {
      // A/V relay handled by udp-relay
    },
    onStreamStateChange(deviceId, status) {
      hub.broadcastToFrontends({ type: 'stream_state', deviceId, status });
    },
  });

  if (experienceCompiler) experienceCompiler.start();

  console.log('[Decision] Engine initialized (DeepSeek + Qwen3-VL)');
}

app.register(async function (scope) {
  scope.get('/ws/device', { websocket: true }, (socket, req) => {
    hub.handleDeviceUpgrade(socket, req);
  });

  scope.get('/ws/frontend', { websocket: true }, (socket, req) => {
    hub.handleFrontendUpgrade(socket, req);
  });
});

// REST API routes
await app.register(deviceRoutes);
await app.register(taskRoutes);
await app.register(accountRoutes);

// ── Modular Routes ──
await app.register(activationRoutes);
await app.register(deviceGroupRoutes);
await app.register(apiKeyRoutes);
await app.register(scriptsManifestRoutes);
await app.register(platformAccountRoutes);
await app.register(modelRoutes);
await app.register(deviceConfigRoutes);
await app.register(accountDeleteRoutes);
await app.register(remoteCommandRoutes);
await app.register(alertRoutes);
await app.register(queueRoutes);
await app.register(webhookRoutes);
await app.register(statsRoutes);
await app.register(crashRoutes);
await app.register(promptTemplateRoutes);
app.register(function (scope) {
  registerScriptDeployRoutes(scope, hub);
});
await app.register(billingRoutes);
await app.register(configRoutes);

// VLM Agent routes (legacy)
registerVlmRoutes(app, hub);

// Decision Engine routes (new architecture)
if (decisionEngine) {
  registerDecisionRoutes(app, decisionEngine);
  if (streamManager) registerStreamRoutes(app, streamManager);
  if (experienceCompiler) {
    const memoryStore = new MemoryStore(pool);
    registerMemoryRoutes(app, memoryStore, experienceCompiler);
  }
}

// Auth
const authService = new AuthService(app, config.JWT_SECRET);

app.post('/api/v1/auth/login', async (req, reply) => {
  const { username, password } = req.body as any;
  if (!username || !password) {
    return reply.status(400).send({ error: 'username and password required' });
  }

  // Look up user in database
  const [user] = await db.select().from(users).where(eq(users.username, username));
  if (!user) {
    return reply.status(401).send({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return reply.status(401).send({ error: 'Invalid credentials' });
  }

  const token = authService.signToken({
    userId: user.id,
    username: user.username,
    role: user.role as 'admin' | 'operator' | 'viewer',
  });
  const refreshToken = authService.signRefreshToken({
    userId: user.id,
    username: user.username,
    role: user.role as 'admin' | 'operator' | 'viewer',
  });

  return { token, refreshToken, user: { id: user.id, username: user.username, role: user.role } };
});

app.post('/api/v1/auth/refresh', async (req, reply) => {
  const { refreshToken } = req.body as { refreshToken: string };
  if (!refreshToken) return reply.status(400).send({ error: 'refreshToken required' });
  const result = authService.refreshAccessToken(refreshToken);
  if (!result) return reply.status(401).send({ error: 'Invalid or expired refresh token' });
  return result;
});

// Protected admin route scope
app.register(async function (adminScope) {
  adminScope.addHook('preHandler', requireAuth(authService));

  // Health check authenticated variant
  adminScope.get('/api/v1/admin/health', async (req) => {
    const user = (req as any).user;
    return {
      status: 'ok',
      uptime: process.uptime(),
      version: '1.0.0',
      devicesOnline: hub.getOnlineDevices().length,
      bridge: bridgeClient ? bridgeClient.getStatus() : { enabled: false },
      authenticatedUser: user.username,
    };
  });

  // Seed task templates (admin only)
  adminScope.post('/api/v1/admin/seed-templates', async () => {
    const templates = [
      { name: '抖音推荐营销', platform: 'dy' as const, scriptName: 'task_dy_toker', description: '刷推荐视频，根据条件评论/点赞/关注/私信', defaultConfig: {} },
      { name: '抖音同城营销', platform: 'dy' as const, scriptName: 'task_dy_toker_city', description: '刷同城视频，根据条件评论/点赞/关注/私信', defaultConfig: {} },
      { name: '抖音评论区互动', platform: 'dy' as const, scriptName: 'task_dy_toker_comment', description: '在视频评论区点赞评论', defaultConfig: {} },
      { name: '抖音搜索用户营销', platform: 'dy' as const, scriptName: 'task_dy_search_user', description: '搜索关键词，对用户进行操作', defaultConfig: {} },
      { name: '抖音直播间弹幕', platform: 'dy' as const, scriptName: 'task_dy_live_barrage', description: '直播间发弹幕互动', defaultConfig: {} },
      { name: '抖音涨粉', platform: 'dy' as const, scriptName: 'task_dy_fans_inc_main', description: '通过点赞关注涨粉', defaultConfig: {} },
      { name: '抖音AI自动回复', platform: 'dy' as const, scriptName: 'task_dy_ai_back', description: 'AI智能回复私信和评论', defaultConfig: {} },
      { name: '快手推荐营销', platform: 'ks' as const, scriptName: 'task_ks_toker', description: '刷推荐视频，根据条件评论/点赞/关注', defaultConfig: {} },
      { name: '快手搜索用户营销', platform: 'ks' as const, scriptName: 'task_ks_search_user', description: '搜索关键词，对用户进行操作', defaultConfig: {} },
      { name: '微信视频号推荐营销', platform: 'wx' as const, scriptName: 'task_wx_toker', description: '刷推荐视频，根据条件评论/点赞/关注', defaultConfig: {} },
      { name: '微信视频号搜索营销', platform: 'wx' as const, scriptName: 'task_wx_search_inquiry', description: '微信视频号搜索询盘', defaultConfig: {} },
      { name: '小红书推荐营销', platform: 'xhs' as const, scriptName: 'task_xhs_toker', description: '刷推荐笔记，根据条件评论/点赞/关注', defaultConfig: {} },
      { name: '小红书涨粉', platform: 'xhs' as const, scriptName: 'task_xhs_fans', description: '通过互动涨粉', defaultConfig: {} },
      { name: '小红书养号', platform: 'xhs' as const, scriptName: 'task_xhs_yanghao', description: '模拟真人操作养号', defaultConfig: {} },
      { name: '小红书AI自动回复', platform: 'xhs' as const, scriptName: 'task_xhs_ai_back', description: 'AI智能回复评论和私信', defaultConfig: {} },
    ];

    for (const t of templates) {
      await db.insert(taskTemplates).values(t).onConflictDoNothing();
    }

    return { seeded: templates.length };
  });
});

// Health check
app.get('/api/v1/health', async () => {
  return {
    status: 'ok',
    uptime: process.uptime(),
    version: '1.0.0',
    devicesOnline: hub.getOnlineDevices().length,
    bridge: bridgeClient ? bridgeClient.getStatus() : { enabled: false },
  };
});

app.get('/health', async () => {
  return { status: 'ok', uptime: process.uptime(), version: '1.0.0' };
});

// Bridge status
app.get('/api/v1/bridge/status', async () => {
  if (!bridgeClient) return { enabled: false };
  return { enabled: true, ...bridgeClient.getStatus() };
});

// Start
try {
  await app.listen({ port: config.PORT, host: config.HOST });
  console.log(`Control server running on http://${config.HOST}:${config.PORT}`);
  console.log(`WebSocket: ws://${config.HOST}:${config.PORT}/ws/device`);
  console.log(`WebSocket: ws://${config.HOST}:${config.PORT}/ws/frontend`);
  if (bridgeMode) {
    console.log(`Bridge mode: connected to ${process.env.BRIDGE_RELAY_URL}`);
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown
const shutdown = () => {
  console.log('\nShutting down...');
  if (bridgeClient) bridgeClient.disconnect();
  app.close().then(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
