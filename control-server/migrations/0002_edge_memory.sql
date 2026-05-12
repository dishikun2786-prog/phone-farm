-- 0002_edge_memory.sql
-- Edge-Cloud Architecture: Cross-Device Memory System
-- Depends on: pgvector extension

CREATE EXTENSION IF NOT EXISTS vector;

-- ── Device Memories ──
-- Each row = one device's experience with a specific screen state

CREATE TABLE IF NOT EXISTS device_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    page_type TEXT,
    scenario TEXT NOT NULL,
    state_signature TEXT NOT NULL,
    observation TEXT NOT NULL,
    action_taken JSONB NOT NULL DEFAULT '{}',
    outcome TEXT NOT NULL,
    error_reason TEXT,
    embedding vector(1024),
    success_count INTEGER DEFAULT 1,
    fail_count INTEGER DEFAULT 0,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    UNIQUE (device_id, state_signature)
);

CREATE INDEX IF NOT EXISTS idx_memory_embedding ON device_memories
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_memory_signature ON device_memories (state_signature, platform);
CREATE INDEX IF NOT EXISTS idx_memory_platform ON device_memories (platform, page_type);
CREATE INDEX IF NOT EXISTS idx_memory_outcome ON device_memories (outcome, platform);

-- ── Experience Rules ──
-- Auto-compiled from 3+ devices succeeding on the same scenario

CREATE TABLE IF NOT EXISTS experience_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL,
    scenario TEXT NOT NULL,
    conditions JSONB NOT NULL DEFAULT '{}',
    auto_action JSONB NOT NULL DEFAULT '{}',
    confidence FLOAT DEFAULT 0.5,
    verified_by_devices INTEGER DEFAULT 0,
    total_successes INTEGER DEFAULT 0,
    total_trials INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rules_platform ON experience_rules (platform, enabled, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_rules_scenario ON experience_rules (scenario, platform);
