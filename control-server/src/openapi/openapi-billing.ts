import { db } from '../db.js';
import { apiUsageLogs } from './openapi-schema.js';

interface UsageRecord {
  appId: string;
  tenantId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  latencyMs: number;
}

/**
 * Record an API call to the usage log.
 * Billing is done per-call at a configurable rate.
 */
export async function recordUsage(record: UsageRecord): Promise<void> {
  // Calculate billing: 0.001 cents per call (configurable)
  const billedCents = 0.001;

  try {
    await db.insert(apiUsageLogs).values({
      appId: record.appId,
      tenantId: record.tenantId,
      endpoint: record.endpoint,
      method: record.method,
      statusCode: record.statusCode,
      latencyMs: record.latencyMs,
      billedCents,
    });
  } catch (err) {
    // Log but don't block the response
    console.error('[OpenAPI Billing] Failed to record usage:', err);
  }
}

/**
 * Get usage summary for an app.
 */
export async function getAppUsage(appId: string, days: number = 30): Promise<{
  totalCalls: number;
  totalBilledCents: number;
  dailyBreakdown: Record<string, { calls: number; billedCents: number }>;
}> {
  const from = new Date(Date.now() - days * 24 * 3600 * 1000);

  const { sql, eq, gte } = await import('drizzle-orm');
  const rows = await db.select().from(apiUsageLogs)
    .where(gte(apiUsageLogs.recordedAt, from))
    .limit(10000);

  const dailyBreakdown: Record<string, { calls: number; billedCents: number }> = {};
  let totalCalls = 0;
  let totalBilledCents = 0;

  for (const r of rows) {
    totalCalls++;
    totalBilledCents += r.billedCents;
    const day = r.recordedAt.toISOString().slice(0, 10);
    if (!dailyBreakdown[day]) {
      dailyBreakdown[day] = { calls: 0, billedCents: 0 };
    }
    dailyBreakdown[day].calls++;
    dailyBreakdown[day].billedCents += r.billedCents;
  }

  return { totalCalls, totalBilledCents: Math.round(totalBilledCents * 100) / 100, dailyBreakdown };
}
