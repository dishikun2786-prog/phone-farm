import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db.js';
import { apiApps } from './openapi-schema.js';
import { eq, and } from 'drizzle-orm';

export interface ApiAppContext {
  appId: string;
  tenantId: string;
  userId: string;
  permissions: string[];
  rateLimitQps: number;
  dailyCallLimit: number;
  billingMode: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    apiApp?: ApiAppContext;
  }
}

/**
 * OpenAPI Key authentication middleware.
 * Expects `X-API-Key` header.
 * Injects `req.apiApp` on success.
 */
export async function openApiAuth(req: FastifyRequest, reply: FastifyReply) {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey || apiKey.length < 8) {
    return reply.status(401).send({ error: 'Missing or invalid X-API-Key header' });
  }

  const [app] = await db.select().from(apiApps)
    .where(and(eq(apiApps.apiKey, apiKey), eq(apiApps.enabled, true)))
    .limit(1);

  if (!app) {
    return reply.status(401).send({ error: 'Invalid or disabled API key' });
  }

  req.apiApp = {
    appId: app.id,
    tenantId: app.tenantId,
    userId: app.userId,
    permissions: app.permissions.split(',').map((s) => s.trim()),
    rateLimitQps: app.rateLimitQps,
    dailyCallLimit: app.dailyCallLimit,
    billingMode: app.billingMode,
  };

  // Update last_used_at
  db.update(apiApps).set({ lastUsedAt: new Date() }).where(eq(apiApps.id, app.id)).execute().catch(() => {});
}
