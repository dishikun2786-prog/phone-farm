import { eq, like, and, sql, or, count } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { users } from "../schema.js";
import { requireAuth, requirePermission } from "./auth-middleware.js";
import type { AuthService, AuthUser } from "./auth-middleware.js";

const userQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().optional(),
  role: z.enum(["super_admin", "admin", "operator", "viewer"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

const updateUserSchema = z.object({
  username: z.string().min(2).max(32).optional(),
  role: z.enum(["super_admin", "admin", "operator", "viewer"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

function sanitizeUser(user: any) {
  return {
    id: user.id,
    username: user.username,
    phone: user.phone
      ? user.phone.slice(0, 3) + "****" + user.phone.slice(-4)
      : null,
    role: user.role,
    status: user.status,
    phoneVerified: user.phoneVerified,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    updatedAt: user.updatedAt,
  };
}

export async function adminUserRoutes(app: FastifyInstance, authService: AuthService) {
  // ── GET /api/v1/admin/users ──
  app.get(
    "/api/v1/admin/users",
    { preHandler: [requireAuth(authService), requirePermission("users", "read")] },
    async (req, reply) => {
      const parsed = userQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message });
      }
      const { page, pageSize, keyword, role, status } = parsed.data;

      const conditions: any[] = [];
      if (keyword) {
        conditions.push(
          or(
            like(users.phone, `%${keyword}%`),
            like(users.username, `%${keyword}%`),
          ),
        );
      }
      if (role) conditions.push(eq(users.role, role));
      if (status) conditions.push(eq(users.status, status));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalResult] = await db
        .select({ total: count() })
        .from(users)
        .where(where);
      const total = totalResult?.total ?? 0;

      const rows = await db
        .select()
        .from(users)
        .where(where)
        .orderBy(sql`${users.createdAt} DESC`)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        users: rows.map(sanitizeUser),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    },
  );

  // ── GET /api/v1/admin/users/stats ──
  app.get(
    "/api/v1/admin/users/stats",
    { preHandler: [requireAuth(authService), requirePermission("users", "read")] },
    async () => {
      const [totalResult] = await db.select({ total: count() }).from(users);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const [todayResult] = await db
        .select({ total: count() })
        .from(users)
        .where(sql`${users.createdAt} >= ${todayStart.toISOString()}`);

      const [weekResult] = await db
        .select({ total: count() })
        .from(users)
        .where(sql`${users.createdAt} >= ${weekStart.toISOString()}`);

      const [activeResult] = await db
        .select({ total: count() })
        .from(users)
        .where(eq(users.status, "active"));

      return {
        totalUsers: totalResult?.total ?? 0,
        todayNew: todayResult?.total ?? 0,
        weekNew: weekResult?.total ?? 0,
        activeUsers: activeResult?.total ?? 0,
      };
    },
  );

  // ── GET /api/v1/admin/users/:id ──
  app.get(
    "/api/v1/admin/users/:id",
    { preHandler: [requireAuth(authService), requirePermission("users", "read")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (!user) {
        return reply.status(404).send({ error: "用户不存在" });
      }
      return sanitizeUser(user);
    },
  );

  // ── PUT /api/v1/admin/users/:id ──
  app.put(
    "/api/v1/admin/users/:id",
    { preHandler: [requireAuth(authService), requirePermission("users", "write")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const authUser = req.user as AuthUser;

      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message });
      }

      const [target] = await db.select().from(users).where(eq(users.id, id));
      if (!target) {
        return reply.status(404).send({ error: "用户不存在" });
      }

      // Prevent self-demotion
      if (id === authUser.userId && parsed.data.role && parsed.data.role !== authUser.role) {
        return reply.status(400).send({ error: "不能修改自己的角色" });
      }

      if (parsed.data.username && parsed.data.username !== target.username) {
        const [conflict] = await db
          .select()
          .from(users)
          .where(eq(users.username, parsed.data.username));
        if (conflict && conflict.id !== id) {
          return reply.status(409).send({ error: "用户名已被占用" });
        }
      }

      const [updated] = await db
        .update(users)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      return sanitizeUser(updated);
    },
  );

  // ── POST /api/v1/admin/users/:id/disable ──
  app.post(
    "/api/v1/admin/users/:id/disable",
    { preHandler: [requireAuth(authService), requirePermission("users", "write")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const authUser = req.user as AuthUser;

      if (id === authUser.userId) {
        return reply.status(400).send({ error: "不能禁用自己的账号" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (!user) {
        return reply.status(404).send({ error: "用户不存在" });
      }

      await db
        .update(users)
        .set({ status: "disabled", updatedAt: new Date() })
        .where(eq(users.id, id));

      return { ok: true };
    },
  );

  // ── POST /api/v1/admin/users/:id/enable ──
  app.post(
    "/api/v1/admin/users/:id/enable",
    { preHandler: [requireAuth(authService), requirePermission("users", "write")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (!user) {
        return reply.status(404).send({ error: "用户不存在" });
      }

      await db
        .update(users)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(users.id, id));

      return { ok: true };
    },
  );
}
