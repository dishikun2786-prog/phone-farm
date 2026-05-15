import { db } from '../db.js';
import { agents, agentCommissions } from './agent-schema.js';
import { eq, desc, and, count, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export interface AgentRecord {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  contactPhone?: string;
  contactEmail?: string;
  commissionRate: number;
  totalSold: number;
  totalCommission: number;
  active: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class AgentService {
  async create(params: {
    tenantId: string;
    userId: string;
    name: string;
    contactPhone?: string;
    contactEmail?: string;
    commissionRate?: number;
  }): Promise<AgentRecord> {
    const id = randomUUID();
    const [agent] = await db.insert(agents).values({
      id,
      tenantId: params.tenantId,
      userId: params.userId,
      name: params.name,
      contactPhone: params.contactPhone,
      contactEmail: params.contactEmail,
      commissionRate: params.commissionRate ?? 0.3,
    }).returning();
    return agent as AgentRecord;
  }

  async getById(id: string): Promise<AgentRecord | null> {
    const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
    return (row as AgentRecord) || null;
  }

  async getByUserId(userId: string): Promise<AgentRecord | null> {
    const [row] = await db.select().from(agents).where(eq(agents.userId, userId)).limit(1);
    return (row as AgentRecord) || null;
  }

  async list(params: {
    tenantId?: string;
    active?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ agents: AgentRecord[]; total: number }> {
    let query = db.select().from(agents).$dynamic();

    if (params.tenantId) {
      query = query.where(eq(agents.tenantId, params.tenantId));
    }
    if (params.active !== undefined) {
      query = query.where(eq(agents.active, params.active));
    }

    const [countRow] = await db.select({ cnt: count() }).from(agents);

    const rows = await query
      .orderBy(desc(agents.createdAt))
      .limit(params.limit ?? 50)
      .offset(params.offset ?? 0);

    return { agents: rows as AgentRecord[], total: countRow?.cnt ?? 0 };
  }

  async update(id: string, data: Partial<AgentRecord>): Promise<AgentRecord | null> {
    const [row] = await db.update(agents).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(agents.id, id)).returning();
    return (row as AgentRecord) || null;
  }

  async recordSale(agentId: string, cardKeyId: string, batchId: string, amount: number) {
    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    if (!agent) return;

    const commission = amount * agent.commissionRate;

    await db.insert(agentCommissions).values({
      id: randomUUID(),
      tenantId: agent.tenantId,
      agentId,
      batchId,
      cardKeyId,
      amount: commission,
      status: 'pending',
      settlementPeriod: new Date().toISOString().slice(0, 7),
    });

    await db.update(agents).set({
      totalSold: agent.totalSold + 1,
      totalCommission: agent.totalCommission + commission,
      updatedAt: new Date(),
    }).where(eq(agents.id, agentId));
  }

  async getDashboard(agentId: string): Promise<{
    totalSold: number;
    totalCommission: number;
    activeCustomers: number;
    recentCommissions: any[];
  }> {
    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    if (!agent) return { totalSold: 0, totalCommission: 0, activeCustomers: 0, recentCommissions: [] };

    const commissions = await db.select().from(agentCommissions)
      .where(eq(agentCommissions.agentId, agentId))
      .orderBy(desc(agentCommissions.createdAt))
      .limit(20);

    return {
      totalSold: agent.totalSold,
      totalCommission: agent.totalCommission,
      activeCustomers: agent.totalSold,
      recentCommissions: commissions,
    };
  }

  async getCommissions(params: {
    agentId: string;
    period?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ commissions: any[]; total: number }> {
    let query = db.select().from(agentCommissions).$dynamic()
      .where(eq(agentCommissions.agentId, params.agentId));

    if (params.period) {
      query = query.where(eq(agentCommissions.settlementPeriod, params.period));
    }
    if (params.status) {
      query = query.where(eq(agentCommissions.status, params.status));
    }

    const rows = await query
      .orderBy(desc(agentCommissions.createdAt))
      .limit(params.limit ?? 50)
      .offset(params.offset ?? 0);

    const total = rows.length;
    return { commissions: rows, total };
  }

  async settleCommissions(period: string): Promise<{ settled: number }> {
    const result = await db.update(agentCommissions).set({
      status: 'settled',
      settledAt: new Date(),
    }).where(and(
      eq(agentCommissions.settlementPeriod, period),
      eq(agentCommissions.status, 'pending'),
    ));

    return { settled: result.rowCount ?? 0 };
  }
}

export const agentService = new AgentService();
