-- Migration 0009: Agents (separate from card_batches for cleaner rollback)
-- NOTE: If 0008_card_batches.sql already created these tables, this migration is a no-op.

-- Agents table
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

-- Agent commissions table
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
