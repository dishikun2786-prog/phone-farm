-- Phase 1: Multi-tenant infrastructure
-- Step 1: Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(128) NOT NULL,
  slug VARCHAR(64) UNIQUE NOT NULL,
  domain VARCHAR(256),
  contact_name VARCHAR(128),
  contact_email VARCHAR(256),
  contact_phone VARCHAR(20),
  status VARCHAR(16) DEFAULT 'active' NOT NULL,
  max_devices INTEGER DEFAULT 100,
  max_users INTEGER DEFAULT 10,
  features JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- Step 2: Insert default tenant (for existing data migration)
INSERT INTO tenants (id, name, slug, status, max_devices, max_users)
VALUES (gen_random_uuid(), 'Default', 'default', 'active', 10000, 1000)
ON CONFLICT (slug) DO NOTHING;

-- Step 3: Add tenant_id (NULLABLE first) to all business tables
-- PostgreSQL 11+ ADD COLUMN NULL runs instantly without table lock
ALTER TABLE devices ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE executions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE vlm_episodes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE vlm_steps ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE vlm_scripts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE card_keys ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE device_bindings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE device_groups ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE cron_jobs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE crash_reports ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE account_deletions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE webhook_configs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE device_memories ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE experience_rules ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE assistant_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE token_pricing ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Billing tables
ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Step 4: Assign default tenant to all existing rows
DO $$
DECLARE
  default_tenant_id UUID;
BEGIN
  SELECT id INTO default_tenant_id FROM tenants WHERE slug = 'default' LIMIT 1;

  UPDATE devices SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE accounts SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE task_templates SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE tasks SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE executions SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE users SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE vlm_episodes SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE vlm_steps SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE vlm_scripts SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE card_keys SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE device_bindings SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE device_groups SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE platform_accounts SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE api_keys SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE cron_jobs SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE crash_reports SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE account_deletions SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE webhook_configs SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE alert_rules SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE device_memories SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE experience_rules SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE user_credits SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE credit_transactions SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE assistant_sessions SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE token_pricing SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE billing_plans SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE subscriptions SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE orders SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE usage_records SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE invoices SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
END $$;

-- Step 5: Create indexes on tenant_id columns for all major tables
CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_executions_tenant ON executions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vlm_episodes_tenant ON vlm_episodes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_card_keys_tenant ON card_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_device_groups_tenant ON device_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_tenant ON usage_records(tenant_id);
