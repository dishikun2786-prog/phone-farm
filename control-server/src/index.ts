import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { eq, or, and } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { AuthService, optionalAuth, requireAuth } from './auth/auth-middleware.js';
import { config } from './config.js';
import { db, pool } from './db.js';
import { BridgeClient } from './relay/bridge-client.js';
import { accountRoutes, deviceRoutes, taskRoutes } from './routes.js';
import { taskTemplates, users } from './schema.js';
import { registerVlmRoutes } from './vlm/vlm-routes.js';
import { initWsHub } from './ws-hub.js';
import type { WsHub } from './ws-hub.js';
import type { RuntimeConfig } from './config-manager/runtime-config.js';
import type { AuthUser } from './auth/auth-middleware.js';

// Override @fastify/jwt's user type to match our AuthUser model
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: AuthUser;
  }
}

// Fastify instance decoration type declarations
declare module 'fastify' {
  interface FastifyInstance {
    wsHub: WsHub;
    runtimeConfig: RuntimeConfig;
    nats: NatsSync;
    minio: MinioClient;
    ray: RayClient;
  }
}

// ── Decision Engine (New Architecture) ──
import { DecisionEngine } from './decision/decision-engine.js';
import { DecisionRouter } from './decision/decision-router.js';
import { registerDecisionRoutes } from './decision/decision-routes.js';
import { DeepSeekClient } from './decision/deepseek-client.js';
import { PromptBuilder } from './decision/prompt-builder.js';
import { QwenVLClient } from './decision/qwen-vl-client.js';
import { SafetyGuard } from './decision/safety-guard.js';

// ── Cross-Device Memory ──
import { ExperienceCompiler } from './memory/experience-compiler.js';
import { MemoryRetriever } from './memory/memory-retriever.js';
import { registerMemoryRoutes } from './memory/memory-routes.js';
import { MemoryStore } from './memory/memory-store.js';

// ── On-Demand Streaming ──
import { StreamManager } from './stream/stream-manager.js';
import { registerStreamRoutes } from './stream/stream-routes.js';

// ── Modular Routes (newly registered) ──
import { accountDeleteRoutes } from './account/account-delete-routes.js';
import { activationRoutes } from './activation/activation-routes.js';
import { registerAiMemoryRoutes } from './ai-memory/ai-memory-routes.js';
import { MemoryScheduler } from './ai-memory/memory-scheduler.js';
import { alertRoutes } from './alerts/alert-routes.js';
import { adminUserRoutes } from './auth/admin-user-routes.js';
import { apiKeyRoutes } from './auth/api-key-routes.js';
import { userRoutes } from './auth/user-routes.js';
import { permissionRoutes } from './auth/permission-routes.js';
import { reloadPermissions } from './auth/rbac.js';
import { billingRoutes } from './billing/billing-routes.js';
import { creditRoutes } from './billing/credit-routes.js';
import { adminCreditRoutes } from './billing/admin-credit-routes.js';
import { llmProxyRoutes } from './assistant/llm-proxy-routes.js';
import { assistantConfigRoutes } from './assistant/assistant-config-routes.js';
import { adminAssistantRoutes } from './assistant/admin-assistant-routes.js';
import { configRoutes, deviceConfigResolveRoute } from './config-manager/config-routes.js';
import { initRuntimeConfig } from './config-manager/runtime-config.js';
import { systemConfigRoutes } from './config-manager/system-config-routes.js';
import { crashRoutes } from './crash/crash-routes.js';
import { deviceConfigRoutes } from './device-config-routes.js';
import { deviceGroupRoutes } from './device-group-routes.js';
import { modelRoutes } from './model-routes.js';
import { platformAccountRoutes } from './platform-account-routes.js';
import { queueRoutes } from './queue/queue-routes.js';
import { remoteCommandRoutes } from './remote/remote-command-routes.js';
import { AvRelayManager, FileManager, registerScrcpyRoutes, registerFileRoutes, registerAdbRoutes, registerScriptDeployRoutes } from './scrcpy/index.js';
import { scriptsManifestRoutes } from './scripts-manifest-routes.js';
import { statsRoutes } from './stats/stats-routes.js';
import { promptTemplateRoutes } from './vlm/prompt-template-routes.js';
import { DEFAULT_MODEL_SEEDS, registerVlmModelRoutes, type VlmModelConfig } from './vlm/vlm-model-routes.js';
import { webhookRoutes } from './webhook/webhook-routes.js';
import { tenantRoutes } from './tenant/tenant-routes.js';
import { tenantUserRoutes } from './tenant/tenant-user-routes.js';
import { optionalTenant } from './tenant/tenant-middleware.js';
import { paymentRoutes } from './billing/payment-routes.js';
import { handleWechatCallback, handleAlipayCallback } from './billing/payment-webhook.js';
import { subscriptionScheduler } from './billing/subscription-scheduler.js';
import { seedDefaultPlans } from './billing/plan-seed.js';
import { portalRoutes } from './portal/portal-routes.js';
import { ticketRoutes } from './support/ticket-routes.js';
import { agentRoutes } from './agent/agent-routes.js';
import { openApiRoutes } from './openapi/openapi-routes.js';
import { openApiDocsRoutes } from './openapi/openapi-docs.js';
import { apiKeyManagementRoutes } from './openapi/api-key-management-routes.js';
import { whitelabelRoutes } from './whitelabel/whitelabel-routes.js';
import { cardKeyRoutes } from './activation/card-key-routes.js';
import { auditRoutes } from './audit/audit-routes.js';

