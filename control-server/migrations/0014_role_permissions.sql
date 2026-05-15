-- Phase 14: RBAC role_permissions table + device_memories embedding column

-- Create role_permissions table for RBAC permission overrides
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  role VARCHAR(32) NOT NULL,
  resource VARCHAR(64) NOT NULL,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_lookup ON role_permissions(tenant_id, role, resource);

-- Add embedding column to device_memories for vector search
ALTER TABLE device_memories ADD COLUMN IF NOT EXISTS embedding JSONB;

-- Seed default RBAC permissions: super_admin gets full access to all resources
INSERT INTO role_permissions (id, role, resource, actions)
VALUES
  (gen_random_uuid(), 'super_admin', '*', '["*"]'::jsonb),
  (gen_random_uuid(), 'admin', 'devices', '["read","write","delete"]'::jsonb),
  (gen_random_uuid(), 'admin', 'tasks', '["read","write","delete"]'::jsonb),
  (gen_random_uuid(), 'admin', 'accounts', '["read","write","delete"]'::jsonb),
  (gen_random_uuid(), 'admin', 'users', '["read","write"]'::jsonb),
  (gen_random_uuid(), 'operator', 'devices', '["read","write"]'::jsonb),
  (gen_random_uuid(), 'operator', 'tasks', '["read","write"]'::jsonb),
  (gen_random_uuid(), 'operator', 'accounts', '["read"]'::jsonb),
  (gen_random_uuid(), 'viewer', 'devices', '["read"]'::jsonb),
  (gen_random_uuid(), 'viewer', 'tasks', '["read"]'::jsonb),
  (gen_random_uuid(), 'viewer', 'accounts', '["read"]'::jsonb)
ON CONFLICT DO NOTHING;
