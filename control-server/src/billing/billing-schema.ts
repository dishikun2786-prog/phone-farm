/**
 * PhoneFarm Billing Schema — plans, subscriptions, orders, invoices.
 */
import { pgTable, uuid, varchar, integer, boolean, timestamp, jsonb, text, numeric, index } from 'drizzle-orm/pg-core';
import { users, devices } from '../schema.js';

// Billing plans
export const billingPlans = pgTable('billing_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  name: varchar('name', { length: 128 }).notNull(),
  tier: varchar('tier', { length: 16 }).default('free').notNull(), // free, pro, enterprise
  monthlyPriceCents: integer('monthly_price_cents').default(0),
  maxDevices: integer('max_devices').default(1),
  maxVlmCallsPerDay: integer('max_vlm_calls_per_day').default(100),
  maxScriptExecutionsPerDay: integer('max_script_executions_per_day').default(500),
  includesScreenStream: boolean('includes_screen_stream').default(false),
  includesVlmAgent: boolean('includes_vlm_agent').default(false),
  includesPrioritySupport: boolean('includes_priority_support').default(false),
  features: jsonb('features').default([]),
  monthlyAssistantCredits: integer('monthly_assistant_credits').default(0),
  maxAssistantSessionsPerDay: integer('max_assistant_sessions_per_day').default(10),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// User subscriptions
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  planId: uuid('plan_id').references(() => billingPlans.id, { onDelete: 'restrict' }).notNull(),
  status: varchar('status', { length: 16 }).default('active').notNull(), // active, cancelled, expired, past_due
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  deviceCount: integer('device_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_subscriptions_user').on(table.userId),
  index('idx_subscriptions_plan').on(table.planId),
  index('idx_subscriptions_period_end').on(table.currentPeriodEnd),
  index('idx_subscriptions_status').on(table.status),
]);

// Orders / purchases
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 3 }).default('CNY').notNull(),
  status: varchar('status', { length: 16 }).default('pending').notNull(), // pending, paid, refunded, cancelled
  paymentMethod: varchar('payment_method', { length: 32 }), // alipay, wechat_pay, bank_transfer, manual
  paidAt: timestamp('paid_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_orders_user').on(table.userId),
  index('idx_orders_subscription').on(table.subscriptionId),
  index('idx_orders_status').on(table.status),
]);

// Usage records (for usage-based billing)
export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
  metric: varchar('metric', { length: 64 }).notNull(), // vlm_call, script_execution, screen_stream_minute, device_registration
  quantity: integer('quantity').default(1).notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_usage_user').on(table.userId),
  index('idx_usage_metric').on(table.metric),
  index('idx_usage_recorded').on(table.recordedAt),
  index('idx_usage_user_metric').on(table.userId, table.metric),
]);

// Invoices
export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  invoiceNumber: varchar('invoice_number', { length: 32 }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 3 }).default('CNY').notNull(),
  status: varchar('status', { length: 16 }).default('draft').notNull(), // draft, issued, paid, void
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  dueDate: timestamp('due_date', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  pdfUrl: varchar('pdf_url', { length: 1024 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_invoices_user').on(table.userId),
  index('idx_invoices_order').on(table.orderId),
  index('idx_invoices_status').on(table.status),
]);
