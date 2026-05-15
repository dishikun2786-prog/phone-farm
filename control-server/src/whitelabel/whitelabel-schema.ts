import { pgTable, uuid, varchar, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

export const whitelabelConfigs = pgTable('whitelabel_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').unique().notNull(),
  brandName: varchar('brand_name', { length: 128 }),
  logoUrl: text('logo_url'),
  faviconUrl: text('favicon_url'),
  primaryColor: varchar('primary_color', { length: 7 }).default('#3B82F6'),
  secondaryColor: varchar('secondary_color', { length: 7 }).default('#8B5CF6'),
  fontFamily: varchar('font_family', { length: 128 }),
  customCss: text('custom_css'),
  customDomain: varchar('custom_domain', { length: 256 }),
  loginBackgroundUrl: text('login_background_url'),
  footerText: text('footer_text'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_whitelabel_tenant').on(table.tenantId),
  index('idx_whitelabel_domain').on(table.customDomain),
]);
