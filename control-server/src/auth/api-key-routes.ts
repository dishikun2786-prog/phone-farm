/**
 * PhoneFarm API Key Management — API Key CRUD + Auth (DB-backed)
 */
import crypto from "crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AuthService } from './auth-middleware.js';
import { requireAuth } from './auth-middleware.js';
import { db } from "../db.js";
import { apiKeys } from "../schema.js";
import type { InferSelectModel } from "drizzle-orm";

type ApiKeyRow = InferSelectModel<typeof apiKeys>;

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  permissions: string[];
  ipWhitelist: string[];
  maxUses: number;
  usedCount: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
  createdAt: number;
  enabled: boolean;
}

function rowToRecord(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    keyPrefix: row.keyPrefix,
    keyHash: row.keyHash,
    permissions: (row.permissions as string[]) ?? ["read"],
    ipWhitelist: (row.ipWhitelist as string[]) ?? [],
    maxUses: row.maxUses ?? 0,
    usedCount: row.usedCount ?? 0,
    expiresAt: row.expiresAt ? new Date(row.expiresAt).getTime() : null,
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).getTime() : null,
    createdAt: row.createdAt ? new Date(row.createdAt).getTime() : Date.now(),
    enabled: row.enabled ?? true,
  };
}

export class ApiKeyStore {
  private fastify: FastifyInstance;
  private hashIndex: Map<string, string> = new Map(); // keyHash → recordId
  private cache: Map<string, ApiKeyRecord> = new Map();
  private initialized = false;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /** Load all enabled keys from DB into in-memory cache for fast validation. */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.enabled, true));
    for (const row of rows) {
      const record = rowToRecord(row);
      this.cache.set(record.id, record);
      this.hashIndex.set(record.keyHash, record.id);
    }
    this.initialized = true;
    this.fastify.log.info(`[APIKey] Loaded ${rows.length} active API keys from DB`);
  }

  /** Create a new API Key — persists to DB, caches in memory. */
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
    const keyPrefix = `pk_${keyHash.substring(0, 8)}`;

    const [row] = await db.insert(apiKeys).values({
      id: crypto.randomUUID(),
      userId: params.userId,
      name: params.name,
      keyPrefix: keyPrefix,
      keyHash: keyHash,
      permissions: params.permissions ?? ["read"],
      ipWhitelist: params.ipWhitelist ?? [],
      maxUses: params.maxUses ?? 0,
      usedCount: 0,
      expiresAt: params.expiresAt ? new Date(params.expiresAt).toISOString() : null,
      enabled: true,
    }).returning();

    const record = rowToRecord(row);
    this.cache.set(record.id, record);
    this.hashIndex.set(keyHash, record.id);
    this.fastify.log.info(`[APIKey] Created key "${params.name}" for user ${params.userId}`);
    return { record, fullKey };
  }

  /** Validate an API key by hash — checks in-memory cache (fast path). */
  async validateKey(fullKey: string, _clientIp: string): Promise<ApiKeyRecord | null> {
    if (!this.initialized) await this.initialize();
    const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
    const recordId = this.hashIndex.get(keyHash);
    if (!recordId) return null;
    const record = this.cache.get(recordId);
    if (!record || !record.enabled) return null;
    if (record.expiresAt && record.expiresAt < Date.now()) return null;
    if (record.maxUses > 0 && record.usedCount >= record.maxUses) return null;

    // Update usage counters in cache, and async-persist to DB
    record.usedCount++;
    record.lastUsedAt = Date.now();
    db.update(apiKeys)
      .set({ usedCount: record.usedCount, lastUsedAt: new Date().toISOString() })
      .where(eq(apiKeys.id, record.id))
      .execute()
      .catch(() => {}); // fire-and-forget
    return record;
  }

  /** List all API keys for a user — reads from DB. */
  async list(userId: string): Promise<ApiKeyRecord[]> {
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
    return rows.map(rowToRecord).sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Enable or disable an API key — updates DB and cache. */
  async toggle(keyId: string, enabled: boolean): Promise<boolean> {
    const result = await db.update(apiKeys)
      .set({ enabled })
      .where(eq(apiKeys.id, keyId));
    if (result.rowCount === 0) return false;
    const cached = this.cache.get(keyId);
    if (cached) {
      cached.enabled = enabled;
      if (!enabled) this.hashIndex.delete(cached.keyHash);
    }
    return true;
  }

  /** Delete an API key — removes from DB and cache. */
  async delete(keyId: string): Promise<boolean> {
    const record = this.cache.get(keyId);
    if (record) {
      this.hashIndex.delete(record.keyHash);
      this.cache.delete(keyId);
    }
    const result = await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
    return (result.rowCount ?? 0) > 0;
  }
}

export async function apiKeyRoutes(app: FastifyInstance, authService?: AuthService): Promise<void> {
  const store = new ApiKeyStore(app);
  await store.initialize();
  const authPreHandler = authService ? requireAuth(authService) : undefined;

  // All API key routes require authentication
  if (authPreHandler) {
    app.addHook('preHandler', authPreHandler);
  }

  // Create API Key
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

  // List user API Keys
  app.get("/api/v1/api-keys", async (req, reply) => {
    const user = (req as any).user;
    const keys = await store.list(user.userId);
    return reply.send({ keys });
  });

  // Toggle API Key
  app.patch("/api/v1/api-keys/:id/toggle", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { enabled } = req.body as { enabled: boolean };
    await store.toggle(id, enabled);
    return reply.send({ ok: true });
  });

  // Delete API Key
  app.delete("/api/v1/api-keys/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await store.delete(id);
    return reply.send({ ok: true });
  });
}
