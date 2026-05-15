/**
 * Tenant middleware — resolves tenant from JWT claim or subdomain, injects into request context.
 */
import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '../auth/auth-middleware.js';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { tenants } from './schema.js';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
    tenant?: { id: string; name: string; slug: string; status: string };
  }
}

/** Resolve tenant from JWT claim (primary) or Host header subdomain (secondary). */
export async function resolveTenant(req: FastifyRequest): Promise<string | null> {
  // Priority 1: JWT claim
  const user = req.user as (AuthUser & { tenantId?: string }) | undefined;
  if (user?.tenantId) {
    const cached = req.tenant;
    if (cached && cached.id === user.tenantId) return user.tenantId;

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1);
    if (tenant && tenant.status === 'active') {
      req.tenant = { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status };
      return tenant.id;
    }
    return null;
  }

  // Priority 2: Subdomain (for white-label / Phase 6)
  const host = req.headers.host || '';
  const subdomain = host.split('.')[0]?.toLowerCase();
  if (subdomain && subdomain !== 'phone' && subdomain !== 'www' && subdomain !== 'app') {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.domain, host)).limit(1);
    if (tenant && tenant.status === 'active') {
      req.tenant = { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status };
      return tenant.id;
    }
  }

  return null;
}

/** Fastify preHandler: require tenant resolution. Returns 403 if no tenant resolved. */
export function requireTenant() {
  return async (req: FastifyRequest) => {
    const tenantId = await resolveTenant(req);
    if (!tenantId) {
      throw { statusCode: 403, message: 'Tenant not resolved — ensure JWT includes tenantId or valid subdomain' };
    }
    req.tenantId = tenantId;
  };
}

/** Fastify preHandler: optional tenant resolution (for device-facing routes where tenant is inferred). */
export function optionalTenant() {
  return async (req: FastifyRequest) => {
    const tenantId = await resolveTenant(req);
    if (tenantId) req.tenantId = tenantId;
  };
}
