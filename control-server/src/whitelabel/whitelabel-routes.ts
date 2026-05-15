import type { FastifyInstance } from 'fastify';
import { whitelabelService } from './whitelabel-service.js';
import { requirePermission } from '../auth/rbac.js';
import { z } from 'zod';

const upsertConfigSchema = z.object({
  brandName: z.string().max(128).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  faviconUrl: z.string().url().optional().or(z.literal('')),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontFamily: z.string().max(128).optional(),
  customCss: z.string().optional(),
  customDomain: z.string().max(256).optional(),
  loginBackgroundUrl: z.string().optional(),
  footerText: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function whitelabelRoutes(app: FastifyInstance) {
  // Get whitelabel config for current tenant
  app.get('/api/v2/whitelabel/config', async (req, reply) => {
    const tenantId = req.tenantId;
    if (!tenantId) return reply.send(null);
    const config = await whitelabelService.getConfig(tenantId);
    return reply.send(config);
  });

  // Get whitelabel CSS for injection (public, by domain)
  app.get('/api/v2/whitelabel/theme.css', async (req, reply) => {
    const host = req.headers.host || '';
    let config = null;

    // Try domain-based lookup first
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      config = await whitelabelService.getConfigByDomain(host);
    }

    // Fall back to tenant query param
    if (!config) {
      const query = req.query as Record<string, string>;
      if (query.tenantId) {
        config = await whitelabelService.getConfig(query.tenantId);
      }
    }

    if (!config) {
      return reply.header('Content-Type', 'text/css').send('/* No whitelabel config */');
    }

    const css = whitelabelService.toCssVariables(config);
    return reply.header('Content-Type', 'text/css').send(css);
  });

  // Admin: Upsert whitelabel config
  app.put('/api/v2/whitelabel/config', { preHandler: requirePermission('system', 'manage') }, async (req, reply) => {
    const tenantId = req.tenantId;
    if (!tenantId) return reply.status(400).send({ error: 'No tenant context' });

    const parsed = upsertConfigSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });

    const config = await whitelabelService.upsertConfig(tenantId, parsed.data);
    return reply.send(config);
  });

  // Admin: Delete whitelabel config
  app.delete('/api/v2/whitelabel/config', { preHandler: requirePermission('system', 'manage') }, async (req, reply) => {
    const tenantId = req.tenantId;
    if (!tenantId) return reply.status(400).send({ error: 'No tenant context' });
    await whitelabelService.deleteConfig(tenantId);
    return reply.send({ deleted: true });
  });

  // List all whitelabel configs (admin)
  app.get('/api/v2/whitelabel/configs', { preHandler: requirePermission('system', 'manage') }, async (req, reply) => {
    const { db } = await import('../db.js');
    const { whitelabelConfigs } = await import('./whitelabel-schema.js');
    const rows = await db.select().from(whitelabelConfigs);
    return reply.send({ configs: rows, total: rows.length });
  });
}
