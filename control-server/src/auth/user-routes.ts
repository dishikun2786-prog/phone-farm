import bcrypt from "bcryptjs";
import { eq, or, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { users } from "../schema.js";
import { requireAuth } from "./auth-middleware.js";
import type { AuthService } from "./auth-middleware.js";
import type { AuthUser } from "./auth-middleware.js";
import { smsService } from "./sms-service.js";

const sendSmsSchema = z.object({
  phone: z
    .string()
    .regex(/^1[3-9]\d{9}$/, "手机号格式不正确"),
  scene: z.enum(["register", "login", "reset_password", "bind"]),
});

const verifySmsSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/),
  code: z.string().length(6, "验证码为6位数字"),
  scene: z.enum(["register", "login", "reset_password", "bind"]),
});

const registerSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/),
  code: z.string().length(6),
  username: z.string().min(2).max(32).optional(),
  password: z.string().min(8).max(128).optional(),
  tenantId: z.string().uuid().optional(),
});

const loginPhoneSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/),
  code: z.string().length(6),
});

const resetPasswordSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/),
  code: z.string().length(6),
  newPassword: z.string().min(8).max(128),
});

const updateProfileSchema = z.object({
  username: z.string().min(2).max(32).optional(),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

const bindPhoneSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/),
  code: z.string().length(6),
});

function getClientIp(req: any): string {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "127.0.0.1"
  );
}

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
  };
}

function generateTokens(authService: AuthService, user: AuthUser) {
  const token = authService.signToken(user);
  const refreshToken = authService.signRefreshToken(user);
  return { token, refreshToken };
}

