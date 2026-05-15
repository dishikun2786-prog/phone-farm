import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './src/schema.ts',
    './src/billing/payment-schema.ts',
    './src/config-manager/config-schema.ts',
    './src/tenant/schema.ts',
    './src/agent/agent-schema.ts',
    './src/openapi/openapi-schema.ts',
    './src/whitelabel/whitelabel-schema.ts',
    './src/support/ticket-schema.ts',
    './src/audit/audit-schema.ts',
  ],
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://phonefarm:phonefarm@localhost:5432/phonefarm',
  },
});
