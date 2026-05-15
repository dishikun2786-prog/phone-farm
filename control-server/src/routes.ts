import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from './db.js';
import { config } from './config.js';
import { accounts, devices, executions, tasks, taskTemplates } from './schema.js';
import { wsHub } from './ws-hub.js';
import { requirePermission } from './auth/auth-middleware.js';

function getTenantId(req: FastifyRequest): string | null {
  return (req as any).user?.tenantId || null;
}

const createTaskSchema = z.object({
  name: z.string(),
  templateId: z.string().optional(),
  deviceId: z.string(),
  accountId: z.string().optional(),
  config: z.record(z.string(), z.any()).default({}),
  cronExpr: z.string().optional(),
  enabled: z.boolean().default(true),
});

const sendCommandSchema = z.object({
  action: z.enum(['start_task', 'stop_task', 'screenshot', 'tap', 'swipe', 'type', 'launch', 'back', 'home']),
  params: z.record(z.string(), z.any()).optional(),
});

export async function deviceRoutes(app: FastifyInstance) {
  // List all devices
  app.get('/api/v1/devices', { preHandler: [requirePermission('devices', 'read')] }, async (req) => {
    const tid = getTenantId(req);
    const rows = await db.select().from(devices)
      .where(tid ? eq(devices.tenantId, tid) : undefined)
      .orderBy(desc(devices.lastSeen));
    return rows.map(d => ({ ...d, tailscaleIp: d.publicIp }));
  });

  // Get device detail
  app.get<{ Params: { id: string } }>('/api/v1/devices/:id', { preHandler: [requirePermission('devices', 'read')] }, async (req, reply) => {
    const [device] = await db.select().from(devices).where(eq(devices.id, req.params.id));
    if (!device) {
      return reply.status(404).send({ error: 'Device not found' });
    }
    const online = wsHub.isDeviceOnline(device.id);
    return { ...device, online, tailscaleIp: device.publicIp };
  });

  // Android: POST /api/v1/device/heartbeat — REST-based device heartbeat (no auth for device)
  const heartbeatSchema = z.object({
    deviceId: z.string(),
    timestamp: z.number().optional(),
    batteryLevel: z.number().optional(),
    batteryCharging: z.boolean().optional(),
    screenOn: z.boolean().optional(),
    currentPackage: z.string().optional(),
    activeTaskCount: z.number().optional(),
    memoryMb: z.number().optional(),
    cpuUsage: z.number().optional(),
  });
  app.post('/api/v1/device/heartbeat', async (req, reply) => {
    const deviceToken = (req.headers as Record<string, string>)['x-device-token'];
    if (config.DEVICE_AUTH_TOKEN && deviceToken !== config.DEVICE_AUTH_TOKEN) {
      return reply.status(401).send({ success: false, error: 'Invalid device token' });
    }
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid heartbeat body', details: parsed.error.issues });
    const { deviceId, timestamp: _ts, batteryLevel, batteryCharging, screenOn, currentPackage, activeTaskCount, memoryMb, cpuUsage } = parsed.data;
    try {
      await db.update(devices).set({
        battery: batteryLevel ?? null,
        screenOn: screenOn ?? null,
        currentApp: currentPackage ?? null,
        lastSeen: new Date(),
        updatedAt: new Date(),
        metadata: { batteryCharging, activeTaskCount, memoryMb, cpuUsage },
      }).where(eq(devices.id, deviceId));
    } catch { /* device may not exist yet — heartbeat will create it on WS connect */ }
    return reply.send({ ok: true, serverTime: Date.now() });
  });
}

