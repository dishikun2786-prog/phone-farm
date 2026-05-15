/**
 * Portal BFF (Backend For Frontend) — aggregated routes for customer self-service portal.
 */
import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '../auth/auth-middleware.js';
import { db } from '../db.js';
import { devices, tasks, executions } from '../schema.js';
import { usageRecords, subscriptions, billingPlans } from '../billing/billing-schema.js';
import { eq, and, desc, gte, sql } from 'drizzle-orm';

export async function portalRoutes(app: FastifyInstance) {
  // ── Portal Dashboard: aggregated overview ──
  app.get('/api/v2/portal/dashboard', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });
    const tenantId = req.tenantId;

    const [deviceCount] = tenantId
      ? await db.select({ count: sql<number>`count(*)::int` }).from(devices).where(eq(devices.tenantId, tenantId))
      : [{ count: 0 }];

    const [taskCount] = tenantId
      ? await db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(eq(tasks.tenantId, tenantId))
      : [{ count: 0 }];

    // Today's usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const usageRows = tenantId
      ? await db.select().from(usageRecords).where(
          and(eq(usageRecords.userId, user.userId), gte(usageRecords.recordedAt, today))
        )
      : [];

    const usageSummary: Record<string, number> = {};
    for (const r of usageRows) {
      usageSummary[r.metric] = (usageSummary[r.metric] || 0) + r.quantity;
    }

    // Subscription
    const [sub] = await db.select().from(subscriptions)
      .where(and(eq(subscriptions.userId, user.userId), eq(subscriptions.status, 'active')))
      .limit(1);

    let plan = null;
    if (sub) {
      const [p] = await db.select().from(billingPlans).where(eq(billingPlans.id, sub.planId)).limit(1);
      plan = p || null;
    }

    return reply.send({
      deviceCount: deviceCount?.count || 0,
      taskCount: taskCount?.count || 0,
      todayUsage: usageSummary,
      subscription: sub || null,
      plan,
    });
  });

  // ── My Devices ──
  app.get('/api/v2/portal/devices', async (req, reply) => {
    const tenantId = req.tenantId;
    if (!tenantId) return reply.send({ devices: [], total: 0 });

    const rows = await db.select().from(devices)
      .where(eq(devices.tenantId, tenantId))
      .orderBy(desc(devices.lastSeen));

    return reply.send({ devices: rows, total: rows.length });
  });

  // ── My Tasks ──
  app.get('/api/v2/portal/tasks', async (req, reply) => {
    const tenantId = req.tenantId;
    if (!tenantId) return reply.send({ tasks: [], total: 0 });

    const rows = await db.select().from(tasks)
      .where(eq(tasks.tenantId, tenantId))
      .orderBy(desc(tasks.createdAt));

    return reply.send({ tasks: rows, total: rows.length });
  });

  // ── Usage Analytics ──
  app.get('/api/v2/portal/usage', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const query = req.query as Record<string, string>;
    const from = query.from ? new Date(Number(query.from)) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const to = query.to ? new Date(Number(query.to)) : new Date();

    const rows = await db.select().from(usageRecords)
      .where(and(
        eq(usageRecords.userId, user.userId),
        gte(usageRecords.recordedAt, from),
        sql`${usageRecords.recordedAt} <= ${to}`,
      ))
      .orderBy(desc(usageRecords.recordedAt))
      .limit(500);

    const aggregated: Record<string, number> = {};
    const daily: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      aggregated[r.metric] = (aggregated[r.metric] || 0) + r.quantity;
      const day = r.recordedAt?.toISOString().slice(0, 10) || 'unknown';
      if (!daily[day]) daily[day] = {};
      daily[day][r.metric] = (daily[day][r.metric] || 0) + r.quantity;
    }

    // Plan limits
    const [sub] = await db.select().from(subscriptions)
      .where(and(eq(subscriptions.userId, user.userId), eq(subscriptions.status, 'active')))
      .limit(1);
    let limits = null;
    if (sub) {
      const [plan] = await db.select().from(billingPlans).where(eq(billingPlans.id, sub.planId)).limit(1);
      if (plan) {
        limits = {
          maxDevices: plan.maxDevices,
          maxVlmCallsPerDay: plan.maxVlmCallsPerDay,
          maxScriptExecutionsPerDay: plan.maxScriptExecutionsPerDay,
        };
      }
    }

    return reply.send({ aggregated, daily, limits, totalRecords: rows.length });
  });
}
