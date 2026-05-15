-- Migration 0004: AI Assistant — credits, sessions, token pricing
-- Creates the credit/pricing infrastructure for the mobile AI Assistant feature.

-- 1. User credit accounts (one per user)
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Credit transaction ledger
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL,              -- earn, spend, refund, bonus, admin_grant
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  scene VARCHAR(64),                      -- assistant_chat, card_activation, admin_grant
  reference_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_scene ON credit_transactions(scene);
CREATE INDEX IF NOT EXISTS idx_credit_tx_created ON credit_transactions(created_at);

-- 3. AI Assistant sessions
CREATE TABLE IF NOT EXISTS assistant_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  title VARCHAR(256),
  status VARCHAR(16) DEFAULT 'active',    -- active, completed, stopped, error
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 0,
  credits_spent INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asst_session_user ON assistant_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_asst_session_device ON assistant_sessions(device_id);

-- 4. Token pricing configuration
CREATE TABLE IF NOT EXISTS token_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name VARCHAR(64) NOT NULL,
  model_type VARCHAR(32) NOT NULL,        -- brain, vision
  input_tokens_per_credit INTEGER NOT NULL,
  output_tokens_per_credit INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default pricing
INSERT INTO token_pricing (model_name, model_type, input_tokens_per_credit, output_tokens_per_credit) VALUES
  ('deepseek-v4-flash', 'brain', 5000, 2000),
  ('qwen3-vl-plus', 'vision', 3000, 1500)
ON CONFLICT DO NOTHING;