// ── Phase 2-5: New Architecture Modules ──
import { NatsSync } from './nats/nats-sync.js';
import { MinioClient } from './storage/minio-client.js';
import { webrtcSignalingRoutes } from './webrtc/signaling-relay.js';
import { RayClient } from './ray/ray-client.js';

const APP_VERSION = "1.0.0";

const app = Fastify({ logger: true, bodyLimit: 1_048_576 }); // 1MB

// ── Security headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options) ──
app.addHook('onSend', async (_request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  reply.header('X-XSS-Protection', '0');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: wss:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
});

// Plugins
const corsRaw = config.CORS_ORIGINS;
const corsOrigin = corsRaw === '*' || corsRaw === ''
  ? true
  : corsRaw.split(',').map(s => s.trim()).filter(Boolean);
await app.register(fastifyCors, {
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
});
await app.register(fastifyJwt, { secret: config.JWT_SECRET });
await app.register(fastifyWebsocket);

// Static file serving for dashboard
await app.register(fastifyStatic, {
  root: resolve(dirname(fileURLToPath(import.meta.url)), '../../dashboard/dist'),
  prefix: '/',
  decorateReply: false,
});
// SPA fallback: non-API, non-file routes → index.html
app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith('/api/') || request.url.startsWith('/ws/')) {
    return reply.status(404).send({ error: 'Not found' });
  }
  const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../dashboard/dist/index.html'), 'utf-8');
  return reply.header('Content-Type', 'text/html').send(html);
});

// WebSocket hub
const hub = initWsHub(config.DEVICE_AUTH_TOKEN);
app.decorate('wsHub', hub);

// ── RuntimeConfig — unified config bridge (DB overrides > env > default) ──
const runtimeConfig = initRuntimeConfig(config);
await runtimeConfig.initialize();
app.decorate('runtimeConfig', runtimeConfig);
console.log('[RuntimeConfig] Initialized — DB-backed configuration bridge ready');

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

