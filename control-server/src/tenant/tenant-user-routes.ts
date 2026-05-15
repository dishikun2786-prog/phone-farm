/**
 * Tenant-User association routes — assign/remove users to/from tenants.
 * super_admin for global management; tenant_admin for own-tenant only.
 */
import { eq, and, count, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { users } from '../schema.js';
import { requirePermission } from '../auth/auth-middleware.js';

const assignUserSchema = z.object({
  userId: z.string().uuid(),
});

function sanitizeTenantUser(user: any) {
  return {
    id: user.id,
    username: user.username,
    phone: user.phone
      ? user.phone.slice(0, 3) + '****' + user.phone.slice(-4)
      : null,
    role: user.role,
    status: user.status,
    phoneVerified: user.phoneVerified,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export async function tenantUserRoutes(app: FastifyInstance) {
  const requireWrite = requirePermission('users', 'write');
  const requireRead = requirePermission('users', 'read');

  // ── GET /api/v2/tenants/:id/users — list users in a tenant ──
  app.get('/api/v2/tenants/:id/users',
    { preHandler: requireRead },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const authUser = req.user as any;
      const query = req.query as Record<string, string>;
      const page = parseInt(query.page, 10) || 1;
      const pageSize = Math.min(parseInt(query.pageSize, 10) || 20, 100);

      // tenant_admin can only see users in their own tenant
      if (authUser?.role === 'tenant_admin' && authUser?.tenantId !== id) {
        return reply.status(403).send({ error: 'Access limited to your own tenant' });
      }

      const conditions = [eq(users.tenantId, id)];

      const [totalResult] = await db
        .select({ total: count() })
        .from(users)
        .where(and(...conditions));
      const total = totalResult?.total ?? 0;

      const rows = await db
        .select()
        .from(users)
        .where(and(...conditions))
        .orderBy(sql`${users.createdAt} DESC`)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        users: rows.map(sanitizeTenantUser),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    },
  );

  // ── POST /api/v2/tenants/:id/users — assign user to tenant ──
  app.post('/api/v2/tenants/:id/users',
    { preHandler: requireWrite },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const authUser = req.user as any;

      // tenant_admin can only assign to their own tenant
      if (authUser?.role === 'tenant_admin' && authUser?.tenantId !== id) {
        return reply.status(403).send({ error: 'Access limited to your own tenant' });
      }

      const parsed = assignUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
      }

      const { userId } = parsed.data;

      // Check user exists
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Update tenant assignment
      const [updated] = await db
        .update(users)
        .set({ tenantId: id as any, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();

      return { ok: true, user: sanitizeTenantUser(updated) };
    },
  );

  // ── DELETE /api/v2/tenants/:id/users/:uid — remove user from tenant ──
  app.delete('/api/v2/tenants/:id/users/:uid',
    { preHandler: requireWrite },
    async (req, reply) => {
      const { id, uid } = req.params as { id: string; uid: string };
      const authUser = req.user as any;

      if (authUser?.role === 'tenant_admin' && authUser?.tenantId !== id) {
        return reply.status(403).send({ error: 'Access limited to your own tenant' });
      }

      // Verify user belongs to this tenant
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, uid), eq(users.tenantId, id)));
      if (!user) {
        return reply.status(404).send({ error: 'User not found in this tenant' });
      }

      // Clear tenant assignment (don't delete the user)
      await db
        .update(users)
        .set({ tenantId: null as any, updatedAt: new Date() })
        .where(eq(users.id, uid));

      return { ok: true };
    },
  );
}
