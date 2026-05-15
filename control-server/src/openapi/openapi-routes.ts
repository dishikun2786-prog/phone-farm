import type { FastifyInstance } from 'fastify';
import { openApiAuth } from './openapi-auth.js';
import { openApiRateLimit } from './openapi-rate-limiter.js';
import { recordUsage } from './openapi-billing.js';
import { db } from '../db.js';
import { devices } from '../schema.js';
import { eq } from 'drizzle-orm';


export async function openApiRoutes(app: FastifyInstance) {
  // Apply auth + rate-limit to all open API routes
  app.addHook('preHandler', openApiAuth);
  app.addHook('preHandler', openApiRateLimit);
  app.addHook('onResponse', async (req, reply) => {
    if (req.apiApp && req.url.startsWith('/api/v2/open')) {
      await recordUsage({
        appId: req.apiApp.appId,
        tenantId: req.apiApp.tenantId,
        endpoint: req.url,
        method: req.method,
        statusCode: reply.statusCode,
        latencyMs: reply.elapsedTime,
      });
    }
  });

  // ── Device Management ──

  app.post('/api/v2/open/devices/register', async (req, reply) => {
    const apiApp = req.apiApp!;
    const { deviceId, name, model, androidVersion } = req.body as Record<string, string>;
    if (!deviceId) return reply.status(400).send({ error: 'deviceId is required' });

    const [device] = await db.insert(devices).values({
      tenantId: apiApp.tenantId,
      name: name || deviceId,
      model: model || '',
      status: 'online',
      lastSeen: new Date(),
    } as any).returning();

    return reply.status(201).send({ device });
  });

  app.get('/api/v2/open/devices', async (req, reply) => {
    const apiApp = req.apiApp!;
    const rows = await db.select().from(devices).where(eq(devices.tenantId, apiApp.tenantId));
    return reply.send({ devices: rows, total: rows.length });
  });

  app.get('/api/v2/open/devices/:id', async (req, reply) => {
    const apiApp = req.apiApp!;
    const { id } = req.params as { id: string };
    const [device] = await db.select().from(devices)
      .where(eq(devices.id, id))
      .limit(1);

    if (!device) return reply.status(404).send({ error: 'Device not found' });
    if (device.tenantId !== apiApp.tenantId) return reply.status(403).send({ error: 'Access denied' });

    return reply.send(device);
  });

  // ── Command ──

  app.post('/api/v2/open/devices/:id/command', async (req, reply) => {
    const apiApp = req.apiApp!;
    const { id } = req.params as { id: string };
    const { action, params } = req.body as { action: string; params?: Record<string, unknown> };

    try {
      (app as any).wsHub.sendToDevice(id, { type: 'command', action, params: params || {} });
      return reply.send({ sent: true, deviceId: id, action });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Task Management ──

  app.post('/api/v2/open/tasks', async (req, reply) => {
    const apiApp = req.apiApp!;
    const { tasks: tasksTable } = await import('../schema.js');
    const { name, deviceId, config, cronExpr } = req.body as Record<string, any>;
    if (!name) return reply.status(400).send({ error: 'name is required' });

    const [task] = await db.insert(tasksTable).values({
      tenantId: apiApp.tenantId,
      name,
      deviceId: deviceId || null,
      config: config || {},
      cronExpr: cronExpr || null,
    } as any).returning();

    return reply.status(201).send({ task });
  });

  app.get('/api/v2/open/tasks', async (req, reply) => {
    const apiApp = req.apiApp!;
    const { tasks: tasksTable } = await import('../schema.js');
    const rows = await db.select().from(tasksTable).where(eq(tasksTable.tenantId, apiApp.tenantId));
    return reply.send({ tasks: rows, total: rows.length });
  });

  // ── VLM Execution ──

  app.post('/api/v2/open/vlm/execute', async (req, reply) => {
    const { deviceId, task, modelName, maxSteps } = req.body as Record<string, any>;
    if (!deviceId || !task) return reply.status(400).send({ error: 'deviceId and task are required' });

    try {
      // Proxy to internal VLM
      const result = { deviceId, task, status: 'queued' };
      return reply.status(202).send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Usage ──

  app.get('/api/v2/open/usage', async (req, reply) => {
    const apiApp = req.apiApp!;
    const { apiUsageLogs } = await import('./openapi-schema.js');
    const query = req.query as Record<string, string>;
    const from = query.from ? new Date(Number(query.from)) : new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const { count, sum } = await import('drizzle-orm');
    const rows = await db.select().from(apiUsageLogs)
      .where(eq(apiUsageLogs.appId, apiApp.appId))
      .limit(100);

    const totalCalls = rows.length;
    const totalBilled = rows.reduce((s, r) => s + r.billedCents, 0);

    return reply.send({
      appId: apiApp.appId,
      totalCalls,
      totalBilledCents: totalBilled,
      calls: rows.slice(0, 50),
    });
  });
}

