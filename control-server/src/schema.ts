import { pgTable, uuid, varchar, integer, boolean, timestamp, jsonb, text, pgEnum, index, doublePrecision } from 'drizzle-orm/pg-core';

export const platformEnum = pgEnum('platform', ['dy', 'ks', 'wx', 'xhs']);
export const deviceStatusEnum = pgEnum('device_status', ['online', 'offline', 'busy', 'error']);
export const executionStatusEnum = pgEnum('execution_status', ['pending', 'running', 'completed', 'failed', 'stopped']);
export const scriptValidationEnum = pgEnum('script_validation', ['untested', 'passed', 'failed']);

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
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
}, (table) => [
  index('idx_devices_last_seen').on(table.lastSeen),
  index('idx_devices_status').on(table.status),
  index('idx_devices_public_ip').on(table.publicIp),
  index('idx_devices_tenant').on(table.tenantId),
]);

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  platform: platformEnum('platform').notNull(),
  username: varchar('username', { length: 256 }).notNull(),
  passwordEncrypted: text('password_encrypted').notNull(),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
  loginStatus: boolean('login_status').default(false),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_accounts_platform').on(table.platform),
  index('idx_accounts_tenant').on(table.tenantId),
]);

export const taskTemplates = pgTable('task_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  name: varchar('name', { length: 256 }).notNull(),
  platform: platformEnum('platform').notNull(),
  scriptName: varchar('script_name', { length: 256 }).notNull(),
  description: text('description'),
  defaultConfig: jsonb('default_config').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  name: varchar('name', { length: 256 }).notNull(),
  templateId: uuid('template_id').references(() => taskTemplates.id),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  config: jsonb('config').default({}),
  cronExpr: varchar('cron_expr', { length: 128 }),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_tasks_device').on(table.deviceId),
  index('idx_tasks_template').on(table.templateId),
  index('idx_tasks_tenant').on(table.tenantId),
]);

export const executions = pgTable('executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }).notNull(),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }).notNull(),
  status: executionStatusEnum('status').default('pending').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  stats: jsonb('stats').default({}),
  logs: jsonb('logs').default([]),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_executions_task').on(table.taskId),
  index('idx_executions_device').on(table.deviceId),
  index('idx_executions_created').on(table.createdAt),
  index('idx_executions_started').on(table.startedAt),
  index('idx_executions_status').on(table.status),
  index('idx_executions_tenant').on(table.tenantId),
]);

export const userStatusEnum = pgEnum('user_status', ['active', 'disabled', 'deleted']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  username: varchar('username', { length: 128 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 256 }).notNull(),
  role: varchar('role', { length: 32 }).default('operator').notNull(),
  phone: varchar('phone', { length: 20 }).unique(),
  phoneVerified: boolean('phone_verified').default(false),
  status: userStatusEnum('status').default('active').notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_users_role').on(table.role),
  index('idx_users_status').on(table.status),
  index('idx_users_tenant').on(table.tenantId),
]);

// ── SMS Verification Codes ──

export const smsCodes = pgTable('sms_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  phone: varchar('phone', { length: 20 }).notNull(),
  code: varchar('code', { length: 6 }).notNull(),
  scene: varchar('scene', { length: 32 }).notNull(), // register, login, reset_password, bind
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_sms_codes_phone_scene').on(table.phone, table.scene),
]);

// ── VLM Agent tables ──

export const vlmEpisodes = pgTable('vlm_episodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
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
}, (table) => [
  index('idx_vlm_episodes_task').on(table.taskId),
  index('idx_vlm_episodes_device').on(table.deviceId),
  index('idx_vlm_episodes_created').on(table.createdAt),
  index('idx_vlm_episodes_status').on(table.status),
  index('idx_vlm_episodes_tenant').on(table.tenantId),
]);

export const vlmSteps = pgTable('vlm_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
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
}, (table) => [
  index('idx_vlm_steps_episode').on(table.episodeId),
]);

export const vlmScripts = pgTable('vlm_scripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  episodeId: uuid('episode_id').references(() => vlmEpisodes.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 256 }).notNull(),
  platform: platformEnum('platform').notNull(),
  sourceCode: text('source_code').notNull(),
  selectorCount: integer('selector_count').default(0),
  validationStatus: scriptValidationEnum('validation_status').default('untested').notNull(),
  validationEpisodeId: uuid('validation_episode_id').references(() => vlmEpisodes.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_vlm_scripts_platform').on(table.platform),
  index('idx_vlm_scripts_validation').on(table.validationStatus),
]);

// ── Activation (card key system) ──

export const cardKeys = pgTable('card_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  batchId: uuid('batch_id'),
  code: varchar('code', { length: 64 }).unique().notNull(),
  days: integer('days').default(365).notNull(),
  maxDevices: integer('max_devices').default(1).notNull(),
  usedDevices: integer('used_devices').default(0).notNull(),
  status: varchar('status', { length: 16 }).default('active').notNull(), // active, used, expired, disabled
  createdBy: varchar('created_by', { length: 128 }).default('system').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => [
  index('idx_card_keys_code').on(table.code),
  index('idx_card_keys_status').on(table.status),
  index('idx_card_keys_tenant').on(table.tenantId),
]);

export const deviceBindings = pgTable('device_bindings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  cardKeyId: uuid('card_key_id').references(() => cardKeys.id, { onDelete: 'cascade' }).notNull(),
  deviceId: varchar('device_id', { length: 256 }).notNull(),
  deviceName: varchar('device_name', { length: 256 }).notNull(),
  boundAt: timestamp('bound_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => [
  index('idx_device_bindings_device').on(table.deviceId),
]);

