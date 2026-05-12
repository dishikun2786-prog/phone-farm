/**
 * PhoneFarm Platform Account Routes — 平台账号管理 API
 */
import type { FastifyInstance } from "fastify";
import crypto from "crypto";

interface PlatformAccount {
  id: string;
  platform: string;
  username: string;
  passwordEncrypted: string;
  deviceId: string | null;
  status: "active" | "logged_out" | "banned" | "expired";
  lastLoginAt: number | null;
  createdAt: number;
  updatedAt: number;
}

class PlatformAccountStore {
  private accounts: Map<string, PlatformAccount> = new Map();
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /** Encrypt password with AES-256-CBC using a server key */
  private encryptPassword(password: string): string {
    const key = crypto.scryptSync(
      process.env.ACCOUNT_ENCRYPTION_KEY || "phonefarm-dev-key-change-me",
      "phonefarm-salt",
      32,
    );
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    const encrypted = Buffer.concat([cipher.update(password, "utf-8"), cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
  }

  /** List accounts with optional filters */
  list(params: {
    platform?: string;
    status?: string;
    limit: number;
    offset: number;
  }): { accounts: PlatformAccount[]; total: number } {
    let results = Array.from(this.accounts.values());
    if (params.platform) results = results.filter((a) => a.platform === params.platform);
    if (params.status) results = results.filter((a) => a.status === params.status);
    results.sort((a, b) => b.createdAt - a.createdAt);
    const total = results.length;
    const paged = results.slice(params.offset, params.offset + params.limit);
    return { accounts: paged, total };
  }

  /** Get a single account */
  get(id: string): PlatformAccount | undefined {
    return this.accounts.get(id);
  }

  /** Create an account */
  create(params: {
    platform: string;
    username: string;
    password: string;
    deviceId?: string;
  }): PlatformAccount {
    const account: PlatformAccount = {
      id: crypto.randomUUID(),
      platform: params.platform,
      username: params.username,
      passwordEncrypted: this.encryptPassword(params.password),
      deviceId: params.deviceId ?? null,
      status: "active",
      lastLoginAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.accounts.set(account.id, account);
    this.fastify.log.info(`[PlatformAccount] Created ${account.platform} account: ${account.username}`);
    return account;
  }

  /** Update an account */
  update(id: string, updates: Partial<{
    platform: string;
    username: string;
    password: string;
    deviceId: string | null;
    status: "active" | "logged_out" | "banned" | "expired";
    lastLoginAt: number;
  }>): PlatformAccount | null {
    const account = this.accounts.get(id);
    if (!account) return null;
    if (updates.platform !== undefined) account.platform = updates.platform;
    if (updates.username !== undefined) account.username = updates.username;
    if (updates.password !== undefined) account.passwordEncrypted = this.encryptPassword(updates.password);
    if (updates.deviceId !== undefined) account.deviceId = updates.deviceId;
    if (updates.status !== undefined) account.status = updates.status;
    if (updates.lastLoginAt !== undefined) account.lastLoginAt = updates.lastLoginAt;
    account.updatedAt = Date.now();
    return account;
  }

  /** Delete an account */
  delete(id: string): boolean {
    return this.accounts.delete(id);
  }

  /** Bulk import accounts from array */
  bulkImport(platform: string, accounts: Array<{ username: string; password: string }>): number {
    let imported = 0;
    for (const a of accounts) {
      const account: PlatformAccount = {
        id: crypto.randomUUID(),
        platform,
        username: a.username,
        passwordEncrypted: this.encryptPassword(a.password),
        deviceId: null,
        status: "active",
        lastLoginAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.accounts.set(account.id, account);
      imported++;
    }
    this.fastify.log.info(`[PlatformAccount] Imported ${imported} ${platform} accounts`);
    return imported;
  }

  /** Get stats by platform */
  getStats(): Record<string, { total: number; online: number; banned: number }> {
    const stats: Record<string, { total: number; online: number; banned: number }> = {};
    for (const a of this.accounts.values()) {
      if (!stats[a.platform]) stats[a.platform] = { total: 0, online: 0, banned: 0 };
      stats[a.platform]!.total++;
      if (a.status === "active" || a.status === "logged_out") stats[a.platform]!.online++;
      if (a.status === "banned") stats[a.platform]!.banned++;
    }
    return stats;
  }
}

export async function platformAccountRoutes(app: FastifyInstance): Promise<void> {
  const store = new PlatformAccountStore(app);

  // 获取账号列表
  app.get("/api/v1/platform-accounts", async (req, reply) => {
    const { platform, status, limit, offset } = req.query as Record<string, string>;
    const result = store.list({
      platform,
      status,
      limit: Math.min(Number(limit) || 50, 200),
      offset: Number(offset) || 0,
    });
    return reply.send(result);
  });

  // 获取单个账号
  app.get("/api/v1/platform-accounts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const account = store.get(id);
    if (!account) return reply.status(404).send({ error: "Account not found" });
    return reply.send(account);
  });

  // 创建账号
  app.post("/api/v1/platform-accounts", async (req, reply) => {
    const { platform, username, password, deviceId } = req.body as {
      platform: string; username: string; password: string; deviceId?: string;
    };
    if (!platform || !username || !password) {
      return reply.status(400).send({ error: "platform, username, and password are required" });
    }
    const account = store.create({ platform, username, password, deviceId });
    return reply.status(201).send(account);
  });

  // 更新账号
  app.patch("/api/v1/platform-accounts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const updates = req.body as Partial<{
      platform: string; username: string; password: string;
      deviceId: string | null; status: "active" | "logged_out" | "banned" | "expired";
      lastLoginAt: number;
    }>;
    const updated = store.update(id, updates);
    if (!updated) return reply.status(404).send({ error: "Account not found" });
    return reply.send(updated);
  });

  // 删除账号
  app.delete("/api/v1/platform-accounts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = store.delete(id);
    if (!deleted) return reply.status(404).send({ error: "Account not found" });
    return reply.send({ ok: true });
  });

  // 批量导入账号（CSV/JSON）
  app.post("/api/v1/platform-accounts/import", async (req, reply) => {
    const { platform, accounts } = req.body as {
      platform: string;
      accounts: Array<{ username: string; password: string }>;
    };
    if (!platform || !accounts?.length) {
      return reply.status(400).send({ error: "platform and accounts array required" });
    }
    const imported = store.bulkImport(platform, accounts);
    return reply.send({ imported });
  });

  // 按平台统计
  app.get("/api/v1/platform-accounts/stats", async (_req, reply) => {
    const stats = store.getStats();
    return reply.send({ stats });
  });
}
