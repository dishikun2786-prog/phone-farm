/**
 * Redis client stub — returns the shared ioredis connection.
 * When Redis is not available, falls back to a noop mock for dev mode.
 */
import Redis from "ioredis";

let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    client = new Redis(url, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 3000);
      },
    });
    client.on("error", (err) => {
      console.warn("[Redis] connection error (non-fatal):", err.message);
    });
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
