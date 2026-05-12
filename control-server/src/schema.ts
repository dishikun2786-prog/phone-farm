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

// ── Activation (card key system) ──

export const cardKeys = pgTable('card_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 64 }).unique().notNull(),
  days: integer('days').notNull(),
  maxDevices: integer('max_devices').default(1).notNull(),
  usedDevices: integer('used_devices').default(0).notNull(),
  status: varchar('status', { length: 16 }).default('active').notNull(), // active, used, expired, disabled
  createdBy: varchar('created_by', { length: 128 }).default('system').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

export const deviceBindings = pgTable('device_bindings', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardKeyId: uuid('card_key_id').references(() => cardKeys.id, { onDelete: 'cascade' }).notNull(),
  deviceId: varchar('device_id', { length: 256 }).notNull(),
  deviceName: varchar('device_name', { length: 256 }).notNull(),
  boundAt: timestamp('bound_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

// ── Device Groups ──

export const deviceGroups = pgTable('device_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description'),
  deviceIds: jsonb('device_ids').default([]).notNull(),
  tags: jsonb('tags').default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Platform Accounts (social media) ──

export const platformAccounts = pgTable('platform_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  platform: platformEnum('platform').notNull(),
  username: varchar('username', { length: 256 }).notNull(),
  passwordEncrypted: text('password_encrypted').notNull(),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 16 }).default('active').notNull(), // active, logged_out, banned, expired
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── API Keys ──

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 256 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 32 }).notNull(),
  keyHash: varchar('key_hash', { length: 128 }).notNull(),
  permissions: jsonb('permissions').default(['read']).notNull(),
  ipWhitelist: jsonb('ip_whitelist').default([]).notNull(),
  maxUses: integer('max_uses').default(0),
  usedCount: integer('used_count').default(0),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Cron Jobs ──

export const cronJobs = pgTable('cron_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  cronExpr: varchar('cron_expr', { length: 128 }).notNull(),
  deviceIds: jsonb('device_ids').default([]).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Crash Reports ──

export const crashReports = pgTable('crash_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceId: varchar('device_id', { length: 256 }).notNull(),
  deviceName: varchar('device_name', { length: 256 }),
  appVersion: varchar('app_version', { length: 32 }),
  androidVersion: varchar('android_version', { length: 16 }),
  crashType: varchar('crash_type', { length: 32 }).notNull(), // java_exception, native_signal, anr, oom, unknown
  stackTrace: text('stack_trace').notNull(),
  threadName: varchar('thread_name', { length: 128 }),
  scriptName: varchar('script_name', { length: 256 }),
  memoryInfo: jsonb('memory_info'),
  recentLogs: jsonb('recent_logs'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
});

// ── Account Deletions (GDPR) ──

export const accountDeletions = pgTable('account_deletions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  username: varchar('username', { length: 128 }),
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
  scheduledDeletionAt: timestamp('scheduled_deletion_at', { withTimezone: true }).notNull(),
  cancelled: boolean('cancelled').default(false).notNull(),
});

// ── Webhook Configs ──

export const webhookConfigs = pgTable('webhook_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: varchar('url', { length: 1024 }).notNull(),
  events: jsonb('events').default([]).notNull(),
  secret: varchar('secret', { length: 256 }),
  enabled: boolean('enabled').default(true).notNull(),
  retryCount: integer('retry_count').default(0),
  maxRetries: integer('max_retries').default(3),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Alert Rules ──

export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 256 }).notNull(),
  type: varchar('type', { length: 32 }).notNull(), // device_offline, task_failure, battery_low, etc.
  conditions: jsonb('conditions').default({}).notNull(),
  channels: jsonb('channels').default([]).notNull(), // webhook, email, push
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