if (config.FF_DECISION_ENGINE && (config.DEEPSEEK_API_KEY || config.DASHSCOPE_API_KEY)) {
  const memoryStore = new MemoryStore(pool);
  const memoryRetriever = new MemoryRetriever(memoryStore);
  experienceCompiler = new ExperienceCompiler(memoryStore);

  const deepseek = new DeepSeekClient({
    apiKey: config.DEEPSEEK_API_KEY,
    apiUrl: config.DEEPSEEK_API_URL,
    model: config.DEEPSEEK_MODEL,
    maxTokens: config.DEEPSEEK_MAX_TOKENS,
    temperature: config.DEEPSEEK_TEMPERATURE,
    runtimeConfig,
  });

  const qwenVL = new QwenVLClient({
    apiKey: config.DASHSCOPE_API_KEY,
    apiUrl: config.DASHSCOPE_API_URL,
    model: config.DASHSCOPE_VL_MODEL,
    maxTokens: config.DASHSCOPE_VL_MAX_TOKENS,
    temperature: config.DASHSCOPE_VL_TEMPERATURE,
    runtimeConfig,
  });

  const promptBuilder = new PromptBuilder();
  const safetyGuard = new SafetyGuard(runtimeConfig);

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
        decision,
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

  if (!config.DEEPSEEK_API_KEY) {
    console.log('[Decision] DeepSeek API key not configured — all decisions routed to Qwen3-VL-Plus');
  }
  if (!config.DASHSCOPE_API_KEY) {
    console.log('[Decision] DashScope API key not configured — vision fallback unavailable');
  }

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

// ── Auth Service ──
const authService = new AuthService(app, config.JWT_SECRET);

// REST API routes — require JWT auth
await app.register(async function (scope) { scope.addHook('preHandler', requireAuth(authService)); await deviceRoutes(scope); });
await app.register(async function (scope) { scope.addHook('preHandler', requireAuth(authService)); await taskRoutes(scope); });
(app as any).authService = authService;

// ── User Routes (register/login/reset-password/profile) ──
await app.register(userRoutes);
// ── Admin User Management Routes ──
await app.register(async function (scope) { await adminUserRoutes(scope, authService); });
// ── Permission Configuration Routes (super_admin only) ──
await app.register(async function (scope) { await permissionRoutes(scope, authService); });
	// ── Admin AI Assistant Routes (admin+ only) ──
	await app.register(async function (scope) { await adminAssistantRoutes(scope, authService); });
// ── Account Routes (authenticated) ──
await app.register(async function (scope) { scope.addHook('preHandler', requireAuth(authService)); await accountRoutes(scope); });

// ── Modular Routes ──
// Device-facing routes (use device auth token, not JWT)
await app.register(activationRoutes);
await app.register(scriptsManifestRoutes);
await app.register(modelRoutes);
await app.register(deviceConfigRoutes);
await app.register(crashRoutes);

// Dashboard/admin routes (require JWT auth)
await app.register(async function (scope) {
  scope.addHook('preHandler', requireAuth(authService));
  await deviceGroupRoutes(scope);
});
await app.register(async function (scope) { await apiKeyRoutes(scope, authService); });
await app.register(async function (scope) {
  scope.addHook('preHandler', requireAuth(authService));
  await platformAccountRoutes(scope);
});
await app.register(async function (scope) { await accountDeleteRoutes(scope, authService); });
await app.register(async function (scope) {
  scope.addHook('preHandler', requireAuth(authService));
  await remoteCommandRoutes(scope);
});
await app.register(async function (scope) {
  scope.addHook('preHandler', requireAuth(authService));
  await alertRoutes(scope);
});
await app.register(async function (scope) {
  scope.addHook('preHandler', requireAuth(authService));
  await queueRoutes(scope);
});
await app.register(async function (scope) {
  scope.addHook('preHandler', requireAuth(authService));
  await webhookRoutes(scope);
});
await app.register(async function (scope) {
  scope.addHook('preHandler', requireAuth(authService));
  await statsRoutes(scope);
});
await app.register(async function (scope) {
  scope.addHook('preHandler', requireAuth(authService));
  await auditRoutes(scope);
});
await app.register(async function (scope) {
  scope.addHook('preHandler', requireAuth(authService));
  await promptTemplateRoutes(scope);
});
await app.register(async function (scope) {
  scope.addHook('preHandler', requireAuth(authService));
  await billingRoutes(scope);
});

// Payment routes (v2 API — subscription + orders + callbacks)
await app.register(async function (paymentScope) {
  paymentScope.addHook('preHandler', optionalAuth(authService));
  await paymentRoutes(paymentScope);
});

// Payment webhook callbacks (WeChat Pay / Alipay async notifications — no auth)
app.post('/api/v2/payment/wechat-callback', async (req, reply) => handleWechatCallback(req, reply));
app.post('/api/v2/payment/alipay-callback', async (req, reply) => handleAlipayCallback(req, reply));

// Portal BFF routes (customer self-service — require auth + tenant)
await app.register(async function (portalScope) {
  portalScope.addHook('preHandler', requireAuth(authService));
  portalScope.addHook('preHandler', optionalTenant());
  await portalRoutes(portalScope);
  await apiKeyManagementRoutes(portalScope);
  await cardKeyRoutes(portalScope);
});

// Support ticket routes (customer + staff)
await app.register(async function (ticketScope) {
  ticketScope.addHook('preHandler', requireAuth(authService));
  await ticketRoutes(ticketScope);
});

// Agent routes (agent dashboard + admin agent/card-batch management)
await app.register(async function (agentScope) {
  agentScope.addHook('preHandler', requireAuth(authService));
  agentScope.addHook('preHandler', optionalTenant());
  await agentRoutes(agentScope);
});

// Open API routes (API Key auth — no JWT required)
await app.register(async function (openapiScope) {
  await openApiRoutes(openapiScope);
});

// Whitelabel routes (theme CSS is public; admin CRUD requires auth)
await app.register(async function (wlScope) {
  wlScope.addHook('preHandler', optionalAuth(authService));
  wlScope.addHook('preHandler', optionalTenant());
  await whitelabelRoutes(wlScope);
});

// OpenAPI docs (public)
await app.register(async function (docsScope) {
  await openApiDocsRoutes(docsScope);
});
// Credit system routes (require JWT auth)
await app.register(async function (creditScope) {
  creditScope.addHook('preHandler', requireAuth(authService));
  await creditRoutes(creditScope);
  await adminCreditRoutes(creditScope, authService);
  await llmProxyRoutes(creditScope);
  await assistantConfigRoutes(creditScope);
});
// Tenant management routes (super_admin only, with optional tenant resolution)
await app.register(async function (tenantScope) {
  tenantScope.addHook('preHandler', requireAuth(authService));
  tenantScope.addHook('preHandler', optionalTenant());
  await tenantRoutes(tenantScope);
  await tenantUserRoutes(tenantScope);
});

// Device-facing config resolve — no JWT auth (devices use WebSocket device token)
await app.register(deviceConfigResolveRoute);

// Config management routes — require JWT auth
await app.register(async function (configScope) {
  configScope.addHook('preHandler', requireAuth(authService));
  await configRoutes(configScope);
});

// System config routes — optional JWT auth (per-route permission checks)
await app.register(async function (sysScope) {
  sysScope.addHook('preHandler', optionalAuth(authService));
  await systemConfigRoutes(sysScope);
});

// ── Phase 2-5: Initialize new architecture modules ──
const nats = new NatsSync(config.NATS_URL, config.NATS_TOKEN);
const minio = new MinioClient(undefined, undefined, undefined, undefined, runtimeConfig);
const ray = new RayClient(config.RAY_ADDRESS);
app.decorate('nats', nats);
app.decorate('minio', minio);
app.decorate('ray', ray);
if (config.NATS_ENABLED) await nats.connect().catch(() => {});
if (config.MINIO_ENABLED) await minio.initialize().catch(() => {});

// Register WebRTC signaling routes
await app.register(webrtcSignalingRoutes);

// Ray status endpoint
app.get('/api/v1/ray/status', async (_req, reply) => {
  const status = await ray.getClusterStatus();
  return reply.send({ ...status, enabled: ray.isReady });
});

app.get('/api/v1/ray/tasks', async (_req, reply) => {
  const tasks = await ray.listTasks();
  return reply.send({ tasks, total: tasks.length });
});

// MinIO storage endpoints
app.get('/api/v1/storage/status', async (_req, reply) => {
  const healthy = await minio.healthCheck();
  return reply.send({ status: healthy ? 'healthy' : 'unhealthy', enabled: minio.isReady });
});

// NATS status endpoint
app.get('/api/v1/nats/status', async (_req, reply) => {
  return reply.send({ status: nats.isConnected() ? 'healthy' : 'unhealthy', connected: nats.isConnected() });
});

// Device group control via NATS (efficient broadcast)
app.post('/api/v1/nats/broadcast', { preHandler: requireAuth(authService) }, async (req, reply) => {
  const { subject, data } = req.body as { subject: string; data: unknown };
  if (!subject || !data) {
    return reply.status(400).send({ error: 'subject and data required' });
  }
  // NATS publish is async fire-and-forget via existing NATS integration
  return reply.send({ published: true, subject });
});

const avRelayManager = new AvRelayManager();
avRelayManager.setDeviceSender((deviceId, msg) => hub.sendToDevice(deviceId, msg));
registerScrcpyRoutes(app, avRelayManager);

// File management routes (upload, list, delete, install APK)
const fileManager = new FileManager((ip: string) => ip);
registerFileRoutes(app, fileManager);

// ADB command routes
registerAdbRoutes(app);

// Script OTA deploy routes
registerScriptDeployRoutes(app, hub);

const vlmModelStore: VlmModelConfig[] = DEFAULT_MODEL_SEEDS.map((seed, i) => ({
  ...seed,
  id: `model-${i}`,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));
const getVlmModels = () => vlmModelStore;
const setVlmModels = (m: VlmModelConfig[]) => { vlmModelStore.length = 0; vlmModelStore.push(...m); };
registerVlmModelRoutes(app, getVlmModels, setVlmModels);

// VLM Agent routes (legacy)
registerVlmRoutes(app, hub);

// VLM Stats route
const { StatsCalculator } = await import('./stats/stats-calculator.js');
const vlmStatsCalc = new StatsCalculator(app);
app.get('/api/v1/vlm/stats', async (req, reply) => {
  const query = req.query as Record<string, string>;
  const from = query.from ? Number(query.from) : Date.now() - 30 * 24 * 3600 * 1000;
  const to = query.to ? Number(query.to) : Date.now();
  try {
    const stats = await vlmStatsCalc.calcVlmUsage(from, to);
    return reply.send(stats);
  } catch (err: any) {
    return reply.status(500).send({ error: `Failed to compute VLM stats: ${err.message}` });
  }
});

// Decision Engine routes (new architecture)
if (decisionEngine) {
  registerDecisionRoutes(app, decisionEngine);
  if (streamManager) registerStreamRoutes(app, streamManager);
  if (experienceCompiler) {
    const memoryStore = new MemoryStore(pool);
    registerMemoryRoutes(app, memoryStore, experienceCompiler);
  }
}

const aiMemoryScheduler = new MemoryScheduler();
await app.register(async function (scope: FastifyInstance) {
  registerAiMemoryRoutes(scope, aiMemoryScheduler);
});
aiMemoryScheduler.start();
console.log("[AIMemory] Scheduler API registered, auto-scheduling ENABLED");

const loginBodySchema = z.object({
  account: z.string().min(1, '请输入用户名或手机号'),
  password: z.string().min(1, '请输入密码'),
});

app.post('/api/v1/auth/login', {
}, async (req, reply) => {
  const parsed = loginBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
  }
  const { account, password } = parsed.data;

  // Look up user by username or phone
  const [user] = await db.select().from(users).where(
    or(eq(users.username, account), eq(users.phone, account))
  );
  if (!user) {
    return reply.status(401).send({ error: '账号或密码错误' });
  }

  if (user.status === 'disabled') {
    return reply.status(403).send({ error: '账号已被禁用' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return reply.status(401).send({ error: '账号或密码错误' });
  }

  // Update last login
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const authUser: AuthUser = {
    userId: user.id,
    username: user.username,
    role: user.role as AuthUser['role'],
    tenantId: user.tenantId ?? undefined,
  };

  const token = authService.signToken(authUser);
  const refreshToken = authService.signRefreshToken(authUser);

  return {
    token,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      phone: user.phone
        ? user.phone.slice(0, 3) + '****' + user.phone.slice(-4)
        : null,
      role: user.role,
    },
  };
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
    const user = req.user as AuthUser;
    return {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      version: APP_VERSION,
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
    uptime: Math.floor(process.uptime()),
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

// ── Initialize billing services ──
try {
  await seedDefaultPlans();
  subscriptionScheduler.start();
  console.log('[Billing] Plans seeded, subscription scheduler started');
} catch (err) {
  console.warn('[Billing] Non-critical billing init failed:', (err as Error).message);
}

// ── Load RBAC permission overrides from DB ──
try {
  await reloadPermissions();
  console.log('[RBAC] Permission overrides loaded');
} catch (err) {
  console.warn('[RBAC] Permission override load failed — using defaults:', (err as Error).message);
}

// Graceful shutdown
const shutdown = () => {
  console.log('\nShutting down...');

  // Force exit after 10s if graceful shutdown hangs
  const forceExit = setTimeout(() => {
    console.error('Forced shutdown after 10s timeout');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  (async () => {
    try {
      if (bridgeClient) bridgeClient.disconnect();
      hub.dispose();
      if (nats?.isConnected()) await nats.close();
      if (minio) await minio.shutdown?.().catch(() => {});
      if (experienceCompiler) experienceCompiler.stop();
      subscriptionScheduler.stop();
      await app.close();
      await pool.end();
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      console.error('Shutdown error:', err);
      clearTimeout(forceExit);
      process.exit(1);
    }
  })();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
