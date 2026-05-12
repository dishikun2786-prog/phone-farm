/**
 * StateStore — Redis 设备状态缓存。
 *
 * 缓存当前设备 EdgeState, TTL 由 EDGE_STATE_TTL_SEC 控制。
 * 用于 Dashboard 查询设备实时状态、跨模块共享。
 */
import { config } from "../config";

// Minimal Redis-like interface — works with ioredis
interface RedisLike {
  setex(key: string, seconds: number, value: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
}

export class StateStore {
  private redis: RedisLike | null;
  private memoryFallback = new Map<string, { value: string; expiresAt: number }>();

  constructor(redis?: RedisLike) {
    this.redis = redis ?? null;
  }

  async set(deviceId: string, state: Record<string, unknown>): Promise<void> {
    const value = JSON.stringify(state);
    const ttl = config.EDGE_STATE_TTL_SEC;

    if (this.redis) {
      await this.redis.setex(`edge_state:${deviceId}`, ttl, value);
    } else {
      this.memoryFallback.set(`edge_state:${deviceId}`, {
        value,
        expiresAt: Date.now() + ttl * 1000,
      });
    }
  }

  async get(deviceId: string): Promise<Record<string, unknown> | null> {
    if (this.redis) {
      const raw = await this.redis.get(`edge_state:${deviceId}`);
      if (!raw) return null;
      return JSON.parse(raw);
    }

    const entry = this.memoryFallback.get(`edge_state:${deviceId}`);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memoryFallback.delete(`edge_state:${deviceId}`);
      return null;
    }
    return JSON.parse(entry.value);
  }

  async delete(deviceId: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(`edge_state:${deviceId}`);
    } else {
      this.memoryFallback.delete(`edge_state:${deviceId}`);
    }
  }

  async getAllDeviceIds(): Promise<string[]> {
    if (this.redis) {
      const keys = await this.redis.keys("edge_state:*");
      return keys.map(k => k.replace("edge_state:", ""));
    }

    const now = Date.now();
    const ids: string[] = [];
    for (const [key, entry] of this.memoryFallback) {
      if (now <= entry.expiresAt) {
        ids.push(key.replace("edge_state:", ""));
      }
    }
    return ids;
  }
}
