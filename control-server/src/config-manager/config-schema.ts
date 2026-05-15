/**
 * PhoneFarm Config Manager Schema — centralized configuration persistence.
 *
 * 5 tables:
 *   config_categories   — logical grouping (network, vlm, task, ui, system, …)
 *   config_definitions  — single source of truth for every configurable key
 *   config_values       — scoped key-value storage (default/global/plan/template/group/device)
 *   config_templates    — reusable presets that can be applied to groups/devices
 *   config_change_log   — immutable audit trail of every change
 */
import {
  pgTable, uuid, varchar, text, integer, boolean,
  timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { users, devices } from "../schema.js";
import { billingPlans } from "../billing/billing-schema.js";

// ── Categories ──

export const configCategories = pgTable("config_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 64 }).unique().notNull(),
  displayName: varchar("display_name", { length: 128 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 32 }).default("Settings"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_config_categories_key").on(table.key),
]);

// ── Definitions ──

export const configDefinitions = pgTable("config_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id").references(() => configCategories.id, { onDelete: "cascade" }).notNull(),
  key: varchar("key", { length: 128 }).unique().notNull(),
  displayName: varchar("display_name", { length: 256 }).notNull(),
  description: text("description"),
  valueType: varchar("value_type", { length: 32 }).default("string").notNull(),
  // string, number, boolean, json, enum, slider, color, url, secret
  defaultValue: text("default_value"),
  enumOptions: jsonb("enum_options"),       // [{label, value}] for enum type
  validationRule: jsonb("validation_rule"), // {min, max, step, pattern, required}
  isSecret: boolean("is_secret").default(false).notNull(),
  isOverridable: boolean("is_overridable").default(true).notNull(),
  // Which scopes this definition can be overridden at
  allowedScopes: jsonb("allowed_scopes").default('["global","plan","template","group","device"]'),
  tags: jsonb("tags").default("[]"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_config_defs_category").on(table.categoryId),
  index("idx_config_defs_key").on(table.key),
]);

// ── Scoped Values ──

export const configValues = pgTable("config_values", {
  id: uuid("id").primaryKey().defaultRandom(),
  definitionId: uuid("definition_id").references(() => configDefinitions.id, { onDelete: "cascade" }).notNull(),
  scope: varchar("scope", { length: 16 }).default("global").notNull(),
  // global | plan | template | group | device
  scopeId: varchar("scope_id", { length: 128 }),
  // planId / templateId / groupId / deviceId (null for "global")
  value: text("value").notNull(),
  version: integer("version").default(1).notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_config_values_def").on(table.definitionId),
  index("idx_config_values_scope").on(table.scope),
  index("idx_config_values_def_scope").on(table.definitionId, table.scope),
  index("idx_config_values_lookup").on(table.definitionId, table.scope, table.scopeId),
]);

// ── Templates ──

export const configTemplates = pgTable("config_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  values: jsonb("values").default("{}").notNull(),
  // { "config.key": "value", ... }
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_config_templates_active").on(table.isActive),
]);

// ── Audit Log ──

export const configChangeLog = pgTable("config_change_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  definitionId: uuid("definition_id").references(() => configDefinitions.id, { onDelete: "set null" }),
  configKey: varchar("config_key", { length: 128 }).notNull(),
  scope: varchar("scope", { length: 16 }).notNull(),
  scopeId: varchar("scope_id", { length: 128 }),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
  changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  changeReason: text("change_reason"),
}, (table) => [
  index("idx_config_changelog_key").on(table.configKey),
  index("idx_config_changelog_changed").on(table.changedAt),
  index("idx_config_changelog_by").on(table.changedBy),
]);
