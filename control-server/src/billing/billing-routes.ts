/**
 * PhoneFarm Billing Routes — plan query, subscription management, order tracking.
 */
import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { billingPlans, subscriptions, orders, usageRecords, invoices } from "./billing-schema.js";
import { eq, desc, and, gte, lte } from "drizzle-orm";

export async function billingRoutes(app: FastifyInstance): Promise<void> {

  // ── Plans ──

  app.get("/api/v1/billing/plans", async (_req, reply) => {
    const plans = await db
      .select()
      .from(billingPlans)
      .where(eq(billingPlans.isActive, true))
      .orderBy(billingPlans.monthlyPriceCents);
    return reply.send({ plans });
  });

  app.get("/api/v1/billing/plans/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [plan] = await db.select().from(billingPlans).where(eq(billingPlans.id, id)).limit(1);
    if (!plan) return reply.status(404).send({ error: "Plan not found" });
    return reply.send(plan);
  });

  // ── Subscriptions ──

  app.get("/api/v1/billing/subscription", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
      .limit(1);
    return reply.send(sub ? { subscription: sub } : { subscription: null, defaultPlan: "free" });
  });

  app.post("/api/v1/billing/subscribe", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const { planId } = req.body as { planId: string };
    if (!planId) return reply.status(400).send({ error: "planId required" });

    const [plan] = await db.select().from(billingPlans).where(eq(billingPlans.id, planId)).limit(1);
    if (!plan) return reply.status(404).send({ error: "Plan not found" });

    // Cancel existing active subscription
    await db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));

    // Create new subscription
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    const [sub] = await db
      .insert(subscriptions)
      .values({
        userId,
        planId: plan.id,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .returning();

    // Create order
    const [order] = await db
      .insert(orders)
      .values({
        userId,
        subscriptionId: sub.id,
        amountCents: plan.monthlyPriceCents ?? 0,
        status: "paid",
        paidAt: now,
      })
      .returning();

    return reply.status(201).send({ subscription: sub, order });
  });

  app.post("/api/v1/billing/cancel", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    await db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));

    return reply.send({ ok: true });
  });

  // ── Orders ──

  app.get("/api/v1/billing/orders", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const { limit } = req.query as Record<string, string>;
    const ordersList = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(Number(limit) || 20);

    return reply.send({ orders: ordersList });
  });

  // ── Usage ──

  app.get("/api/v1/billing/usage", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const { from, to } = req.query as Record<string, string>;
    const fromDate = new Date(from ? Number(from) : Date.now() - 30 * 24 * 3600 * 1000);
    const toDate = new Date(to ? Number(to) : Date.now());

    const records = await db
      .select()
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.userId, userId),
          gte(usageRecords.recordedAt, fromDate),
          lte(usageRecords.recordedAt, toDate),
        )
      )
      .orderBy(desc(usageRecords.recordedAt))
      .limit(500);

    // Aggregate by metric
    const aggregated: Record<string, number> = {};
    for (const r of records) {
      aggregated[r.metric] = (aggregated[r.metric] || 0) + r.quantity;
    }

    return reply.send({
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totalRecords: records.length,
      aggregated,
      records,
    });
  });

  app.post("/api/v1/billing/usage/record", async (req, reply) => {
    const { userId, deviceId, metric, quantity } = req.body as {
      userId: string; deviceId?: string; metric: string; quantity: number;
    };
    if (!userId || !metric || quantity == null) {
      return reply.status(400).send({ error: "userId, metric, and quantity required" });
    }

    const [record] = await db
      .insert(usageRecords)
      .values({ userId, deviceId, metric, quantity })
      .returning();

    return reply.status(201).send(record);
  });

  // ── Invoices ──

  app.get("/api/v1/billing/invoices", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const invs = await db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, userId))
      .orderBy(desc(invoices.createdAt))
      .limit(50);

    return reply.send({ invoices: invs });
  });
}
