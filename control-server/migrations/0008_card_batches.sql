-- Migration 0008: Card batches + agent system
-- Adds batch tracking to card_keys and creates agent distribution tables

-- 1. Add batch_id to card_keys
ALTER TABLE card_keys ADD COLUMN IF NOT EXISTS batch_id UUID;

-- 2. Card batches table
CREATE TABLE IF NOT EXISTS card_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  agent_id UUID,
  name VARCHAR(128) NOT NULL,
  plan_id UUID,
  count INTEGER NOT NULL,
  days INTEGER DEFAULT 365 NOT NULL,
  max_devices INTEGER DEFAULT 1 NOT NULL,
  wholesale_price_cents INTEGER DEFAULT 0 NOT NULL,
  retail_price_cents INTEGER DEFAULT 0 NOT NULL,
  created_by VARCHAR(128) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_batches_tenant ON card_batches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_batches_agent ON card_batches(agent_id);

-- 3. Agents table
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name VARCHAR(128) NOT NULL,
  contact_phone VARCHAR(20),
  contact_email VARCHAR(256),
  commission_rate REAL DEFAULT 0.3 NOT NULL,
  total_sold INTEGER DEFAULT 0 NOT NULL,
  total_commission REAL DEFAULT 0 NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id);

-- 4. Agent commissions table
CREATE TABLE IF NOT EXISTS agent_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  batch_id UUID,
  card_key_id UUID,
  amount REAL NOT NULL,
  status VARCHAR(16) DEFAULT 'pending' NOT NULL,
  settlement_period VARCHAR(7),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_commissions_agent ON agent_commissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_commissions_period ON agent_commissions(settlement_period);
