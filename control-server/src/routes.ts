import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from './db.js';
import { accounts, devices, executions, tasks, taskTemplates } from './schema.js';
import { wsHub } from './ws-hub.js';

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
  app.get('/api/v1/devices', async () => {
    return db.select().from(devices).orderBy(desc(devices.lastSeen));
  });

  // Get device detail
  app.get<{ Params: { id: string } }>('/api/v1/devices/:id', async (req, reply) => {
    const [device] = await db.select().from(devices).where(eq(devices.id, req.params.id));
    if (!device) {
      return reply.status(404).send({ error: 'Device not found' });
    }
    const online = wsHub.isDeviceOnline(device.id);
    return { ...device, online };
  });

  // Android: POST /api/v1/device/heartbeat — REST-based device heartbeat
  app.post('/api/v1/device/heartbeat', async (req, reply) => {
    const { deviceId, timestamp, batteryLevel, batteryCharging, screenOn, currentPackage, activeTaskCount, memoryMb, cpuUsage } =
      req.body as Record<string, any>;
    if (!deviceId) return reply.status(400).send({ error: 'deviceId required' });
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
  app.get('/api/v1/task-templates', async () => {
    return db.select().from(taskTemplates).orderBy(taskTemplates.platform, taskTemplates.name);
  });

  // List tasks
  app.get('/api/v1/tasks', async () => {
    return db.select().from(tasks).orderBy(desc(tasks.createdAt));
  });

  // Get task detail
  app.get<{ Params: { id: string } }>('/api/v1/tasks/:id', async (req) => {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, req.params.id));
    return task || { error: 'Not found' };
  });

  // Create task
  app.post('/api/v1/tasks', async (req, reply) => {
    const body = createTaskSchema.parse(req.body);
    const [task] = await db.insert(tasks).values(body).returning();
    return reply.status(201).send(task);
  });

  // Update task
  app.put<{ Params: { id: string } }>('/api/v1/tasks/:id', async (req) => {
    const body = createTaskSchema.partial().parse(req.body);
    const [task] = await db.update(tasks).set(body).where(eq(tasks.id, req.params.id)).returning();
    return task;
  });

  // Delete task
  app.delete<{ Params: { id: string } }>('/api/v1/tasks/:id', async (req) => {
    await db.delete(tasks).where(eq(tasks.id, req.params.id));
    return { success: true };
  });

  // Run task immediately
  app.post<{ Params: { id: string } }>('/api/v1/tasks/:id/run', async (req, reply) => {
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

    // Send start command to device
    const sent = wsHub.sendToDevice(device.id, {
      type: 'start_task',
      task_id: exec.id,
      script: scriptName,
      config: task.config,
    });

    if (!sent) {
      await db.update(executions).set({ status: 'failed', errorMessage: 'Device offline' }).where(eq(executions.id, exec.id));
      return reply.status(400).send({ error: 'Device is offline' });
    }

    await db.update(executions).set({ status: 'running', startedAt: new Date() }).where(eq(executions.id, exec.id));

    return { execution: exec, sent };
  });

  // Stop task
  app.post<{ Params: { id: string } }>('/api/v1/tasks/:id/stop', async (req, reply) => {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, req.params.id));
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    const sent = wsHub.sendToDevice(task.deviceId!, {
      type: 'stop_task',
      task_id: task.id,
    });

    return { success: sent };
  });

  // Get execution logs
  app.get<{ Params: { id: string } }>('/api/v1/tasks/:id/logs', async (req) => {
    return db.select().from(executions)
      .where(eq(executions.taskId, req.params.id))
      .orderBy(desc(executions.createdAt))
      .limit(50);
  });

  // Android: POST /api/v1/tasks/:taskId/result — report task execution result
  app.post('/api/v1/tasks/:taskId/result', async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const { success, stats, errorMessage, durationMs } = req.body as {
      taskId?: string; success?: boolean; stats?: Record<string, string>;
      errorMessage?: string; durationMs?: number;
    };
    try {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      if (!task) return reply.status(404).send({ error: 'Task not found' });
      await db.insert(executions).values({
        taskId,
        deviceId: task.deviceId ?? '00000000-0000-0000-0000-000000000000',
        status: success ? 'completed' : 'failed',
        errorMessage: errorMessage ?? null,
        finishedAt: new Date(),
        stats: stats ?? {},
      });
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to record result: ${err.message}` });
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
  app.get('/api/v1/accounts', async () => {
    return db.select().from(accounts).orderBy(accounts.platform);
  });

  app.post('/api/v1/accounts', async (req, reply) => {
    const body = createAccountSchema.parse(req.body);
    const [acct] = await db.insert(accounts).values(body).returning();
    return reply.status(201).send(acct);
  });

  app.delete<{ Params: { id: string } }>('/api/v1/accounts/:id', async (req) => {
    await db.delete(accounts).where(eq(accounts.id, req.params.id));
    return { success: true };
  });
}
