-- PhoneFarm VLM Agent Migration
-- Adds episode recording, step tracking, and compiled script storage
-- Run: psql -U postgres -d phonefarm -f migrations/0001_vlm.sql

DO $$ BEGIN
    CREATE TYPE script_validation AS ENUM ('untested', 'passed', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- VLM Episode: one per natural-language task execution
CREATE TABLE IF NOT EXISTS vlm_episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
    model_name VARCHAR(128) NOT NULL,
    task_prompt TEXT NOT NULL,
    status execution_status DEFAULT 'pending' NOT NULL,
    total_steps INTEGER DEFAULT 0,
    stats JSONB DEFAULT '{}',
    error_message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- VLM Step: one per screenshot→VLM→action cycle
CREATE TABLE IF NOT EXISTS vlm_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID REFERENCES vlm_episodes(id) ON DELETE CASCADE NOT NULL,
    step_index INTEGER NOT NULL,
    screenshot_path VARCHAR(512),
    model_thinking TEXT,
    model_raw_output TEXT,
    action JSONB NOT NULL,
    element_selector JSONB,
    success BOOLEAN DEFAULT true,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- VLM Script: compiled DeekeScript from an episode
CREATE TABLE IF NOT EXISTS vlm_scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID REFERENCES vlm_episodes(id) ON DELETE SET NULL,
    name VARCHAR(256) NOT NULL,
    platform platform NOT NULL,
    source_code TEXT NOT NULL,
    selector_count INTEGER DEFAULT 0,
    validation_status script_validation DEFAULT 'untested' NOT NULL,
    validation_episode_id UUID REFERENCES vlm_episodes(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vlm_episodes_device_id ON vlm_episodes(device_id);
CREATE INDEX IF NOT EXISTS idx_vlm_episodes_status ON vlm_episodes(status);
CREATE INDEX IF NOT EXISTS idx_vlm_episodes_task_id ON vlm_episodes(task_id);
CREATE INDEX IF NOT EXISTS idx_vlm_steps_episode_id ON vlm_steps(episode_id);
CREATE INDEX IF NOT EXISTS idx_vlm_scripts_platform ON vlm_scripts(platform);
CREATE INDEX IF NOT EXISTS idx_vlm_scripts_validation ON vlm_scripts(validation_status);
