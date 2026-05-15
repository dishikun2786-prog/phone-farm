-- Migration 0011: White-label / Custom branding
-- Enables per-tenant custom branding, custom domains, and CSS theme injection

CREATE TABLE IF NOT EXISTS whitelabel_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID UNIQUE NOT NULL,
  brand_name VARCHAR(128),
  logo_url TEXT,
  favicon_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#3B82F6',
  secondary_color VARCHAR(7) DEFAULT '#8B5CF6',
  font_family VARCHAR(128),
  custom_css TEXT,
  custom_domain VARCHAR(256),
  login_background_url TEXT,
  footer_text TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_whitelabel_tenant ON whitelabel_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whitelabel_domain ON whitelabel_configs(custom_domain);
