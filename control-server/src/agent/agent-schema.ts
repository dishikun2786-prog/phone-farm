import { pgTable, uuid, varchar, integer, text, boolean, timestamp, jsonb, doublePrecision, index } from 'drizzle-orm/pg-core';

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  contactPhone: varchar('contact_phone', { length: 20 }),
  contactEmail: varchar('contact_email', { length: 256 }),
  commissionRate: doublePrecision('commission_rate').default(0.3).notNull(),
  totalSold: integer('total_sold').default(0).notNull(),
  totalCommission: doublePrecision('total_commission').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_agents_tenant').on(table.tenantId),
  index('idx_agents_user').on(table.userId),
]);

export const cardBatches = pgTable('card_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  agentId: uuid('agent_id'),
  name: varchar('name', { length: 128 }).notNull(),
  planId: uuid('plan_id'),
  count: integer('count').notNull(),
  days: integer('days').default(365).notNull(),
  maxDevices: integer('max_devices').default(1).notNull(),
  wholesalePriceCents: integer('wholesale_price_cents').default(0).notNull(),
  retailPriceCents: integer('retail_price_cents').default(0).notNull(),
  createdBy: varchar('created_by', { length: 128 }).notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_batches_tenant').on(table.tenantId),
  index('idx_batches_agent').on(table.agentId),
]);

export const agentCommissions = pgTable('agent_commissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  agentId: uuid('agent_id').notNull(),
  batchId: uuid('batch_id'),
  cardKeyId: uuid('card_key_id'),
  amount: doublePrecision('amount').notNull(),
  status: varchar('status', { length: 16 }).default('pending').notNull(), // pending, settled, cancelled
  settlementPeriod: varchar('settlement_period', { length: 7 }), // YYYY-MM
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
}, (table) => [
  index('idx_commissions_agent').on(table.agentId),
  index('idx_commissions_period').on(table.settlementPeriod),
]);
