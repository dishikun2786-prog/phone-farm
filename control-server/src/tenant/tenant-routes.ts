/**
 * Tenant management routes — super_admin only.
 */
import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../auth/auth-middleware.js';
import { tenantService } from './tenant-service.js';
import { z } from 'zod';

const createTenantSchema = z.object({
  name: z.string().min(1).max(128),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens'),
  domain: z.string().max(256).optional(),
  contactName: z.string().max(128).optional(),
  contactEmail: z.string().email().max(256).optional(),
  contactPhone: z.string().max(20).optional(),
  maxDevices: z.number().int().min(1).max(100000).optional(),
  maxUsers: z.number().int().min(1).max(10000).optional(),
  features: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateTenantSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  domain: z.string().max(256).optional(),
  contactName: z.string().max(128).optional(),
  contactEmail: z.string().email().max(256).optional(),
  contactPhone: z.string().max(20).optional(),
  status: z.enum(['active', 'suspended', 'deleted']).optional(),
  maxDevices: z.number().int().min(1).max(100000).optional(),
  maxUsers: z.number().int().min(1).max(10000).optional(),
  features: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function tenantRoutes(app: FastifyInstance) {
  // All tenant routes require super_admin
  const requireAdmin = requirePermission('system', 'manage');

  app.post('/api/v2/tenants', { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }
    const tenant = await tenantService.create(parsed.data);
    return reply.status(201).send(tenant);
  });

  app.get('/api/v2/tenants', { preHandler: requireAdmin }, async (req, reply) => {
    const query = req.query as Record<string, string>;
    const search = query.search;
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const result = await tenantService.list(search, limit, offset);
    return reply.send(result);
  });

  app.get('/api/v2/tenants/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const tenant = await tenantService.getById(id);
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });
    return reply.send(tenant);
  });

  app.patch('/api/v2/tenants/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }
    const existing = await tenantService.getById(id);
    if (!existing) return reply.status(404).send({ error: 'Tenant not found' });
    const updated = await tenantService.update(id, parsed.data);
    return reply.send(updated);
  });

  app.delete('/api/v2/tenants/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await tenantService.getById(id);
    if (!existing) return reply.status(404).send({ error: 'Tenant not found' });
    await tenantService.delete(id);
    return reply.send({ deleted: true });
  });

  // Current tenant info (for any authenticated user)
  app.get('/api/v2/tenant/current', async (req, reply) => {
    if (!req.tenant) return reply.status(404).send({ error: 'No tenant context' });
    return reply.send(req.tenant);
  });
}
