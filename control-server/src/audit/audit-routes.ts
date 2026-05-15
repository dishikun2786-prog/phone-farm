import type { FastifyInstance } from 'fastify';
import { auditService } from './audit-service.js';
import { requireAuth } from '../auth/auth-middleware.js';

export async function auditRoutes(app: FastifyInstance) {
  app.get('/api/v1/audit-logs', { preHandler: requireAuth((app as any).authService) }, async (req, reply) => {
    const query = req.query as Record<string, string>;
    const result = await auditService.query({
      action: query.action,
      userId: query.userId,
      tenantId: query.tenantId || req.tenantId,
      from: query.from ? Number(query.from) : undefined,
      to: query.to ? Number(query.to) : undefined,
      limit: query.limit ? Number(query.limit) : 50,
      offset: query.offset ? Number(query.offset) : 0,
    });
    return reply.send(result);
  });
}
