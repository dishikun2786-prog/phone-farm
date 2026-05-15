import { pgTable, uuid, varchar, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  userId: uuid('user_id'),
  username: varchar('username', { length: 128 }),
  action: varchar('action', { length: 64 }).notNull(),
  resourceType: varchar('resource_type', { length: 64 }),
  resourceId: varchar('resource_id', { length: 256 }),
  detail: text('detail'),
  metadata: jsonb('metadata').default({}),
  ip: varchar('ip', { length: 45 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_audit_action').on(table.action),
  index('idx_audit_tenant').on(table.tenantId),
  index('idx_audit_user').on(table.userId),
  index('idx_audit_created').on(table.createdAt),
]);