export async function userRoutes(app: FastifyInstance) {
  const authService: AuthService = (app as any).authService;

  // ── POST /api/v1/auth/send-sms ──
  app.post("/api/v1/auth/send-sms", async (req, reply) => {
    const parsed = sendSmsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.issues[0]?.message });
    }
    const { phone, scene } = parsed.data;
    const ip = getClientIp(req);
    const result = await smsService.sendVerificationCode(phone, scene, ip);
    if (!result.ok) {
      return reply.status(429).send({ error: result.error });
    }
    return { ok: true };
  });

  // ── POST /api/v1/auth/verify-sms ──
  app.post("/api/v1/auth/verify-sms", async (req, reply) => {
    const parsed = verifySmsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.issues[0]?.message });
    }
    const { phone, code, scene } = parsed.data;
    const result = await smsService.verifyCode(phone, code, scene);
    if (!result.valid) {
      return reply.status(400).send({ error: result.error });
    }
    return { valid: true };
  });

  // ── POST /api/v1/auth/register ──
  app.post("/api/v1/auth/register", async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.issues[0]?.message });
    }
    const { phone, code, username, password, tenantId } = parsed.data;

    // Verify SMS code
    const verifyResult = await smsService.verifyCode(phone, code, "register");
    if (!verifyResult.valid) {
      return reply.status(400).send({ error: verifyResult.error });
    }

    // Check phone not already registered
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.phone, phone));
    if (existing) {
      return reply.status(409).send({ error: "该手机号已注册" });
    }

    // Auto-generate username if not provided
    const finalUsername = username || `用户${phone.slice(-4)}`;

    // Check username uniqueness
    const [nameConflict] = await db
      .select()
      .from(users)
      .where(eq(users.username, finalUsername));
    if (nameConflict) {
      return reply.status(409).send({ error: "用户名已被占用，请更换" });
    }

    // Generate password if not provided (SMS-only login users)
    const finalPassword = password || crypto.randomUUID().slice(0, 16);
    const passwordHash = await bcrypt.hash(finalPassword, 10);

    const [newUser] = await db
      .insert(users)
      .values({
        username: finalUsername,
        passwordHash,
        phone,
        phoneVerified: true,
        role: "operator",
        status: "active",
        lastLoginAt: new Date(),
        ...(tenantId ? { tenantId } : {}),
      })
      .returning();

    const authUser: AuthUser = {
      userId: newUser.id,
      username: newUser.username,
      role: newUser.role as AuthUser["role"],
    };

    const tokens = generateTokens(authService, authUser);

    return {
      ...tokens,
      user: sanitizeUser(newUser),
    };
  });

  // ── POST /api/v1/auth/login-phone ──
  app.post("/api/v1/auth/login-phone", async (req, reply) => {
    const parsed = loginPhoneSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.issues[0]?.message });
    }
    const { phone, code } = parsed.data;

    // Verify SMS code
    const verifyResult = await smsService.verifyCode(phone, code, "login");
    if (!verifyResult.valid) {
      return reply.status(400).send({ error: verifyResult.error });
    }

    // Find user by phone
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.phone, phone), eq(users.phoneVerified, true)));
    if (!user) {
      return reply.status(401).send({ error: "该手机号未注册" });
    }

    if (user.status === "disabled") {
      return reply.status(403).send({ error: "账号已被禁用" });
    }

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    const authUser: AuthUser = {
      userId: user.id,
      username: user.username,
      role: user.role as AuthUser["role"],
    };

    const tokens = generateTokens(authService, authUser);

    return {
      ...tokens,
      user: sanitizeUser(user),
    };
  });

  // ── POST /api/v1/auth/reset-password ──
  app.post("/api/v1/auth/reset-password", async (req, reply) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.issues[0]?.message });
    }
    const { phone, code, newPassword } = parsed.data;

    const verifyResult = await smsService.verifyCode(
      phone,
      code,
      "reset_password",
    );
    if (!verifyResult.valid) {
      return reply.status(400).send({ error: verifyResult.error });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.phone, phone), eq(users.phoneVerified, true)));
    if (!user) {
      return reply.status(404).send({ error: "该手机号未注册" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    return { ok: true };
  });

  // ── GET /api/v1/users/me ──
  app.get(
    "/api/v1/users/me",
    { preHandler: [requireAuth(authService)] },
    async (req) => {
      const authUser = req.user as AuthUser;
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, authUser.userId));
      if (!user) {
        throw { statusCode: 404, message: "User not found" };
      }
      return sanitizeUser(user);
    },
  );

  // ── PUT /api/v1/users/me ──
  app.put(
    "/api/v1/users/me",
    { preHandler: [requireAuth(authService)] },
    async (req, reply) => {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: parsed.error.issues[0]?.message });
      }
      const authUser = req.user as AuthUser;

      if (parsed.data.username) {
        const [conflict] = await db
          .select()
          .from(users)
          .where(eq(users.username, parsed.data.username));
        if (conflict && conflict.id !== authUser.userId) {
          return reply.status(409).send({ error: "用户名已被占用" });
        }
      }

      const [updated] = await db
        .update(users)
        .set({
          ...parsed.data,
          updatedAt: new Date(),
        })
        .where(eq(users.id, authUser.userId))
        .returning();

      return sanitizeUser(updated);
    },
  );

  // ── PUT /api/v1/users/me/password ──
  app.put(
    "/api/v1/users/me/password",
    { preHandler: [requireAuth(authService)] },
    async (req, reply) => {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: parsed.error.issues[0]?.message });
      }
      const authUser = req.user as AuthUser;
      const { oldPassword, newPassword } = parsed.data;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, authUser.userId));
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      const valid = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!valid) {
        return reply.status(400).send({ error: "旧密码不正确" });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, authUser.userId));

      return { ok: true };
    },
  );

  // ── POST /api/v1/users/me/bind-phone ──
  app.post(
    "/api/v1/users/me/bind-phone",
    { preHandler: [requireAuth(authService)] },
    async (req, reply) => {
      const parsed = bindPhoneSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: parsed.error.issues[0]?.message });
      }
      const authUser = req.user as AuthUser;
      const { phone, code } = parsed.data;

      const verifyResult = await smsService.verifyCode(phone, code, "bind");
      if (!verifyResult.valid) {
        return reply.status(400).send({ error: verifyResult.error });
      }

      const [phoneUser] = await db
        .select()
        .from(users)
        .where(eq(users.phone, phone));
      if (phoneUser && phoneUser.id !== authUser.userId) {
        return reply.status(409).send({ error: "该手机号已被其他账号绑定" });
      }

      await db
        .update(users)
        .set({ phone, phoneVerified: true, updatedAt: new Date() })
        .where(eq(users.id, authUser.userId));

      return { ok: true, phone };
    },
  );
}
