import type { FastifyRequest, FastifyReply } from 'fastify';
import { getRedisClient } from '../queue/redis-client.js';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}

/**
 * Sliding window rate limiter using Redis sorted sets.
 * Enforces QPS limits on a per-app basis.
 */
export async function rateLimit(
  req: FastifyRequest,
  reply: FastifyReply,
  qpsLimit: number,
): Promise<RateLimitResult> {
  const appId = req.apiApp?.appId || 'anonymous';
  const now = Date.now();
  const windowMs = 1000; // 1 second window
  const windowStart = now - windowMs;
  const key = `ratelimit:openapi:${appId}`;

  try {
    const redis = getRedisClient();
    // Remove expired entries
    await redis.zremrangebyscore(key, 0, windowStart);

    // Count current window requests
    const count = await redis.zcard(key);

    if (count >= qpsLimit) {
      // Get the oldest entry to calculate retry-after
      const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
      let retryAfterMs = 1000;
      if (oldest.length >= 2) {
        retryAfterMs = Math.max(100, Number(oldest[1]) + windowMs - now + 10);
      }

      return {
        allowed: false,
        remaining: 0,
        resetAt: now + retryAfterMs,
        retryAfterMs,
      };
    }

    // Add current request
    await redis.zadd(key, now, `${now}-${Math.random().toString(36).slice(2, 10)}`);
    await redis.expire(key, 2); // Auto-expire key after 2 seconds

    return {
      allowed: true,
      remaining: qpsLimit - count - 1,
      resetAt: now + windowMs,
      retryAfterMs: 0,
    };
  } catch (err) {
    // If Redis is down, allow the request (fail open)
    return { allowed: true, remaining: qpsLimit, resetAt: now + windowMs, retryAfterMs: 0 };
  }
}

/**
 * Fastify preHandler that applies rate limiting using the app's configured QPS.
 */
export async function openApiRateLimit(req: FastifyRequest, reply: FastifyReply) {
  const qpsLimit = req.apiApp?.rateLimitQps || 60;
  const result = await rateLimit(req, reply, qpsLimit);

  reply.header('X-RateLimit-Limit', qpsLimit);
  reply.header('X-RateLimit-Remaining', result.remaining);
  reply.header('X-RateLimit-Reset', result.resetAt);

  if (!result.allowed) {
    reply.header('Retry-After', Math.ceil(result.retryAfterMs / 1000));
    return reply.status(429).send({
      error: 'Rate limit exceeded',
      retryAfterMs: result.retryAfterMs,
    });
  }
}
