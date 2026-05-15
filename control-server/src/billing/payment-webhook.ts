/**
 * Payment webhook handler — verifies callback signatures and processes payment notifications.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { payments } from './payment-schema.js';
import { orders, subscriptions } from '../billing/billing-schema.js';
import { db } from '../db.js';
import { eq } from 'drizzle-orm';
import { getGateway } from './payment-gateway.js';

export async function handleWechatCallback(req: FastifyRequest, reply: FastifyReply) {
  const gateway = getGateway('wechat_pay');
  if (!gateway) {
    return reply.status(500).send({ code: 'FAIL', message: 'Gateway not configured' });
  }

  const callback = {
    gateway: 'wechat_pay',
    rawBody: req.body,
    headers: req.headers as Record<string, string>,
  };

  const valid = await gateway.verifyCallback(callback);
  if (!valid) {
    return reply.status(400).send({ code: 'FAIL', message: 'Signature verification failed' });
  }

  const result = await gateway.parseCallback(callback);
  if (!result) {
    return reply.status(400).send({ code: 'FAIL', message: 'Failed to parse callback' });
  }

  await processPaymentResult(result);
  return reply.send({ code: 'SUCCESS', message: 'OK' });
}

export async function handleAlipayCallback(req: FastifyRequest, reply: FastifyReply) {
  const gateway = getGateway('alipay');
  if (!gateway) {
    return reply.status(500).send('fail');
  }

  const callback = {
    gateway: 'alipay',
    rawBody: req.body,
    headers: req.headers as Record<string, string>,
  };

  const valid = await gateway.verifyCallback(callback);
  if (!valid) {
    return reply.send('fail');
  }

  const result = await gateway.parseCallback(callback);
  if (!result) {
    return reply.send('fail');
  }

  await processPaymentResult(result);
  return reply.send('success');
}

async function processPaymentResult(result: {
  outTradeNo: string; transactionId: string; amountCents: number; status: 'success' | 'failed' | 'refund';
}) {
  if (result.status !== 'success') return;

  // Record payment transaction
  const [existingPayment] = await db.select().from(payments)
    .where(eq(payments.outTradeNo, result.outTradeNo)).limit(1);

  if (existingPayment) return; // Idempotent

  const now = new Date();
  await db.insert(payments).values({
    outTradeNo: result.outTradeNo,
    transactionId: result.transactionId,
    amountCents: result.amountCents,
    currency: 'CNY',
    status: result.status === 'success' ? 'paid' : 'failed',
    paidAt: now,
  });

  // Find and update the order
  const [order] = await db.select().from(orders)
    .where(eq(orders.id, result.outTradeNo)).limit(1);

  if (order) {
    await db.update(orders).set({
      status: 'paid',
      paidAt: now,
    }).where(eq(orders.id, order.id));

    // Activate subscription if order has one
    if (order.subscriptionId) {
      await db.update(subscriptions).set({
        status: 'active',
        updatedAt: now,
      }).where(eq(subscriptions.id, order.subscriptionId));
    }
  }
}
