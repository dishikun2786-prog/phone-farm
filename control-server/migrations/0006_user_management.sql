-- PhoneFarm User Management Migration
-- Adds phone registration, SMS verification, user status, and soft-delete support
-- Run: psql -U postgres -d phonefarm -f migrations/0006_user_management.sql

-- 1. Add user_status enum
DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('active', 'disabled', 'deleted');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Add new columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status user_status DEFAULT 'active' NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Add unique constraint on phone
DO $$ BEGIN
    ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone);
EXCEPTION WHEN duplicate_table THEN null;
END $$;

-- 4. Create sms_codes table
CREATE TABLE IF NOT EXISTS sms_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL,
    code VARCHAR(6) NOT NULL,
    scene VARCHAR(32) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. Index for fast lookup of unused codes
CREATE INDEX IF NOT EXISTS idx_sms_codes_phone_scene ON sms_codes (phone, scene);

-- 6. Backfill: set existing users as active
UPDATE users SET status = 'active' WHERE status IS NULL;

-- 7. Add indexes for admin queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);
