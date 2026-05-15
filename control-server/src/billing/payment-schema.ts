/**
 * Payment transactions table — separate from orders for idempotent webhook processing.
 */
import { pgTable, uuid, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';

export const payments = pgTable('payment_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  outTradeNo: uuid('out_trade_no').unique().notNull(),
  transactionId: varchar('transaction_id', { length: 128 }),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 3 }).default('CNY').notNull(),
  gateway: varchar('gateway', { length: 32 }).default('wechat_pay'),
  status: varchar('status', { length: 16 }).default('pending').notNull(), // pending, paid, failed, refunded
  paidAt: timestamp('paid_at', { withTimezone: true }),
  metadata: varchar('metadata', { length: 2048 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_payments_out_trade_no').on(table.outTradeNo),
  index('idx_payments_status').on(table.status),
]);
