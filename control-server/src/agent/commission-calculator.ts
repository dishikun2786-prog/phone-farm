import { db } from '../db.js';
import { agentCommissions, agents } from './agent-schema.js';
import { eq, and, sql } from 'drizzle-orm';

export class CommissionCalculator {
  /**
   * Calculate commission for a single card key consumption.
   * Formula: commission = (retailPrice - wholesalePrice) * agent.commissionRate
   */
  async calculateCardCommission(params: {
    agentId: string;
    batchId: string;
    cardKeyId: string;
    wholesalePriceCents: number;
    retailPriceCents: number;
  }): Promise<number> {
    const [agent] = await db.select().from(agents).where(eq(agents.id, params.agentId)).limit(1);
    if (!agent || !agent.active) return 0;

    const profit = params.retailPriceCents - params.wholesalePriceCents;
    if (profit <= 0) return profit; // No commission on non-profit sales

    return Math.round(profit * agent.commissionRate) / 100; // Convert cents to yuan
  }

  /**
   * Monthly settlement: aggregate all pending commissions for a period.
   */
  async getPeriodSummary(period: string): Promise<{
    period: string;
    totalCommissions: number;
    agentCount: number;
    settled: number;
    pending: number;
  }> {
    const rows = await db.select().from(agentCommissions)
      .where(eq(agentCommissions.settlementPeriod, period));

    const totalCommissions = rows.reduce((sum, r) => sum + r.amount, 0);
    const uniqueAgents = new Set(rows.map((r) => r.agentId));
    const settled = rows.filter((r) => r.status === 'settled').reduce((s, r) => s + r.amount, 0);
    const pending = rows.filter((r) => r.status === 'pending').reduce((s, r) => s + r.amount, 0);

    return {
      period,
      totalCommissions: Math.round(totalCommissions * 100) / 100,
      agentCount: uniqueAgents.size,
      settled: Math.round(settled * 100) / 100,
      pending: Math.round(pending * 100) / 100,
    };
  }

  /**
   * Get commission breakdown by agent for a period.
   */
  async getAgentPeriodSummary(period: string): Promise<Array<{
    agentId: string;
    agentName: string;
    totalCommission: number;
    saleCount: number;
    settled: boolean;
  }>> {
    const rows = await db.select().from(agentCommissions)
      .where(eq(agentCommissions.settlementPeriod, period));

    const byAgent = new Map<string, { total: number; count: number; settled: boolean }>();
    for (const r of rows) {
      const entry = byAgent.get(r.agentId) || { total: 0, count: 0, settled: true };
      entry.total += r.amount;
      entry.count += 1;
      entry.settled = entry.settled && r.status === 'settled';
      byAgent.set(r.agentId, entry);
    }

    const result = [];
    for (const [agentId, data] of byAgent) {
      const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
      result.push({
        agentId,
        agentName: agent?.name || 'Unknown',
        totalCommission: Math.round(data.total * 100) / 100,
        saleCount: data.count,
        settled: data.settled,
      });
    }

    return result.sort((a, b) => b.totalCommission - a.totalCommission);
  }
}

export const commissionCalculator = new CommissionCalculator();
