-- Phase 2: Billing enhancements — payment transactions + subscription auto_renew
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  out_trade_no UUID UNIQUE NOT NULL,
  transaction_id VARCHAR(128),
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'CNY' NOT NULL,
  gateway VARCHAR(32) DEFAULT 'wechat_pay',
  status VARCHAR(16) DEFAULT 'pending' NOT NULL,
  paid_at TIMESTAMPTZ,
  metadata VARCHAR(2048),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_out_trade_no ON payment_transactions(out_trade_no);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payment_transactions(status);

-- Seed default billing plans (Free/Pro/Enterprise)
INSERT INTO billing_plans (id, name, tier, monthly_price_cents, max_devices, max_vlm_calls_per_day, max_script_executions_per_day, includes_screen_stream, includes_vlm_agent, includes_priority_support, features, monthly_assistant_credits, max_assistant_sessions_per_day, is_active, created_at)
VALUES
  (gen_random_uuid(), 'Free', 'free', 0, 3, 50, 200, false, false, false, '["activation","basic_vlm","script_execution"]', 100, 10, true, now()),
  (gen_random_uuid(), 'Pro', 'pro', 9900, 50, 1000, 5000, true, true, false, '["activation","advanced_vlm","script_execution","screen_stream","api_access"]', 1000, 50, true, now()),
  (gen_random_uuid(), 'Enterprise', 'enterprise', 49900, 500, 10000, 50000, true, true, true, '["activation","advanced_vlm","script_execution","screen_stream","api_access","priority_support","white_label","dedicated_agent"]', 5000, 200, true, now())
ON CONFLICT DO NOTHING;