export async function taskRoutes(app: FastifyInstance) {
  // List task templates
  app.get('/api/v1/task-templates', { preHandler: [requirePermission('tasks', 'read')] }, async (req) => {
    const tid = getTenantId(req);
    return db.select().from(taskTemplates)
      .where(tid ? eq(taskTemplates.tenantId, tid) : undefined)
      .orderBy(taskTemplates.platform, taskTemplates.name);
  });

  // List tasks
  app.get('/api/v1/tasks', { preHandler: [requirePermission('tasks', 'read')] }, async (req) => {
    const tid = getTenantId(req);
    return db.select().from(tasks)
      .where(tid ? eq(tasks.tenantId, tid) : undefined)
      .orderBy(desc(tasks.createdAt));
  });

  // Get task detail
  app.get<{ Params: { id: string } }>('/api/v1/tasks/:id', { preHandler: [requirePermission('tasks', 'read')] }, async (req, reply) => {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, req.params.id));
    if (!task) return reply.status(404).send({ success: false, error: 'Task not found' });
    return reply.send({ success: true, data: task });
  });

  // Create task
  app.post('/api/v1/tasks', { preHandler: [requirePermission('tasks', 'write')] }, async (req, reply) => {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.issues });
    const tid = getTenantId(req);
    const [task] = await db.insert(tasks).values({ ...parsed.data, tenantId: tid || undefined }).returning();
    return reply.status(201).send(task);
  });

  // Update task
  app.put<{ Params: { id: string } }>('/api/v1/tasks/:id', { preHandler: [requirePermission('tasks', 'write')] }, async (req, reply) => {
    const parsed = createTaskSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.issues });
    const [task] = await db.update(tasks).set(parsed.data).where(eq(tasks.id, req.params.id)).returning();
    if (!task) return reply.status(404).send({ success: false, error: 'Task not found' });
    return reply.send({ success: true, data: task });
  });

  // Delete task
  app.delete<{ Params: { id: string } }>('/api/v1/tasks/:id', { preHandler: [requirePermission('tasks', 'delete')] }, async (req) => {
    await db.delete(tasks).where(eq(tasks.id, req.params.id));
    return { success: true };
  });

  // Run task immediately
  app.post<{ Params: { id: string } }>('/api/v1/tasks/:id/run', { preHandler: [requirePermission('tasks', 'write')] }, async (req, reply) => {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, req.params.id));
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    const [device] = await db.select().from(devices).where(eq(devices.id, task.deviceId!));
    if (!device) return reply.status(404).send({ error: 'Device not found' });

    // Get template script name
    let scriptName = 'task_dy_toker';
    if (task.templateId) {
      const [tmpl] = await db.select().from(taskTemplates).where(eq(taskTemplates.id, task.templateId));
      if (tmpl) scriptName = tmpl.scriptName;
    }

    // Create execution record
    const [exec] = await db.insert(executions).values({
      taskId: task.id,
      deviceId: task.deviceId!,
      status: 'pending',
    }).returning();

    // Send start command to device (camelCase for Android Kotlin deserialization)
    const sent = wsHub.sendToDevice(device.id, {
      type: 'start_task',
      taskId: exec.id,
      scriptName,
      platform: (task.config as any)?.platform || 'dy',
      config: task.config || {},
      priority: 0,
    });

    if (!sent) {
      await db.update(executions).set({ status: 'failed', errorMessage: 'Device offline' }).where(eq(executions.id, exec.id));
      return reply.status(400).send({ error: 'Device is offline' });
    }

    await db.update(executions).set({ status: 'running', startedAt: new Date() }).where(eq(executions.id, exec.id));

    return { execution: exec, sent };
  });

  // Stop task
  app.post<{ Params: { id: string } }>('/api/v1/tasks/:id/stop', { preHandler: [requirePermission('tasks', 'write')] }, async (req, reply) => {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, req.params.id));
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    const sent = wsHub.sendToDevice(task.deviceId!, {
      type: 'stop_task',
      taskId: task.id,
    });

    return { success: sent };
  });

  // Get execution logs
  app.get<{ Params: { id: string } }>('/api/v1/tasks/:id/logs', { preHandler: [requirePermission('tasks', 'read')] }, async (req) => {
    return db.select().from(executions)
      .where(eq(executions.taskId, req.params.id))
      .orderBy(desc(executions.createdAt))
      .limit(50);
  });

  // Android: POST /api/v1/tasks/:taskId/result — report task execution result
  const taskResultSchema = z.object({
    success: z.boolean().optional(),
    stats: z.record(z.string(), z.string()).optional(),
    errorMessage: z.string().optional(),
    durationMs: z.number().optional(),
  });
  app.post<{ Params: { taskId: string } }>('/api/v1/tasks/:taskId/result', async (req, reply) => {
    const { taskId } = req.params;
    const parsed = taskResultSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid result body' });
    const { success, stats, errorMessage, durationMs } = parsed.data;
    try {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      if (!task) return reply.status(404).send({ error: 'Task not found' });
      if (!task.deviceId) return reply.status(400).send({ error: 'Task has no device assigned' });
      await db.insert(executions).values({
        taskId,
        deviceId: task.deviceId,
        status: success ? 'completed' : 'failed',
        errorMessage: errorMessage,
        finishedAt: new Date(),
        stats: stats ?? {},
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: `Failed to record result: ${message}` });
    }
    return reply.send({ recorded: true, taskId, status: success ? 'completed' : 'failed' });
  });
}

const createAccountSchema = z.object({
  platform: z.enum(["dy", "ks", "wx", "xhs"]),
  username: z.string(),
  passwordEncrypted: z.string(),
  deviceId: z.string().optional(),
});

export async function accountRoutes(app: FastifyInstance) {
  app.get('/api/v1/accounts', { preHandler: [requirePermission('accounts', 'read')] }, async (req) => {
    const tid = getTenantId(req);
    return db.select().from(accounts)
      .where(tid ? eq(accounts.tenantId, tid) : undefined)
      .orderBy(accounts.platform);
  });

  app.post('/api/v1/accounts', { preHandler: [requirePermission('accounts', 'write')] }, async (req, reply) => {
    const parsed = createAccountSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.issues });
    const tid = getTenantId(req);
    const [acct] = await db.insert(accounts).values({ ...parsed.data, tenantId: tid || undefined }).returning();
    return reply.status(201).send(acct);
  });

  app.put<{ Params: { id: string } }>('/api/v1/accounts/:id', { preHandler: [requirePermission('accounts', 'write')] }, async (req, reply) => {
    const { id } = req.params;
    const parsed = createAccountSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.issues });
    const existing = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
    if (existing.length === 0) return reply.status(404).send({ error: 'Account not found' });
    const [updated] = await db.update(accounts).set({ ...parsed.data, updatedAt: new Date() }).where(eq(accounts.id, id)).returning();
    return updated;
  });

  app.delete<{ Params: { id: string } }>('/api/v1/accounts/:id', { preHandler: [requirePermission('accounts', 'delete')] }, async (req) => {
    await db.delete(accounts).where(eq(accounts.id, req.params.id));
    return { success: true };
  });
}
