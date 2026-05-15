import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '../auth/auth-middleware.js';
import { db } from '../db.js';
import { apiApps } from './openapi-schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import crypto from 'crypto';
import { z } from 'zod';

const createKeySchema = z.object({
  name: z.string().min(1).max(128),
  permissions: z.array(z.string()).default(['read']),
  description: z.string().optional(),
  rateLimitQps: z.number().int().min(1).max(1000).default(60),
});

function generateApiKey(): { fullKey: string; prefix: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const prefix = `pf_${raw.substring(0, 8)}`;
  const fullKey = `pf_${raw}`;
  return { fullKey, prefix };
}

export async function apiKeyManagementRoutes(app: FastifyInstance) {
  // List user's API keys
  app.get('/api/v2/api-keys', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const keys = await db.select().from(apiApps)
      .where(eq(apiApps.userId, user.userId))
      .orderBy(apiApps.createdAt);

    // Return safely — never expose full API key after creation
    const safe = keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      permissions: k.permissions.split(',').map((s) => s.trim()),
      enabled: k.enabled,
      rateLimitQps: k.rateLimitQps,
      billingMode: k.billingMode,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    }));

    return reply.send({ keys: safe, total: safe.length });
  });

  // Create new API key
  app.post('/api/v2/api-keys', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const parsed = createKeySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });

    const { fullKey, prefix } = generateApiKey();
    const tenantId = req.tenantId || 'default';

    const [app] = await db.insert(apiApps).values({
      id: randomUUID(),
      tenantId,
      userId: user.userId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      apiKey: fullKey,
      keyPrefix: prefix,
      permissions: parsed.data.permissions.join(','),
      rateLimitQps: parsed.data.rateLimitQps,
    }).returning();

    // Return the full key — this is the ONLY time the full key is shown
    return reply.status(201).send({
      id: app.id,
      name: app.name,
      apiKey: fullKey,
      keyPrefix: prefix,
      permissions: parsed.data.permissions,
    });
  });

  // Delete API key
  app.delete('/api/v2/api-keys/:id', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = req.params as { id: string };
    const [key] = await db.select().from(apiApps)
      .where(and(eq(apiApps.id, id), eq(apiApps.userId, user.userId)))
      .limit(1);

    if (!key) return reply.status(404).send({ error: 'API key not found' });

    await db.delete(apiApps).where(eq(apiApps.id, id));
    return reply.send({ deleted: true });
  });
}
