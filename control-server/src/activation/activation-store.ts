/**
 * PhoneFarm Activation Store — 卡密生命周期管理（生成/验证/消费/解绑）
 */
import crypto from "crypto";
import type { FastifyInstance } from "fastify";

export type ActivationStatus = "active" | "used" | "expired" | "disabled";

export interface CardKey {
  id: string;
  code: string;           // 16位卡密
  days: number;            // 有效期天数
  maxDevices: number;      // 最大设备数
  usedDevices: number;     // 已绑定设备数
  status: ActivationStatus;
  createdBy: string;
  createdAt: number;
  expiresAt: number;       // 卡密自身过期时间 (0=永久)
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
  private cardKeys: Map<string, CardKey> = new Map();
  private bindings: Map<string, DeviceBinding> = new Map(); // deviceId → binding

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /** 生成单个卡密 */
  generateCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const segments = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join("")
    );
    return segments.join("-");
  }

  /** 批量生成卡密 */
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
    for (let i = 0; i < params.count; i++) {
      const code = params.prefix
        ? `${params.prefix}-${this.generateCode().substring(0, 15)}`
        : this.generateCode();
      const key: CardKey = {
        id: crypto.randomUUID(),
        code,
        days: params.days,
        maxDevices: params.maxDevices,
        usedDevices: 0,
        status: "active",
        createdBy: params.createdBy,
        createdAt: now,
        expiresAt: params.expiresAt ?? 0,
        note: params.note,
      };
      keys.push(key);
      this.cardKeys.set(key.id, key);
    }
    this.fastify.log.info(`[Activation] Generated ${params.count} card keys`);
    return keys;
  }

  /** 验证卡密（本地格式校验） */
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

  /** 通过卡密代码查找卡密 */
  private findCardByCode(code: string): CardKey | undefined {
    const normalized = code.replace(/\s/g, "").toUpperCase();
    for (const key of this.cardKeys.values()) {
      if (key.code.replace(/\s/g, "").toUpperCase() === normalized) {
        return key;
      }
    }
    return undefined;
  }

  /** 消费卡密（设备绑定） */
  async consume(code: string, deviceId: string, deviceName: string): Promise<{
    success: boolean;
    error?: string;
    expiresAt?: number;
    binding?: DeviceBinding;
  }> {
    const formatCheck = this.validateFormat(code);
    if (!formatCheck.valid) {
      return { success: false, error: formatCheck.error };
    }

    const cardKey = this.findCardByCode(code);
    if (!cardKey) {
      return { success: false, error: "卡密不存在" };
    }

    // Check status
    if (cardKey.status !== "active") {
      return { success: false, error: `卡密状态为 ${cardKey.status}` };
    }

    // Check card expiration (0 = permanent)
    if (cardKey.expiresAt > 0 && cardKey.expiresAt < Date.now()) {
      cardKey.status = "expired";
      return { success: false, error: "卡密已过期" };
    }

    // Check device limit
    if (cardKey.usedDevices >= cardKey.maxDevices) {
      return { success: false, error: `卡密已达到最大设备数限制 (${cardKey.maxDevices})` };
    }

    // Check if this device already has a binding
    const existing = this.bindings.get(deviceId);
    if (existing) {
      return { success: false, error: "此设备已激活，请先解绑" };
    }

    // Create binding
    const now = Date.now();
    const expiresAt = now + cardKey.days * 24 * 3600 * 1000;
    const binding: DeviceBinding = {
      id: crypto.randomUUID(),
      cardKeyId: cardKey.id,
      deviceId,
      deviceName,
      boundAt: now,
      expiresAt,
    };

    // Update card key usage
    cardKey.usedDevices++;
    if (cardKey.usedDevices >= cardKey.maxDevices) {
      cardKey.status = "used";
    }

    this.bindings.set(deviceId, binding);
    this.fastify.log.info(`[Activation] Device ${deviceId} bound to card ${code} (expires ${new Date(expiresAt).toISOString()})`);
    return { success: true, expiresAt: binding.expiresAt, binding };
  }

  /** 查询激活状态 */
  async getStatus(deviceId: string): Promise<{
    activated: boolean;
    cardKey?: string;
    expiresAt?: number;
    remainingDays?: number;
    maxDevices?: number;
    usedDevices?: number;
  }> {
    const binding = this.bindings.get(deviceId);
    if (!binding) {
      return { activated: false };
    }

    // Check if binding has expired
    if (binding.expiresAt < Date.now()) {
      this.bindings.delete(deviceId);
      return { activated: false };
    }

    const cardKey = this.cardKeys.get(binding.cardKeyId);
    const remainingMs = binding.expiresAt - Date.now();
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 3600 * 1000)));

    return {
      activated: true,
      cardKey: cardKey?.code,
      expiresAt: binding.expiresAt,
      remainingDays,
      maxDevices: cardKey?.maxDevices,
      usedDevices: cardKey?.usedDevices,
    };
  }

  /** 解绑设备（释放卡密配额） */
  async unbind(deviceId: string): Promise<{ success: boolean; error?: string }> {
    const binding = this.bindings.get(deviceId);
    if (!binding) {
      return { success: false, error: "设备未激活" };
    }

    const cardKey = this.cardKeys.get(binding.cardKeyId);
    if (cardKey && cardKey.usedDevices > 0) {
      cardKey.usedDevices--;
      // If card was fully used, revert to active
      if (cardKey.status === "used" && cardKey.expiresAt > 0 && cardKey.expiresAt < Date.now()) {
        cardKey.status = "expired";
      } else if (cardKey.status === "used") {
        cardKey.status = "active";
      }
    }

    this.bindings.delete(deviceId);
    this.fastify.log.info(`[Activation] Device ${deviceId} unbound`);
    return { success: true };
  }

  /** 查询所有卡密 */
  async list(params: {
    status?: ActivationStatus;
    createdBy?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ keys: CardKey[]; total: number }> {
    let keys = Array.from(this.cardKeys.values());
    if (params.status) keys = keys.filter((k) => k.status === params.status);
    if (params.createdBy) keys = keys.filter((k) => k.createdBy === params.createdBy);
    keys.sort((a, b) => b.createdAt - a.createdAt);
    const total = keys.length;
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 50;
    return { keys: keys.slice(offset, offset + limit), total };
  }

  /** 批量禁用卡密 */
  async batchDisable(ids: string[]): Promise<{ disabled: number }> {
    let disabled = 0;
    for (const id of ids) {
      const key = this.cardKeys.get(id);
      if (key && key.status === "active") {
        key.status = "disabled";
        disabled++;
      }
    }
    this.fastify.log.info(`[Activation] Disabled ${disabled} card keys`);
    return { disabled };
  }

  /** 检查是否即将到期 */
  async checkExpiring(daysThreshold = 7): Promise<DeviceBinding[]> {
    const threshold = Date.now() + daysThreshold * 24 * 3600 * 1000;
    const expiring: DeviceBinding[] = [];
    for (const binding of this.bindings.values()) {
      if (binding.expiresAt <= threshold && binding.expiresAt > Date.now()) {
        expiring.push(binding);
      }
    }
    return expiring;
  }
}
