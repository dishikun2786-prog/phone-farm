import { eq, like, and, sql, or, count, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { users } from "../schema.js";
import { requireAuth, requirePermission } from "./auth-middleware.js";
import type { AuthService, AuthUser } from "./auth-middleware.js";

const userQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().optional(),
  role: z.enum(["super_admin", "admin", "tenant_admin", "operator", "viewer"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

const updateUserSchema = z.object({
  username: z.string().min(2).max(32).optional(),
  role: z.enum(["super_admin", "admin", "tenant_admin", "operator", "viewer"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

const createUserSchema = z.object({
  username: z.string().min(2).max(32),
  password: z.string().min(6).max(128),
  phone: z.string().min(11).max(20).optional(),
  role: z.enum(["super_admin", "admin", "tenant_admin", "operator", "viewer"]).default("operator"),
  tenantId: z.string().uuid().optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6).max(128),
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
    tenantId: user.tenantId,
    phoneVerified: user.phoneVerified,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    updatedAt: user.updatedAt,
  };
}

/** Add tenant-scoped filter if the requesting user is a tenant_admin */
function tenantFilter(req: any) {
  const authUser = req.user as AuthUser;
  if (authUser?.role === 'tenant_admin' && authUser?.tenantId) {
    return eq(users.tenantId, authUser.tenantId);
  }
  return undefined;
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
      const tf = tenantFilter(req);
      if (tf) conditions.push(tf);

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
    async (req) => {
      const tf = tenantFilter(req);
      const whereClause = tf || undefined;

      const [totalResult] = await db.select({ total: count() }).from(users).where(whereClause);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const todayCond = tf
        ? and(tf, sql`${users.createdAt} >= ${todayStart.toISOString()}`)
        : sql`${users.createdAt} >= ${todayStart.toISOString()}`;
      const weekCond = tf
        ? and(tf, sql`${users.createdAt} >= ${weekStart.toISOString()}`)
        : sql`${users.createdAt} >= ${weekStart.toISOString()}`;
      const activeCond = tf
        ? and(tf, eq(users.status, "active"))
        : eq(users.status, "active");

      const [todayResult] = await db
        .select({ total: count() })
        .from(users)
        .where(todayCond);

      const [weekResult] = await db
        .select({ total: count() })
        .from(users)
        .where(weekCond);

      const [activeResult] = await db
        .select({ total: count() })
        .from(users)
        .where(activeCond);

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

      // tenant_admin can only disable users in their own tenant
      const tf = tenantFilter(req);
      if (tf && user.tenantId !== authUser.tenantId) {
        return reply.status(403).send({ error: "无权操作其他租户的用户" });
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
      const authUser2 = req.user as AuthUser;

      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (!user) {
        return reply.status(404).send({ error: "用户不存在" });
      }

      // tenant_admin can only enable users in their own tenant
      const tf = tenantFilter(req);
      if (tf && user.tenantId !== authUser2.tenantId) {
        return reply.status(403).send({ error: "无权操作其他租户的用户" });
      }

      await db
        .update(users)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(users.id, id));

      return { ok: true };
    },
  );

  // ── POST /api/v1/admin/users ──
  app.post(
    "/api/v1/admin/users",
    { preHandler: [requireAuth(authService), requirePermission("users", "write")] },
    async (req, reply) => {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message });
      }
      const { username, password, phone, role, tenantId } = parsed.data;

      // Check username uniqueness
      const [conflict] = await db.select().from(users).where(eq(users.username, username));
      if (conflict) {
        return reply.status(409).send({ error: "用户名已被占用" });
      }

      // Check phone uniqueness if provided
      if (phone) {
        const [phoneConflict] = await db.select().from(users).where(eq(users.phone, phone));
        if (phoneConflict) {
          return reply.status(409).send({ error: "手机号已被注册" });
        }
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const [newUser] = await db.insert(users).values({
        username,
        passwordHash,
        phone: phone || null,
        role,
        tenantId: tenantId || null,
        status: "active",
        phoneVerified: !!phone,
      }).returning();

      return reply.status(201).send(sanitizeUser(newUser));
    },
  );

  // ── POST /api/v1/admin/users/:id/reset-password ──
  app.post(
    "/api/v1/admin/users/:id/reset-password",
    { preHandler: [requireAuth(authService), requirePermission("users", "write")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const authUser3 = req.user as AuthUser;

      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message });
      }

      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (!user) {
        return reply.status(404).send({ error: "用户不存在" });
      }

      // Cannot reset own password via admin route
      if (id === authUser3.userId) {
        return reply.status(400).send({ error: "不能通过管理端重置自己的密码，请使用个人设置" });
      }

      // tenant_admin scope check
      const tf = tenantFilter(req);
      if (tf && user.tenantId !== authUser3.tenantId) {
        return reply.status(403).send({ error: "无权操作其他租户的用户" });
      }

      const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, id));

      return { ok: true, message: "密码已重置" };
    },
  );

  // ── DELETE /api/v1/admin/users/:id ──
  app.delete(
    "/api/v1/admin/users/:id",
    { preHandler: [requireAuth(authService), requirePermission("users", "delete")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const authUser4 = req.user as AuthUser;

      if (id === authUser4.userId) {
        return reply.status(400).send({ error: "不能删除自己的账号" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (!user) {
        return reply.status(404).send({ error: "用户不存在" });
      }

      // tenant_admin scope check
      const tf = tenantFilter(req);
      if (tf && user.tenantId !== authUser4.tenantId) {
        return reply.status(403).send({ error: "无权操作其他租户的用户" });
      }

      // Soft-delete: set status to deleted
      await db
        .update(users)
        .set({ status: "deleted", updatedAt: new Date() })
        .where(eq(users.id, id));

      return { ok: true, message: "用户已删除" };
    },
  );
}
