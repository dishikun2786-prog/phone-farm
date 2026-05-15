/**
 * Subscription renewal scheduler — checks expiring subscriptions daily via BullMQ repeatable job.
 */
import { db } from '../db.js';
import { subscriptions, usageRecords } from '../billing/billing-schema.js';
import { lte, eq, and, gte } from 'drizzle-orm';

export class SubscriptionScheduler {
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(intervalMs = 24 * 60 * 60 * 1000) {
    this.intervalMs = intervalMs;
  }

  start() {
    if (this.timer) return;
    console.log('[SubscriptionScheduler] Started — checking subscriptions every 24h');

    // Run once immediately, then on schedule
    this.checkSubscriptions();
    this.timer = setInterval(() => this.checkSubscriptions(), this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[SubscriptionScheduler] Stopped');
  }

  async checkSubscriptions() {
    try {
      const now = new Date();

      // Find subscriptions expiring within 3 days
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const expiringSubs = await db.select().from(subscriptions)
        .where(and(
          eq(subscriptions.status, 'active'),
          gte(subscriptions.currentPeriodEnd, now),
          lte(subscriptions.currentPeriodEnd, threeDaysFromNow),
        ));

      for (const sub of expiringSubs) {
        // Check if there's a recent order (automatic renewal attempt)
        console.log(`[SubscriptionScheduler] Subscription ${sub.id} expiring soon: ${sub.currentPeriodEnd}`);

        // If past the end date, mark as past_due (3-day grace period)
        if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) < now) {
          await db.update(subscriptions).set({
            status: 'past_due',
            updatedAt: now,
          }).where(eq(subscriptions.id, sub.id));
          console.log(`[SubscriptionScheduler] Subscription ${sub.id} marked as past_due`);
        }
      }

      // Expire subscriptions that are past_due for more than 3 days
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const expiredSubs = await db.select().from(subscriptions)
        .where(and(
          eq(subscriptions.status, 'past_due'),
          lte(subscriptions.currentPeriodEnd, threeDaysAgo),
        ));

      for (const sub of expiredSubs) {
        await db.update(subscriptions).set({
          status: 'expired',
          updatedAt: now,
        }).where(eq(subscriptions.id, sub.id));
        console.log(`[SubscriptionScheduler] Subscription ${sub.id} expired`);
      }
    } catch (err) {
      console.error('[SubscriptionScheduler] Error checking subscriptions:', err);
    }
  }
}

export const subscriptionScheduler = new SubscriptionScheduler();
