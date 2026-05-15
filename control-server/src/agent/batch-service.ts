import { db } from '../db.js';
import { cardBatches, agentCommissions } from './agent-schema.js';
import { cardKeys } from '../schema.js';
import { eq, desc, and, count } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import crypto from 'crypto';

export interface BatchRecord {
  id: string;
  tenantId: string;
  agentId?: string;
  name: string;
  planId?: string;
  count: number;
  days: number;
  maxDevices: number;
  wholesalePriceCents: number;
  retailPriceCents: number;
  createdBy: string;
  note?: string;
  createdAt: Date;
}

export class BatchService {
  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const segments = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('')
    );
    return segments.join('-');
  }

  async generateBatch(params: {
    tenantId: string;
    agentId?: string;
    name: string;
    planId?: string;
    count: number;
    days: number;
    maxDevices: number;
    wholesalePriceCents: number;
    retailPriceCents: number;
    createdBy: string;
    note?: string;
  }): Promise<{ batch: BatchRecord; codes: string[] }> {
    const batchId = randomUUID();
    const now = new Date();

    // Create batch record
    const [batch] = await db.insert(cardBatches).values({
      id: batchId,
      tenantId: params.tenantId,
      agentId: params.agentId,
      name: params.name,
      planId: params.planId,
      count: params.count,
      days: params.days,
      maxDevices: params.maxDevices,
      wholesalePriceCents: params.wholesalePriceCents,
      retailPriceCents: params.retailPriceCents,
      createdBy: params.createdBy,
      note: params.note,
      createdAt: now,
    }).returning();

    // Generate card keys
    const codes: string[] = [];
    const rows = Array.from({ length: params.count }, () => {
      const code = this.generateCode();
      codes.push(code);
      return {
        batchId,
        code,
        days: params.days,
        maxDevices: params.maxDevices,
        usedDevices: 0,
        status: 'active' as const,
        createdBy: `${params.createdBy} (batch: ${params.name})`,
        note: params.note || null,
        expiresAt: params.days > 0
          ? new Date(now.getTime() + params.days * 24 * 3600 * 1000 + 365 * 24 * 3600 * 1000)
          : undefined,
      };
    });

    // Batch insert card keys in chunks of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await db.insert(cardKeys).values(rows.slice(i, i + BATCH_SIZE));
    }

    return { batch: batch as BatchRecord, codes };
  }

  async getBatch(id: string): Promise<BatchRecord | null> {
    const [row] = await db.select().from(cardBatches).where(eq(cardBatches.id, id)).limit(1);
    return (row as BatchRecord) || null;
  }

  async listBatches(params: {
    tenantId?: string;
    agentId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ batches: BatchRecord[]; total: number }> {
    let query = db.select().from(cardBatches).$dynamic();

    if (params.tenantId) {
      query = query.where(eq(cardBatches.tenantId, params.tenantId));
    }
    if (params.agentId) {
      query = query.where(eq(cardBatches.agentId, params.agentId));
    }

    const [countRow] = await db.select({ cnt: count() }).from(cardBatches);

    const rows = await query
      .orderBy(desc(cardBatches.createdAt))
      .limit(params.limit ?? 50)
      .offset(params.offset ?? 0);

    return { batches: rows as BatchRecord[], total: countRow?.cnt ?? 0 };
  }
}

export const batchService = new BatchService();
