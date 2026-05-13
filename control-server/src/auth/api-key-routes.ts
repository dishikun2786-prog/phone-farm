/**
 * PhoneFarm API Key Management — API Key CRUD + 鉴权
 */
import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import type { AuthService } from './auth-middleware.js';
import { requireAuth } from './auth-middleware.js';

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;     // "pk_" + first 8 hash chars
  keyHash: string;       // SHA-256 of full key
  permissions: string[];
  ipWhitelist: string[];
  maxUses: number;
  usedCount: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
  createdAt: number;
  enabled: boolean;
}

export class ApiKeyStore {
  private fastify: FastifyInstance;
  private keys: Map<string, ApiKeyRecord> = new Map();
  private hashIndex: Map<string, string> = new Map(); // keyHash → recordId

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /** 生成新 API Key（仅首次返回完整 key） */
  async create(params: {
    userId: string;
    name: string;
    permissions?: string[];
    ipWhitelist?: string[];
    maxUses?: number;
    expiresAt?: number;
  }): Promise<{ record: ApiKeyRecord; fullKey: string }> {
    const fullKey = `pk_${crypto.randomBytes(24).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
    const record: ApiKeyRecord = {
      id: crypto.randomUUID(),
      userId: params.userId,
      name: params.name,
      keyPrefix: `pk_${keyHash.substring(0, 8)}`,
      keyHash,
      permissions: params.permissions ?? ["read"],
      ipWhitelist: params.ipWhitelist ?? [],
      maxUses: params.maxUses ?? 0,
      usedCount: 0,
      expiresAt: params.expiresAt ?? null,
      lastUsedAt: null,
      createdAt: Date.now(),
      enabled: true,
    };
    this.keys.set(record.id, record);
    this.hashIndex.set(keyHash, record.id);
    this.fastify.log.info(`[APIKey] Created key "${params.name}" for user ${params.userId}`);
    return { record, fullKey };
  }

  /** 通过完整 key 哈希查找并验证（更新使用计数） */
  async validateKey(fullKey: string, clientIp: string): Promise<ApiKeyRecord | null> {
    const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
    const recordId = this.hashIndex.get(keyHash);
    if (!recordId) return null;
    const record = this.keys.get(recordId);
    if (!record) return null;
    // Update usage counters
    record.usedCount++;
    record.lastUsedAt = Date.now();
    return record;
  }

  /** 列出用户的所有 API Keys（不返回完整 key） */
  async list(userId: string): Promise<ApiKeyRecord[]> {
    const results: ApiKeyRecord[] = [];
    for (const record of this.keys.values()) {
      if (record.userId === userId) {
        results.push(record);
      }
    }
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** 启用/禁用 API Key */
  async toggle(keyId: string, enabled: boolean): Promise<boolean> {
    const record = this.keys.get(keyId);
    if (!record) return false;
    record.enabled = enabled;
    return true;
  }

  /** 删除 API Key */
  async delete(keyId: string): Promise<boolean> {
    const record = this.keys.get(keyId);
    if (!record) return false;
    this.hashIndex.delete(record.keyHash);
    this.keys.delete(keyId);
    return true;
  }
}

export async function apiKeyRoutes(app: FastifyInstance, authService?: AuthService): Promise<void> {
  const store = new ApiKeyStore(app);
  const authPreHandler = authService ? requireAuth(authService) : undefined;

  // All API key routes require authentication
  if (authPreHandler) {
    app.addHook('preHandler', authPreHandler);
  }

  // 创建 API Key
  app.post("/api/v1/api-keys", async (req, reply) => {
    const { name, permissions, ipWhitelist, maxUses, expiresAt } = req.body as any;
    const user = (req as any).user;
    const result = await store.create({
      userId: user.userId,
      name,
      permissions,
      ipWhitelist,
      maxUses,
      expiresAt,
    });
    return reply.status(201).send(result);
  });

  // 列出用户 API Keys
  app.get("/api/v1/api-keys", async (req, reply) => {
    const user = (req as any).user;
    const keys = await store.list(user.userId);
    return reply.send({ keys });
  });

  // 启用/禁用 API Key
  app.patch("/api/v1/api-keys/:id/toggle", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { enabled } = req.body as { enabled: boolean };
    await store.toggle(id, enabled);
    return reply.send({ ok: true });
  });

  // 删除 API Key
  app.delete("/api/v1/api-keys/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await store.delete(id);
    return reply.send({ ok: true });
  });
}
