import { pgTable, uuid, varchar, integer, boolean, timestamp, jsonb, text, pgEnum } from 'drizzle-orm/pg-core';

export const platformEnum = pgEnum('platform', ['dy', 'ks', 'wx', 'xhs']);
export const deviceStatusEnum = pgEnum('device_status', ['online', 'offline', 'busy', 'error']);
export const executionStatusEnum = pgEnum('execution_status', ['pending', 'running', 'completed', 'failed', 'stopped']);
export const scriptValidationEnum = pgEnum('script_validation', ['untested', 'passed', 'failed']);

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 128 }).notNull(),
  publicIp: varchar('public_ip', { length: 45 }).notNull(),
  deekeVersion: varchar('deeke_version', { length: 32 }),
  model: varchar('model', { length: 128 }),
  androidVersion: varchar('android_version', { length: 16 }),
  status: deviceStatusEnum('status').default('offline').notNull(),
  currentApp: varchar('current_app', { length: 256 }),
  battery: integer('battery'),
  screenOn: boolean('screen_on'),
  lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  platform: platformEnum('platform').notNull(),
  username: varchar('username', { length: 256 }).notNull(),
  passwordEncrypted: text('password_encrypted').notNull(),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
  loginStatus: boolean('login_status').default(false),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const taskTemplates = pgTable('task_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 256 }).notNull(),
  platform: platformEnum('platform').notNull(),
  scriptName: varchar('script_name', { length: 256 }).notNull(),
  description: text('description'),
  defaultConfig: jsonb('default_config').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 256 }).notNull(),
  templateId: uuid('template_id').references(() => taskTemplates.id),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  config: jsonb('config').default({}),
  cronExpr: varchar('cron_expr', { length: 128 }),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const executions = pgTable('executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }).notNull(),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }).notNull(),
  status: executionStatusEnum('status').default('pending').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  stats: jsonb('stats').default({}),
  logs: jsonb('logs').default([]),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 128 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 256 }).notNull(),
  role: varchar('role', { length: 32 }).default('operator').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── VLM Agent tables ──

export const vlmEpisodes = pgTable('vlm_episodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }).notNull(),
  modelName: varchar('model_name', { length: 128 }).notNull(),
  taskPrompt: text('task_prompt').notNull(),
  status: executionStatusEnum('status').default('pending').notNull(),
  totalSteps: integer('total_steps').default(0),
  stats: jsonb('stats').default({}),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const vlmSteps = pgTable('vlm_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  episodeId: uuid('episode_id').references(() => vlmEpisodes.id, { onDelete: 'cascade' }).notNull(),
  stepIndex: integer('step_index').notNull(),
  screenshotPath: varchar('screenshot_path', { length: 512 }),
  modelThinking: text('model_thinking'),
  modelRawOutput: text('model_raw_output'),
  action: jsonb('action').notNull(),
  elementSelector: jsonb('element_selector'),
  success: boolean('success').default(true),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const vlmScripts = pgTable('vlm_scripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  episodeId: uuid('episode_id').references(() => vlmEpisodes.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 256 }).notNull(),
  platform: platformEnum('platform').notNull(),
  sourceCode: text('source_code').notNull(),
  selectorCount: integer('selector_count').default(0),
  validationStatus: scriptValidationEnum('validation_status').default('untested').notNull(),
  validationEpisodeId: uuid('validation_episode_id').references(() => vlmEpisodes.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
