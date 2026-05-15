-- PhoneFarm Migration 0003: Persistent storage for in-memory stores
-- Converts all in-memory data stores to PostgreSQL tables

-- Activation: card key system
CREATE TABLE IF NOT EXISTS card_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) UNIQUE NOT NULL,
  days INTEGER NOT NULL DEFAULT 365,
  max_devices INTEGER NOT NULL DEFAULT 1,
  used_devices INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_by VARCHAR(128) NOT NULL DEFAULT 'system',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS device_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_key_id UUID NOT NULL REFERENCES card_keys(id) ON DELETE CASCADE,
  device_id VARCHAR(256) NOT NULL,
  device_name VARCHAR(256) NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Device Groups
CREATE TABLE IF NOT EXISTS device_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(256) NOT NULL,
  description TEXT,
  device_ids JSONB NOT NULL DEFAULT '[]',
  tags JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Platform Accounts (social media)
CREATE TABLE IF NOT EXISTS platform_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform platform NOT NULL,
  username VARCHAR(256) NOT NULL,
  password_encrypted TEXT NOT NULL,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(256) NOT NULL,
  key_prefix VARCHAR(32) NOT NULL,
  key_hash VARCHAR(128) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '["read"]',
  ip_whitelist JSONB NOT NULL DEFAULT '[]',
  max_uses INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cron Jobs
CREATE TABLE IF NOT EXISTS cron_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  cron_expr VARCHAR(128) NOT NULL,
  device_ids JSONB NOT NULL DEFAULT '[]',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Crash Reports
CREATE TABLE IF NOT EXISTS crash_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(256) NOT NULL,
  device_name VARCHAR(256),
  app_version VARCHAR(32),
  android_version VARCHAR(16),
  crash_type VARCHAR(32) NOT NULL,
  stack_trace TEXT NOT NULL,
  thread_name VARCHAR(128),
  script_name VARCHAR(256),
  memory_info JSONB,
  recent_logs JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Account Deletions (GDPR compliance)
CREATE TABLE IF NOT EXISTS account_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username VARCHAR(128),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_deletion_at TIMESTAMPTZ NOT NULL,
  cancelled BOOLEAN NOT NULL DEFAULT false
);

-- Webhook Configurations
CREATE TABLE IF NOT EXISTS webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url VARCHAR(1024) NOT NULL,
  events JSONB NOT NULL DEFAULT '[]',
  secret VARCHAR(256),
  enabled BOOLEAN NOT NULL DEFAULT true,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alert Rules
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(256) NOT NULL,
  type VARCHAR(32) NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}',
  channels JSONB NOT NULL DEFAULT '[]',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_card_keys_code ON card_keys(code);
CREATE INDEX IF NOT EXISTS idx_card_keys_status ON card_keys(status);
CREATE INDEX IF NOT EXISTS idx_device_bindings_device ON device_bindings(device_id);
CREATE INDEX IF NOT EXISTS idx_platform_accounts_platform ON platform_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_platform_accounts_device ON platform_accounts(device_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_crash_reports_device ON crash_reports(device_id);
CREATE INDEX IF NOT EXISTS idx_crash_reports_timestamp ON crash_reports(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_account_deletions_user ON account_deletions(user_id);
