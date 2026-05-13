/**
 * PhoneFarm Account Deletion Routes — 用户数据删除（GDPR/合规）
 */
import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { users } from "../schema.js";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

interface DeletionRequest {
  userId: string;
  username: string;
  requestedAt: number;
  scheduledDeletionAt: number;
  cancelled: boolean;
}

class AccountDeletionStore {
  private requests: Map<string, DeletionRequest> = new Map();
  private fastify: FastifyInstance;
  private gracePeriodMs = 30 * 24 * 3600 * 1000; // 30 days

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /** Request account deletion after verifying credentials */
  async requestDeletion(username: string, password: string): Promise<{
    success: boolean;
    error?: string;
    scheduledDeletionDate?: number;
  }> {
    // Look up user in DB
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return { success: false, error: "Invalid password" };
    }

    // Check if already requested
    for (const req of this.requests.values()) {
      if (req.userId === user.id && !req.cancelled) {
        return { success: true, scheduledDeletionDate: req.scheduledDeletionAt };
      }
    }

    const now = Date.now();
    const request: DeletionRequest = {
      userId: user.id,
      username,
      requestedAt: now,
      scheduledDeletionAt: now + this.gracePeriodMs,
      cancelled: false,
    };
    this.requests.set(user.id, request);

    this.fastify.log.warn(`[Account] Deletion requested for ${username} — scheduled at ${new Date(request.scheduledDeletionAt).toISOString()}`);
    return { success: true, scheduledDeletionDate: request.scheduledDeletionAt };
  }

  /** Cancel a pending deletion request */
  async cancelDeletion(username: string): Promise<{ success: boolean; error?: string }> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user) return { success: false, error: "User not found" };

    const existing = this.requests.get(user.id);
    if (!existing || existing.cancelled) {
      return { success: false, error: "No pending deletion request found" };
    }

    existing.cancelled = true;
    this.fastify.log.info(`[Account] Deletion cancelled for ${username}`);
    return { success: true };
  }

  /** List pending deletions (admin) */
  listPending(): DeletionRequest[] {
    return Array.from(this.requests.values())
      .filter((r) => !r.cancelled)
      .sort((a, b) => a.requestedAt - b.requestedAt);
  }

  /** Force delete a user account immediately */
  async forceDelete(userId: string): Promise<{ success: boolean; error?: string }> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return { success: false, error: "User not found" };

    // Delete user from DB
    await db.delete(users).where(eq(users.id, userId));
    this.requests.delete(userId);

    this.fastify.log.warn(`[Account] Force deleted user ${user.username} (${userId})`);
    return { success: true };
  }
}

import type { AuthService } from '../auth/auth-middleware.js';
import { requireAuth } from '../auth/auth-middleware.js';

export async function accountDeleteRoutes(app: FastifyInstance, authService?: AuthService): Promise<void> {
  const auth = authService ? requireAuth(authService) : undefined;
  const store = new AccountDeletionStore(app);

  // 请求删除账号数据
  app.post("/api/v1/account/delete", async (req, reply) => {
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password) {
      return reply.status(400).send({ error: "username and password required" });
    }

    const result = await store.requestDeletion(username, password);
    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    return reply.send({
      ok: true,
      message: "账号删除请求已提交，您的数据将在 30 天后永久清除",
      scheduledDeletionDate: result.scheduledDeletionDate,
    });
  });

  // 取消删除请求
  app.post("/api/v1/account/delete-cancel", { preHandler: auth ? [auth] : [] }, async (req, reply) => {
    const { username } = req.body as { username: string };
    if (!username) {
      return reply.status(400).send({ error: "username required" });
    }

    const result = await store.cancelDeletion(username);
    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    return reply.send({ ok: true, message: "删除请求已取消" });
  });

  // 管理员查看待删除账号列表
  app.get("/api/v1/account/pending-deletions", { preHandler: auth ? [auth] : [] }, async (_req, reply) => {
    const pending = store.listPending();
    return reply.send({ pendingDeletions: pending });
  });

  // 管理员立即执行删除
  app.post("/api/v1/account/force-delete/:userId", { preHandler: auth ? [auth] : [] }, async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const result = await store.forceDelete(userId);
    if (!result.success) {
      return reply.status(404).send({ error: result.error });
    }
    return reply.send({ ok: true });
  });
}
