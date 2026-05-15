import { pgTable, uuid, varchar, text, integer, boolean, timestamp, bigint, doublePrecision, index } from 'drizzle-orm/pg-core';

export const apiApps = pgTable('api_apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description'),
  apiKey: varchar('api_key', { length: 256 }).unique().notNull(),
  keyPrefix: varchar('key_prefix', { length: 8 }).notNull(),
  permissions: varchar('permissions', { length: 256 }).default('read').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  rateLimitQps: integer('rate_limit_qps').default(60).notNull(),
  dailyCallLimit: integer('daily_call_limit').default(10000).notNull(),
  billingMode: varchar('billing_mode', { length: 16 }).default('prepaid').notNull(), // prepaid, postpaid
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_api_apps_key').on(table.apiKey),
  index('idx_api_apps_tenant').on(table.tenantId),
]);

export const apiUsageLogs = pgTable('api_usage_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  appId: uuid('app_id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  endpoint: varchar('endpoint', { length: 256 }).notNull(),
  method: varchar('method', { length: 8 }).notNull(),
  statusCode: integer('status_code').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  billedCents: doublePrecision('billed_cents').default(0).notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_api_usage_app').on(table.appId),
  index('idx_api_usage_tenant').on(table.tenantId),
  index('idx_api_usage_time').on(table.recordedAt),
]);
