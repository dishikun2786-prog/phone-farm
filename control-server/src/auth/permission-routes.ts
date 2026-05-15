/**
 * Permission configuration API — view/update/reset role-permission mappings.
 * Only super_admin can access these routes.
 */
import { eq, and, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { rolePermissions } from '../schema.js';
import { requireAuth } from './auth-middleware.js';
import {
  PERMISSIONS,
  type Role,
  type Resource,
  type Action,
  ROLES,
  RESOURCES,
  ACTIONS,
} from './rbac.js';

const updatePermissionSchema = z.object({
  role: z.string(),
  resource: z.string(),
  actions: z.array(z.string()),
});

export async function permissionRoutes(app: FastifyInstance, authService: any) {
  // All routes require super_admin
  const requireSuperAdmin = async (req: any, reply: any) => {
    if (req.user?.role !== 'super_admin') {
      return reply.status(403).send({ error: '仅超级管理员可配置权限' });
    }
  };

  // ── GET /api/v1/admin/permissions — full permission matrix (DB merged with defaults) ──
  app.get(
    '/api/v1/admin/permissions',
    { preHandler: [requireAuth(authService), requireSuperAdmin] },
    async () => {
      // Load DB overrides (global: tenantId = null)
      const overrides = await db
        .select()
        .from(rolePermissions)
        .where(isNull(rolePermissions.tenantId));

      const overrideMap: Record<string, Record<string, string[]>> = {};
      for (const row of overrides) {
        if (!overrideMap[row.role]) overrideMap[row.role] = {};
        overrideMap[row.role][row.resource] = row.actions;
      }

      // Merge: DB overrides take precedence over hardcoded defaults
      const matrix: Record<string, Record<string, string[]>> = {};
      for (const role of ROLES) {
        matrix[role] = {};
        const defaultPerms = PERMISSIONS[role as Role] || {};
        for (const resource of RESOURCES) {
          matrix[role][resource] =
            overrideMap[role]?.[resource] ??
            (defaultPerms[resource as Resource] || []);
        }
      }

      return {
        roles: ROLES,
        resources: RESOURCES,
        actions: ACTIONS,
        matrix,
      };
    },
  );

  // ── PUT /api/v1/admin/permissions — update a role-resource permission ──
  app.put(
    '/api/v1/admin/permissions',
    { preHandler: [requireAuth(authService), requireSuperAdmin] },
    async (req, reply) => {
      const parsed = updatePermissionSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: '参数校验失败', details: parsed.error.issues });
      }

      const { role, resource, actions } = parsed.data;

      if (!ROLES.includes(role)) {
        return reply.status(400).send({ error: `未知角色: ${role}` });
      }
      if (!RESOURCES.includes(resource)) {
        return reply.status(400).send({ error: `未知资源: ${resource}` });
      }
      const invalid = actions.filter((a) => !ACTIONS.includes(a));
      if (invalid.length > 0) {
        return reply.status(400).send({ error: `未知操作: ${invalid.join(', ')}` });
      }

      // Upsert: tenantId = null means global override
      const existing = await db
        .select()
        .from(rolePermissions)
        .where(
          and(
            isNull(rolePermissions.tenantId),
            eq(rolePermissions.role, role),
            eq(rolePermissions.resource, resource),
          ),
        );

      if (existing.length > 0) {
        await db
          .update(rolePermissions)
          .set({ actions, updatedAt: new Date() })
          .where(eq(rolePermissions.id, existing[0].id));
      } else {
        await db.insert(rolePermissions).values({
          tenantId: null as any,
          role,
          resource,
          actions,
        });
      }

      return { ok: true };
    },
  );

  // ── POST /api/v1/admin/permissions/reset — delete all global overrides ──
  app.post(
    '/api/v1/admin/permissions/reset',
    { preHandler: [requireAuth(authService), requireSuperAdmin] },
    async () => {
      await db
        .delete(rolePermissions)
        .where(isNull(rolePermissions.tenantId));

      return { ok: true };
    },
  );
}
