/**
 * Default billing plan seeds — Free / Pro / Enterprise.
 * Run once during server startup to ensure plans exist.
 */
import { db } from '../db.js';
import { billingPlans } from '../billing/billing-schema.js';
import { sql } from 'drizzle-orm';

export const DEFAULT_PLANS = [
  {
    name: 'Free',
    tier: 'free',
    monthlyPriceCents: 0,
    maxDevices: 3,
    maxVlmCallsPerDay: 50,
    maxScriptExecutionsPerDay: 200,
    includesScreenStream: false,
    includesVlmAgent: false,
    includesPrioritySupport: false,
    features: ['activation', 'basic_vlm', 'script_execution'],
    monthlyAssistantCredits: 100,
    maxAssistantSessionsPerDay: 10,
    isActive: true,
  },
  {
    name: 'Pro',
    tier: 'pro',
    monthlyPriceCents: 9900, // 99 CNY
    maxDevices: 50,
    maxVlmCallsPerDay: 1000,
    maxScriptExecutionsPerDay: 5000,
    includesScreenStream: true,
    includesVlmAgent: true,
    includesPrioritySupport: false,
    features: ['activation', 'advanced_vlm', 'script_execution', 'screen_stream', 'api_access'],
    monthlyAssistantCredits: 1000,
    maxAssistantSessionsPerDay: 50,
    isActive: true,
  },
  {
    name: 'Enterprise',
    tier: 'enterprise',
    monthlyPriceCents: 49900, // 499 CNY
    maxDevices: 500,
    maxVlmCallsPerDay: 10000,
    maxScriptExecutionsPerDay: 50000,
    includesScreenStream: true,
    includesVlmAgent: true,
    includesPrioritySupport: true,
    features: ['activation', 'advanced_vlm', 'script_execution', 'screen_stream', 'api_access', 'priority_support', 'white_label', 'dedicated_agent'],
    monthlyAssistantCredits: 5000,
    maxAssistantSessionsPerDay: 200,
    isActive: true,
  },
];

export async function seedDefaultPlans(): Promise<void> {
  const existing = await db.select({ count: sql<number>`count(*)::int` }).from(billingPlans);
  if (existing[0]?.count > 0) {
    console.log(`[PlanSeed] ${existing[0].count} plans already exist, skipping seed`);
    return;
  }

  const now = new Date();
  for (const plan of DEFAULT_PLANS) {
    await db.insert(billingPlans).values({ ...plan, createdAt: now });
  }
  console.log(`[PlanSeed] Seeded ${DEFAULT_PLANS.length} default plans`);
}
