/**
 * PhoneFarm Tenant Schema — multi-tenant isolation via tenant_id on all business tables.
 */
import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, index, integer } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 128 }).notNull(),
  slug: varchar('slug', { length: 64 }).unique().notNull(),
  domain: varchar('domain', { length: 256 }),
  contactName: varchar('contact_name', { length: 128 }),
  contactEmail: varchar('contact_email', { length: 256 }),
  contactPhone: varchar('contact_phone', { length: 20 }),
  status: varchar('status', { length: 16 }).default('active').notNull(), // active, suspended, deleted
  maxDevices: integer('max_devices').default(100),
  maxUsers: integer('max_users').default(10),
  features: jsonb('features').default([]),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_tenants_slug').on(table.slug),
  index('idx_tenants_domain').on(table.domain),
  index('idx_tenants_status').on(table.status),
]);
