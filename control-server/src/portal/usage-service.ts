/**
 * Usage tracking and quota enforcement service.
 */
import { db } from '../db.js';
import { usageRecords, subscriptions, billingPlans } from '../billing/billing-schema.js';
import { eq, and, gte, sql } from 'drizzle-orm';

export interface UsageQuota {
  metric: string;
  used: number;
  limit: number;
  remaining: number;
  isExceeded: boolean;
}

export class UsageService {
  /** Record a usage event */
  async record(userId: string, deviceId: string | null, metric: string, quantity = 1): Promise<void> {
    await db.insert(usageRecords).values({
      userId,
      deviceId,
      metric,
      quantity,
      recordedAt: new Date(),
    });
  }

  /** Check if user has exceeded their quota for a given metric today */
  async checkQuota(userId: string, metric: string): Promise<UsageQuota> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = await db.select().from(usageRecords).where(
      and(eq(usageRecords.userId, userId), eq(usageRecords.metric, metric), gte(usageRecords.recordedAt, today))
    );

    const used = rows.reduce((sum, r) => sum + r.quantity, 0);

    // Get user's plan limits
    const [sub] = await db.select().from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
      .limit(1);

    let limit = 100; // default free tier
    if (sub) {
      const [plan] = await db.select().from(billingPlans).where(eq(billingPlans.id, sub.planId)).limit(1);
      if (plan) {
        switch (metric) {
          case 'vlm_call': limit = plan.maxVlmCallsPerDay || 50; break;
          case 'script_execution': limit = plan.maxScriptExecutionsPerDay || 200; break;
          default: limit = 100;
        }
      }
    }

    return { metric, used, limit, remaining: Math.max(0, limit - used), isExceeded: used >= limit };
  }

  /** Get all quotas for a user */
  async getAllQuotas(userId: string): Promise<UsageQuota[]> {
    const metrics = ['vlm_call', 'script_execution', 'screen_stream_minute'];
    return Promise.all(metrics.map(m => this.checkQuota(userId, m)));
  }

  /** Get today's usage summary */
  async getTodayUsage(userId: string): Promise<Record<string, number>> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = await db.select().from(usageRecords).where(
      and(eq(usageRecords.userId, userId), gte(usageRecords.recordedAt, today))
    );

    const summary: Record<string, number> = {};
    for (const r of rows) {
      summary[r.metric] = (summary[r.metric] || 0) + r.quantity;
    }
    return summary;
  }
}

export const usageService = new UsageService();
