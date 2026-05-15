/**
 * VPS Relay Server — 公网中继服务器入口。
 *
 * 部署到公网 VPS，仅运行 BridgeServer + UDP Relay。
 * 不需要 PostgreSQL / Redis。
 *
 * 启动: npx tsx src/vps-relay.ts
 * 或:   node --loader ts-node/esm src/vps-relay.ts
 */

import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { BridgeServer } from './relay/bridge-server';

const PORT = parseInt(process.env.RELAY_PORT || '8499');
const HOST = process.env.RELAY_HOST || '0.0.0.0';
const CONTROL_TOKEN = process.env.CONTROL_TOKEN || 'control-token-change-me';
const DEVICE_AUTH_TOKEN = process.env.DEVICE_AUTH_TOKEN || 'device-auth-token-change-me';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const UDP_RELAY_PORT = parseInt(process.env.UDP_RELAY_PORT || '8444');
const AI_AUTH_TOKEN = process.env.AI_AUTH_TOKEN || CONTROL_TOKEN;

const app = Fastify({ logger: true });

await app.register(fastifyCors, { origin: true });
await app.register(fastifyWebsocket);

const bridge = new BridgeServer({
  controlToken: CONTROL_TOKEN,
  deviceAuthToken: DEVICE_AUTH_TOKEN,
  jwtSecret: JWT_SECRET,
  udpPort: UDP_RELAY_PORT,
  aiAuthToken: AI_AUTH_TOKEN,
});

// Start UDP relay
bridge.startUdpRelay();

// ── WebSocket routes ──

app.register(async function (scope) {
  // Local control server tunnel (1 connection)
  scope.get('/ws/control', { websocket: true }, (socket, _req) => {
    bridge.handleControl(socket);
  });

  // Phone device connections (both paths for compatibility with APK and relay clients)
  scope.get('/ws/phone', { websocket: true }, (socket, req) => {
    const addr = req?.socket?.remoteAddress || req?.ip || 'unknown';
    bridge.handlePhone(socket, addr);
  });
  scope.get('/ws/device', { websocket: true }, (socket, req) => {
    const addr = req?.socket?.remoteAddress || req?.ip || 'unknown';
    bridge.handlePhone(socket, addr);
  });

  // Frontend Dashboard connections
  scope.get('/ws/frontend', { websocket: true }, (socket, req) => {
    bridge.handleFrontend(socket, req);
  });

  // AI Worker connections (DeepSeek agent on VPS)
  scope.get('/ws/ai/worker', { websocket: true }, (socket, req) => {
    const addr = req?.socket?.remoteAddress || req?.ip || 'unknown';
    bridge.handleAiWorker(socket, addr);
  });

  // AI Control connections (Claude Code CLI from local machine)
  scope.get('/ws/ai/control', { websocket: true }, (socket, _req) => {
    bridge.handleAiControl(socket);
  });
});

// ── REST API (minimal) ──

app.get('/api/v1/relay/health', async () => {
  return { status: 'ok', uptime: process.uptime() };
});

app.get('/api/v1/relay/stats', async () => {
  return bridge.getStats();
});

app.get('/api/v1/ai/stats', async () => {
  return bridge.aiRouter.getStats();
});

app.get('/api/v1/ai/workers', async () => {
  return { workers: bridge.aiRouter.getWorkers() };
});

// ── Dashboard static files (SPA) — must be after all API/WS routes ──
const dashboardRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../dashboard/dist');
await app.register(fastifyStatic, {
  root: dashboardRoot,
  prefix: '/',
});
const CONTROL_API_URL = process.env.CONTROL_API_URL || 'http://127.0.0.1:8443';

// Proxy /api/* to the control server
// Promise-based — collects body then sends, avoids Fastify stream+async handler issues
app.route({
  method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  url: '/api/*',
  handler: async (request, reply) => {
    const url = new URL(request.url, CONTROL_API_URL);
    try {
      const result = await new Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: Buffer }>((resolve, reject) => {
        const proxyReq = http.request(url, {
          method: request.method,
          headers: { ...request.headers, host: url.host },
        }, (proxyRes) => {
          const chunks: Buffer[] = [];
          proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
          proxyRes.on('end', () => resolve({ statusCode: proxyRes.statusCode || 502, headers: proxyRes.headers, body: Buffer.concat(chunks) }));
          proxyRes.on('error', reject);
        });
        proxyReq.on('error', reject);
        if (request.body) proxyReq.write(JSON.stringify(request.body));
        proxyReq.end();
      });
      reply.status(result.statusCode);
      if (result.headers['content-type']) reply.header('content-type', result.headers['content-type']);
      const ct = result.headers['content-type']?.toString() || '';
      if (ct.includes('json')) {
        try { return JSON.parse(result.body.toString()); } catch { /* fall through */ }
      }
      reply.send(result.body);
    } catch {
      reply.status(502).send({ error: 'Control server unreachable' });
    }
  },
});

app.get('/health', async (_request, reply) => {
  try {
    const result = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const proxyReq = http.get(`${CONTROL_API_URL}/api/v1/health`, (proxyRes) => {
        let data = '';
        proxyRes.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        proxyRes.on('end', () => resolve({ statusCode: proxyRes.statusCode || 502, body: data }));
        proxyRes.on('error', reject);
      });
      proxyReq.on('error', reject);
      proxyReq.end();
    });
    reply.status(result.statusCode).send(JSON.parse(result.body));
  } catch {
    reply.status(502).send({ error: 'Control server unreachable' });
  }
});

app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith('/ws/')) {
    return reply.status(404).send({ error: 'WebSocket endpoint not found' });
  }
  return reply.sendFile('index.html');
});

// ── Shutdown ──

const shutdown = () => {
  console.log('[VpsRelay] Shutting down...');
  bridge.destroy();
  app.close().then(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ── Start ──

await app.listen({ port: PORT, host: HOST });
console.log(`[VpsRelay] Listening on http://${HOST}:${PORT}`);
console.log(`[VpsRelay] WebSocket: ws://${HOST}:${PORT}/ws/phone`);
console.log(`[VpsRelay] UDP relay: :${UDP_RELAY_PORT}/udp`);