// ── Device Groups ──

export const deviceGroups = pgTable('device_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description'),
  deviceIds: jsonb('device_ids').default([]).notNull(),
  tags: jsonb('tags').default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_device_groups_tenant').on(table.tenantId),
]);

// ── Platform Accounts (social media) ──
// DEPRECATED: use `accounts` table instead. This table is retained for backward compatibility
// and will be merged into `accounts` in a future migration.

export const platformAccounts = pgTable('platform_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
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
  tenantId: uuid('tenant_id'),
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
}, (table) => [
  index('idx_api_keys_hash').on(table.keyHash),
  index('idx_api_keys_user').on(table.userId),
]);

// ── Cron Jobs ──

export const cronJobs = pgTable('cron_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
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
  tenantId: uuid('tenant_id'),
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
}, (table) => [
  index('idx_crash_reports_device').on(table.deviceId),
  index('idx_crash_reports_timestamp').on(table.timestamp),
]);

// ── Account Deletions (GDPR) ──

export const accountDeletions = pgTable('account_deletions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  username: varchar('username', { length: 128 }),
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
  scheduledDeletionAt: timestamp('scheduled_deletion_at', { withTimezone: true }).notNull(),
  cancelled: boolean('cancelled').default(false).notNull(),
});

// ── Webhook Configs ──

export const webhookConfigs = pgTable('webhook_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
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
  tenantId: uuid('tenant_id'),
  name: varchar('name', { length: 256 }).notNull(),
  type: varchar('type', { length: 32 }).notNull(), // device_offline, task_failure, battery_low, etc.
  conditions: jsonb('conditions').default({}).notNull(),
  channels: jsonb('channels').default([]).notNull(), // webhook, email, push
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Edge Memory (0002_edge_memory) ──

export const deviceMemories = pgTable('device_memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  deviceId: text('device_id').notNull(),
  platform: text('platform').notNull(),
  pageType: text('page_type'),
  scenario: text('scenario').notNull(),
  stateSignature: text('state_signature').notNull(),
  observation: text('observation').notNull(),
  actionTaken: jsonb('action_taken').default({}).notNull(),
  outcome: text('outcome').notNull(),
  errorReason: text('error_reason'),
  successCount: integer('success_count').default(1),
  failCount: integer('fail_count').default(0),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow(),
  embedding: jsonb('embedding'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => [
  index('idx_memory_signature').on(table.stateSignature, table.platform),
  index('idx_memory_platform').on(table.platform, table.pageType),
  index('idx_memory_outcome').on(table.outcome, table.platform),
]);

export const experienceRules = pgTable('experience_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  platform: text('platform').notNull(),
  scenario: text('scenario').notNull(),
  conditions: jsonb('conditions').default({}).notNull(),
  autoAction: jsonb('auto_action').default({}).notNull(),
  confidence: doublePrecision('confidence').default(0.5),
  verifiedByDevices: integer('verified_by_devices').default(0),
  totalSuccesses: integer('total_successes').default(0),
  totalTrials: integer('total_trials').default(0),
  enabled: boolean('enabled').default(true),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow(),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── AI Assistant / Credits (0004_ai_assistant) ──

export const userCredits = pgTable('user_credits', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).unique().notNull(),
  balance: integer('balance').default(0).notNull(),
  totalEarned: integer('total_earned').default(0).notNull(),
  totalSpent: integer('total_spent').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const creditTransactions = pgTable('credit_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: varchar('type', { length: 32 }).notNull(), // earn, spend, refund, bonus, admin_grant
  amount: integer('amount').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  scene: varchar('scene', { length: 64 }), // assistant_chat, card_activation, admin_grant
  referenceId: uuid('reference_id'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_credit_tx_user').on(table.userId),
  index('idx_credit_tx_scene').on(table.scene),
  index('idx_credit_tx_created').on(table.createdAt),
]);

export const assistantSessions = pgTable('assistant_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 256 }),
  status: varchar('status', { length: 16 }).default('active'), // active, completed, stopped, error
  totalTokens: integer('total_tokens').default(0).notNull(),
  totalSteps: integer('total_steps').default(0).notNull(),
  creditsSpent: integer('credits_spent').default(0).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_asst_session_user').on(table.userId),
  index('idx_asst_session_device').on(table.deviceId),
]);

export const tokenPricing = pgTable('token_pricing', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  modelName: varchar('model_name', { length: 64 }).notNull(),
  modelType: varchar('model_type', { length: 32 }).notNull(), // brain, vision
  inputTokensPerCredit: integer('input_tokens_per_credit').notNull(),
  outputTokensPerCredit: integer('output_tokens_per_credit').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Billing tables (billingPlans, subscriptions, orders, usageRecords, invoices) ──
// are defined in billing/billing-schema.ts to avoid Drizzle migration conflicts.
// Import from "../billing/billing-schema.js" for any code that needs them.

// ── RBAC Permission Overrides ──

export const rolePermissions = pgTable('role_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),       // null = global default override
  role: varchar('role', { length: 32 }).notNull(),
  resource: varchar('resource', { length: 64 }).notNull(),
  actions: jsonb('actions').$type<string[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_role_permissions_lookup').on(table.tenantId, table.role, table.resource),
]);
