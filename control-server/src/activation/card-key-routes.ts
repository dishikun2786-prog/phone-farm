import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '../auth/auth-middleware.js';
import { db } from '../db.js';
import { cardKeys, deviceBindings } from '../schema.js';
import { eq, desc, and, count } from 'drizzle-orm';

export async function cardKeyRoutes(app: FastifyInstance) {
  // List card keys for current user (by tenant or user)
  app.get('/api/v2/card-keys', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const tenantId = req.tenantId;
    const query = req.query as Record<string, string>;

    let rows;
    if (tenantId) {
      rows = await db.select().from(cardKeys)
        .where(eq(cardKeys.tenantId, tenantId))
        .orderBy(desc(cardKeys.createdAt))
        .limit(Number(query.limit) || 100);
    } else {
      // Fallback: show keys created by this user
      rows = await db.select().from(cardKeys)
        .where(eq(cardKeys.createdBy, user.userId))
        .orderBy(desc(cardKeys.createdAt))
        .limit(Number(query.limit) || 100);
    }

    return reply.send({ cardKeys: rows, total: rows.length });
  });
}
