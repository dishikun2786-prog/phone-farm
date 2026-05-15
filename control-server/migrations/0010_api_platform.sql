-- Migration 0010: Open API Platform
-- API apps, usage billing, and API key enhancement

-- 1. API Apps table
CREATE TABLE IF NOT EXISTS api_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  api_key VARCHAR(256) UNIQUE NOT NULL,
  key_prefix VARCHAR(8) NOT NULL,
  permissions VARCHAR(256) DEFAULT 'read' NOT NULL,
  enabled BOOLEAN DEFAULT true NOT NULL,
  rate_limit_qps INTEGER DEFAULT 60 NOT NULL,
  daily_call_limit INTEGER DEFAULT 10000 NOT NULL,
  billing_mode VARCHAR(16) DEFAULT 'prepaid' NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_apps_key ON api_apps(api_key);
CREATE INDEX IF NOT EXISTS idx_api_apps_tenant ON api_apps(tenant_id);

-- 2. API Usage Logs table
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  app_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  endpoint VARCHAR(256) NOT NULL,
  method VARCHAR(8) NOT NULL,
  status_code INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  billed_cents REAL DEFAULT 0 NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_usage_app ON api_usage_logs(app_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_tenant ON api_usage_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_time ON api_usage_logs(recorded_at);
