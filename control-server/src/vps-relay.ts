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
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
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

  // Phone device connections
  scope.get('/ws/phone', { websocket: true }, (socket, req) => {
    const addr = req?.socket?.remoteAddress || req?.ip || 'unknown';
    bridge.handlePhone(socket, addr);
  });

  // Frontend Dashboard connections
  scope.get('/ws/frontend', { websocket: true }, (socket, _req) => {
    bridge.handleFrontend(socket);
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

app.get('/health', async () => {
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
