import type { AuthUser } from '../auth/auth-middleware.js';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
    apiApp?: {
      appId: string;
      tenantId: string;
      rateLimitQps: number;
      dailyCallLimit: number;
      billingMode: string;
    };
  }
}
