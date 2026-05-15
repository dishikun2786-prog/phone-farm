import { db } from '../db.js';
import { auditLogs } from './audit-schema.js';
import { desc, eq, and, gte, lte, sql } from 'drizzle-orm';

export interface AuditLogEntry {
  action: string;
  resourceType?: string;
  resourceId?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  username?: string;
  tenantId?: string;
  ip?: string;
}

export class AuditService {
  async log(entry: AuditLogEntry) {
    await db.insert(auditLogs).values({
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      detail: entry.detail,
      metadata: entry.metadata || {},
      userId: entry.userId,
      username: entry.username,
      tenantId: entry.tenantId,
      ip: entry.ip,
    });
  }

  async query(params: {
    action?: string;
    userId?: string;
    tenantId?: string;
    from?: number;
    to?: number;
    limit?: number;
    offset?: number;
  }) {
    const conditions = [];
    if (params.action && params.action !== 'all') conditions.push(eq(auditLogs.action, params.action));
    if (params.userId) conditions.push(eq(auditLogs.userId, params.userId));
    if (params.tenantId) conditions.push(eq(auditLogs.tenantId, params.tenantId));
    if (params.from) conditions.push(gte(auditLogs.createdAt, new Date(params.from)));
    if (params.to) conditions.push(lte(auditLogs.createdAt, new Date(params.to)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(params.limit || 50)
        .offset(params.offset || 0),
      db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(where),
    ]);

    return { logs: rows, total: Number(countResult[0]?.count || 0) };
  }
}

export const auditService = new AuditService();
