import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { config } from './config.js';
import { initWsHub } from './ws-hub.js';
import { deviceRoutes, taskRoutes, accountRoutes } from './routes.js';
import { db } from './db.js';
import { taskTemplates } from './schema.js';

const app = Fastify({ logger: true });

// Plugins
await app.register(fastifyCors, { origin: true });
await app.register(fastifyJwt, { secret: config.JWT_SECRET });
await app.register(fastifyWebsocket);

// WebSocket hub
const hub = initWsHub(config.DEVICE_AUTH_TOKEN);

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

// Auth
app.post('/api/v1/auth/login', async (req, reply) => {
  const { username, password } = req.body as any;
  if (username === 'admin' && password === 'admin123') {
    const token = app.jwt.sign({ username, role: 'admin' });
    return { token };
  }
  return reply.status(401).send({ error: 'Invalid credentials' });
});

// Health check
app.get('/api/v1/health', async () => {
  return {
    status: 'ok',
    uptime: process.uptime(),
    devicesOnline: hub.getOnlineDevices().length,
  };
});

// Seed task templates
app.post('/api/v1/seed-templates', async () => {
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

// Start
try {
  await app.listen({ port: config.PORT, host: config.HOST });
  console.log(`Control server running on http://${config.HOST}:${config.PORT}`);
  console.log(`WebSocket: ws://${config.HOST}:${config.PORT}/ws/device`);
  console.log(`WebSocket: ws://${config.HOST}:${config.PORT}/ws/frontend`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
