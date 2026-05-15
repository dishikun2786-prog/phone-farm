import type { FastifyRequest, FastifyReply } from 'fastify';
import { whitelabelService } from './whitelabel-service.js';

/**
 * Whitelabel middleware — injects theme configuration into the request context.
 * Resolves tenant from host header (custom domain) and fetches branding config.
 *
 * Usage: app.addHook('preHandler', whitelabelMiddleware);
 */
export async function whitelabelMiddleware(req: FastifyRequest, _reply: FastifyReply) {
  const host = req.headers.host || '';
  if (!host || host.includes('localhost') || host.includes('127.0.0.1')) {
    return; // Skip for local dev
  }

  // Check if this is a custom domain
  const config = await whitelabelService.getConfigByDomain(host);
  if (config) {
    // Inject whitelabel context into request
    (req as any).whitelabel = {
      tenantId: config.tenantId,
      brandName: config.brandName,
      primaryColor: config.primaryColor,
      logoUrl: config.logoUrl,
    };

    // Also set tenant context from domain
    if (!req.tenantId) {
      req.tenantId = config.tenantId;
    }
  }
}
