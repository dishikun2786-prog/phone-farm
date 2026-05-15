/**
 * PhoneFarm Activation Store — card key lifecycle management with PostgreSQL persistence.
 */
import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { cardKeys, deviceBindings } from "../schema.js";
import { eq, and, lte, sql } from "drizzle-orm";

export type ActivationStatus = "active" | "used" | "expired" | "disabled";

export interface CardKey {
  id: string;
  code: string;
  days: number;
  maxDevices: number;
  usedDevices: number;
  status: ActivationStatus;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  note?: string;
}

export interface DeviceBinding {
  id: string;
  cardKeyId: string;
  deviceId: string;
  deviceName: string;
  boundAt: number;
  expiresAt: number;
}

export class ActivationStore {
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  generateCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const segments = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join("")
    );
    return segments.join("-");
  }

  async batchGenerate(params: {
    count: number;
    days: number;
    maxDevices: number;
    prefix?: string;
    note?: string;
    createdBy: string;
    expiresAt?: number;
  }): Promise<CardKey[]> {
    const keys: CardKey[] = [];
    const now = Date.now();
    const count = Math.min(params.count ?? 1, 500);

    const rows = Array.from({ length: count }, () => ({
      code: params.prefix
        ? `${params.prefix}-${this.generateCode().substring(0, 15)}`
        : this.generateCode(),
      days: params.days ?? 365,
      maxDevices: params.maxDevices ?? 1,
      usedDevices: 0,
      status: "active" as const,
      createdBy: params.createdBy,
      note: params.note ?? null,
      expiresAt: params.expiresAt ? new Date(params.expiresAt) : undefined,
    }));

    try {
      const results = await db.insert(cardKeys).values(rows).returning();
      for (const row of results) {
        keys.push({
          id: row.id,
          code: row.code,
          days: row.days,
          maxDevices: row.maxDevices,
          usedDevices: row.usedDevices,
          status: row.status as ActivationStatus,
          createdBy: row.createdBy,
          createdAt: row.createdAt.getTime(),
          expiresAt: row.expiresAt?.getTime() ?? 0,
          note: row.note ?? undefined,
        });
      }
    } catch (err: any) {
      this.fastify.log.error(`[Activation] DB insert failed: ${err.message}`);
      throw err;
    }

    this.fastify.log.info(`[Activation] Generated ${keys.length} card keys`);
    return keys;
  }

  validateFormat(code: string): { valid: boolean; error?: string } {
    const normalized = code.replace(/\s/g, "").toUpperCase();
    const parts = normalized.split("-");
    if (parts.length !== 4 || parts.some((p) => p.length !== 4)) {
      return { valid: false, error: "卡密格式错误，应为 XXXX-XXXX-XXXX-XXXX" };
    }
    if (/[^A-HJ-NP-Z2-9]/.test(parts.join(""))) {
      return { valid: false, error: "卡密包含非法字符" };
    }
    return { valid: true };
  }

  async consume(code: string, deviceId: string, deviceName: string, tenantId?: string): Promise<{
    success: boolean;
    error?: string;
    expiresAt?: number;
    binding?: DeviceBinding;
  }> {
    const formatCheck = this.validateFormat(code);
    if (!formatCheck.valid) {
      return { success: false, error: formatCheck.error };
    }

    const normalized = code.replace(/\s/g, "").toUpperCase();

    // Find card key by code
    const [cardKey] = await db
      .select()
      .from(cardKeys)
      .where(eq(cardKeys.code, normalized))
      .limit(1);

    if (!cardKey) {
      return { success: false, error: "卡密不存在" };
    }

    if (cardKey.status !== "active") {
      return { success: false, error: `卡密状态为 ${cardKey.status}` };
    }

    if (cardKey.expiresAt && cardKey.expiresAt.getTime() < Date.now()) {
      await db.update(cardKeys).set({ status: "expired" }).where(eq(cardKeys.id, cardKey.id));
      return { success: false, error: "卡密已过期" };
    }

    if (cardKey.usedDevices >= cardKey.maxDevices) {
      return { success: false, error: `卡密已达到最大设备数限制 (${cardKey.maxDevices})` };
    }

    // Check existing binding
    const [existing] = await db
      .select()
      .from(deviceBindings)
      .where(eq(deviceBindings.deviceId, deviceId))
      .limit(1);

    if (existing) {
      return { success: false, error: "此设备已激活，请先解绑" };
    }

    // Create binding
    const now = Date.now();
    const expiresAt = new Date(now + cardKey.days * 24 * 3600 * 1000);

    const [binding] = await db
      .insert(deviceBindings)
      .values({
        cardKeyId: cardKey.id,
        deviceId,
        deviceName,
        tenantId: tenantId || cardKey.tenantId,
        boundAt: new Date(now),
        expiresAt,
      })
      .returning();

    // Update card key usage + tenant_id
    const newUsed = cardKey.usedDevices + 1;
    const newStatus = newUsed >= cardKey.maxDevices ? "used" : "active";
    const updateData: Record<string, any> = { usedDevices: newUsed, status: newStatus };
    if (tenantId && !cardKey.tenantId) {
      updateData.tenantId = tenantId;
    }
    await db
      .update(cardKeys)
      .set(updateData)
      .where(eq(cardKeys.id, cardKey.id));

    this.fastify.log.info(
      `[Activation] Device ${deviceId} bound to card ${code} (expires ${expiresAt.toISOString()})`
    );

    const bindingExpires = binding.expiresAt!.getTime();
    return {
      success: true,
      expiresAt: bindingExpires,
      binding: {
        id: binding.id,
        cardKeyId: binding.cardKeyId,
        deviceId: binding.deviceId,
        deviceName: binding.deviceName,
        boundAt: binding.boundAt.getTime(),
        expiresAt: bindingExpires,
      },
    };
  }

  async getStatus(deviceId: string): Promise<{
    activated: boolean;
    cardKey?: string;
    expiresAt?: number;
    remainingDays?: number;
    maxDevices?: number;
    usedDevices?: number;
  }> {
    const [binding] = await db
      .select()
      .from(deviceBindings)
      .where(eq(deviceBindings.deviceId, deviceId))
      .limit(1);

    if (!binding) {
      return { activated: false };
    }

    if (!binding.expiresAt || binding.expiresAt.getTime() < Date.now()) {
      await db.delete(deviceBindings).where(eq(deviceBindings.id, binding.id));
      return { activated: false };
    }

    const [cardKey] = await db
      .select()
      .from(cardKeys)
      .where(eq(cardKeys.id, binding.cardKeyId))
      .limit(1);

    const bindingExpiresMs = binding.expiresAt?.getTime() ?? 0;
    const remainingMs = bindingExpiresMs - Date.now();
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 3600 * 1000)));

    return {
      activated: true,
      cardKey: cardKey?.code,
      expiresAt: bindingExpiresMs,
      remainingDays,
      maxDevices: cardKey?.maxDevices,
      usedDevices: cardKey?.usedDevices,
    };
  }

  async unbind(deviceId: string): Promise<{ success: boolean; error?: string }> {
    const [binding] = await db
      .select()
      .from(deviceBindings)
      .where(eq(deviceBindings.deviceId, deviceId))
      .limit(1);

    if (!binding) {
      return { success: false, error: "设备未激活" };
    }

    const [cardKey] = await db
      .select()
      .from(cardKeys)
      .where(eq(cardKeys.id, binding.cardKeyId))
      .limit(1);

    if (cardKey && cardKey.usedDevices > 0) {
      const newUsed = cardKey.usedDevices - 1;
      let newStatus: string = cardKey.status;
      if (cardKey.status === "used") {
        if (cardKey.expiresAt && cardKey.expiresAt.getTime() < Date.now()) {
          newStatus = "expired";
        } else {
          newStatus = "active";
        }
      }
      await db
        .update(cardKeys)
        .set({ usedDevices: newUsed, status: newStatus })
        .where(eq(cardKeys.id, cardKey.id));
    }

    await db.delete(deviceBindings).where(eq(deviceBindings.id, binding.id));
    this.fastify.log.info(`[Activation] Device ${deviceId} unbound`);
    return { success: true };
  }

  async list(params: {
    status?: ActivationStatus;
    createdBy?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ keys: CardKey[]; total: number }> {
    let query = db.select().from(cardKeys).$dynamic();

    if (params.status) {
      query = query.where(eq(cardKeys.status, params.status));
    }
    if (params.createdBy) {
      query = query.where(eq(cardKeys.createdBy, params.createdBy));
    }

    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(cardKeys);

    const rows = await query
      .orderBy(sql`${cardKeys.createdAt} DESC`)
      .limit(params.limit ?? 50)
      .offset(params.offset ?? 0);

    const keys: CardKey[] = rows.map((row) => ({
      id: row.id,
      code: row.code,
      days: row.days,
      maxDevices: row.maxDevices,
      usedDevices: row.usedDevices,
      status: row.status as ActivationStatus,
      createdBy: row.createdBy,
      createdAt: row.createdAt.getTime(),
      expiresAt: row.expiresAt?.getTime() ?? 0,
      note: row.note ?? undefined,
    }));

    return { keys, total: totalResult[0]?.count ?? 0 };
  }

  async batchDisable(ids: string[]): Promise<{ disabled: number }> {
    const result = await db
      .update(cardKeys)
      .set({ status: "disabled" })
      .where(and(eq(cardKeys.status, "active"), sql`${cardKeys.id} = ANY(${ids})`));

    this.fastify.log.info(`[Activation] Disabled card keys`);
    return { disabled: result.rowCount ?? 0 };
  }

  async checkExpiring(daysThreshold = 7): Promise<DeviceBinding[]> {
    const threshold = new Date(Date.now() + daysThreshold * 24 * 3600 * 1000);
    const now = new Date();

    const rows = await db
      .select()
      .from(deviceBindings)
      .where(and(
        lte(deviceBindings.expiresAt, threshold),
        sql`${deviceBindings.expiresAt} > ${now}`
      ));

    return rows.map((row) => ({
      id: row.id,
      cardKeyId: row.cardKeyId,
      deviceId: row.deviceId,
      deviceName: row.deviceName,
      boundAt: row.boundAt.getTime(),
      expiresAt: row.expiresAt?.getTime() ?? 0,
    }));
  }
}
