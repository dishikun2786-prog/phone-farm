/**
 * Payment routes — order creation, payment initiation, status queries.
 */
import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '../auth/auth-middleware.js';
import { z } from 'zod';
import { db } from '../db.js';
import { orders, billingPlans, subscriptions } from '../billing/billing-schema.js';
import { getGateway, registerGateway } from './payment-gateway.js';
import { wechatPayGateway } from './wechat-pay.js';
import { alipayGateway } from './alipay.js';
import { handleWechatCallback, handleAlipayCallback } from './payment-webhook.js';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// Register gateways on import
registerGateway(wechatPayGateway);
registerGateway(alipayGateway);

const createOrderSchema = z.object({
  planId: z.string().uuid(),
  paymentMethod: z.enum(['wechat_pay', 'alipay']),
  couponCode: z.string().optional(),
});

export async function paymentRoutes(app: FastifyInstance) {
  // Create order + initiate payment
  app.post('/api/v2/billing/orders', async (req, reply) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { planId, paymentMethod } = parsed.data;
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });

    const [plan] = await db.select().from(billingPlans).where(eq(billingPlans.id, planId)).limit(1);
    if (!plan) return reply.status(404).send({ error: 'Plan not found' });

    // Cancel existing active subscription
    await db.update(subscriptions)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(and(eq(subscriptions.userId, user.userId), eq(subscriptions.status, 'active')));

    // Create pending subscription (activated by webhook on payment success)
    const orderId = randomUUID();
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

    const [sub] = await db.insert(subscriptions).values({
      userId: user.userId,
      planId: plan.id,
      status: 'pending',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    }).returning();

    // Create order linked to the subscription
    await db.insert(orders).values({
      id: orderId,
      userId: user.userId,
      subscriptionId: sub.id,
      amountCents: plan.monthlyPriceCents || 0,
      currency: 'CNY',
      status: 'pending',
      paymentMethod,
      createdAt: now,
    });

    // Initiate payment via gateway
    const gateway = getGateway(paymentMethod);
    if (!gateway) {
      return reply.status(400).send({ error: `Payment method not available: ${paymentMethod}` });
    }

    const result = await gateway.createOrder({
      orderId,
      amountCents: plan.monthlyPriceCents || 0,
      currency: 'CNY',
      description: `${plan.name} - ${plan.tier} Plan`,
    });

    if (!result.success) {
      return reply.status(500).send({ error: result.error || 'Payment initiation failed' });
    }

    return reply.status(201).send({
      orderId,
      amountCents: plan.monthlyPriceCents || 0,
      payUrl: result.payUrl,
      qrCode: result.qrCode,
      paymentMethod,
      status: 'pending',
    });
  });

  // ── Plans (v2) ──

  app.get('/api/v2/billing/plans', async (_req, reply) => {
    const plans = await db.select().from(billingPlans)
      .where(eq(billingPlans.isActive, true))
      .orderBy(billingPlans.monthlyPriceCents);
    return reply.send({ plans });
  });

  // ── Subscribe (v2, free plans / admin skipPayment) ──

  app.post('/api/v2/billing/subscribe', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });

    const { planId, skipPayment } = req.body as { planId: string; skipPayment?: boolean };
    if (!planId) return reply.status(400).send({ error: 'planId required' });

    const [plan] = await db.select().from(billingPlans).where(eq(billingPlans.id, planId)).limit(1);
    if (!plan) return reply.status(404).send({ error: 'Plan not found' });

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

    if (!skipPayment && (plan.monthlyPriceCents ?? 0) > 0) {
      return reply.status(400).send({
        error: 'Paid plans require payment. Use POST /api/v2/billing/orders with paymentMethod.',
        redirectTo: '/api/v2/billing/orders',
      });
    }

    // Cancel existing active subscription
    await db.update(subscriptions)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(and(eq(subscriptions.userId, user.userId), eq(subscriptions.status, 'active')));

    const [sub] = await db.insert(subscriptions).values({
      userId: user.userId,
      planId: plan.id,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    }).returning();

    const [order] = await db.insert(orders).values({
      userId: user.userId,
      subscriptionId: sub.id,
      amountCents: plan.monthlyPriceCents ?? 0,
      status: 'paid',
      paidAt: now,
      paymentMethod: skipPayment ? 'manual' : 'free',
    }).returning();

    return reply.status(201).send({ subscription: sub, order });
  });

  // Query order status
  app.get('/api/v2/billing/orders/:id', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });

    const { id } = req.params as { id: string };
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return reply.status(404).send({ error: 'Order not found' });
    if (order.userId !== user.userId) return reply.status(403).send({ error: 'Access denied' });
    return reply.send(order);
  });

  // List user orders
  app.get('/api/v2/billing/orders', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });
    const userOrders = await db.select().from(orders).where(eq(orders.userId, user.userId));
    return reply.send({ orders: userOrders, total: userOrders.length });
  });

  // Payment callbacks
  app.post('/api/v2/billing/payment/callback/wechat', handleWechatCallback);
  app.post('/api/v2/billing/payment/callback/alipay', handleAlipayCallback);

  // Subscription status
  app.get('/api/v2/billing/subscription', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });

    const { subscriptions, billingPlans } = await import('../billing/billing-schema.js');
    const [sub] = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, user.userId))
      .orderBy(subscriptions.createdAt)
      .limit(1);

    if (!sub) return reply.send({ subscription: null, plan: null });

    const [plan] = await db.select().from(billingPlans).where(eq(billingPlans.id, sub.planId)).limit(1);
    return reply.send({ subscription: sub, plan: plan || null });
  });

  // Cancel subscription
  app.post('/api/v2/billing/subscription/cancel', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });

    const { subscriptions } = await import('../billing/billing-schema.js');
    const [sub] = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, user.userId))
      .limit(1);

    if (!sub) return reply.status(404).send({ error: 'No active subscription' });

    await db.update(subscriptions).set({
      status: 'cancelled',
      cancelledAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(subscriptions.id, sub.id));

    return reply.send({ cancelled: true });
  });
}
