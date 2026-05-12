-- PhoneFarm Migration 0003: Centralized Configuration Management
-- 5 tables for config persistence, scoped values, templates, and audit trail

-- Config Categories
CREATE TABLE IF NOT EXISTS config_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(64) UNIQUE NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  description TEXT,
  icon VARCHAR(32) DEFAULT 'Settings',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Config Definitions (canonical registry of every configurable key)
CREATE TABLE IF NOT EXISTS config_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES config_categories(id) ON DELETE CASCADE,
  key VARCHAR(128) UNIQUE NOT NULL,
  display_name VARCHAR(256) NOT NULL,
  description TEXT,
  value_type VARCHAR(32) NOT NULL DEFAULT 'string',
  default_value TEXT,
  enum_options JSONB,
  validation_rule JSONB,
  is_secret BOOLEAN NOT NULL DEFAULT false,
  is_overridable BOOLEAN NOT NULL DEFAULT true,
  allowed_scopes JSONB NOT NULL DEFAULT '["global","plan","template","group","device"]',
  tags JSONB NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scoped Config Values
CREATE TABLE IF NOT EXISTS config_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID NOT NULL REFERENCES config_definitions(id) ON DELETE CASCADE,
  scope VARCHAR(16) NOT NULL DEFAULT 'global',
  scope_id VARCHAR(128),
  value TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Config Templates (reusable presets)
CREATE TABLE IF NOT EXISTS config_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(256) NOT NULL,
  description TEXT,
  values JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Config Change Audit Log
CREATE TABLE IF NOT EXISTS config_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID REFERENCES config_definitions(id) ON DELETE SET NULL,
  config_key VARCHAR(128) NOT NULL,
  scope VARCHAR(16) NOT NULL,
  scope_id VARCHAR(128),
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address VARCHAR(45),
  change_reason TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_config_defs_category ON config_definitions(category_id);
CREATE INDEX IF NOT EXISTS idx_config_defs_key ON config_definitions(key);
CREATE INDEX IF NOT EXISTS idx_config_values_def ON config_values(definition_id);
CREATE INDEX IF NOT EXISTS idx_config_values_scope ON config_values(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_config_values_def_scope ON config_values(definition_id, scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_config_change_log_key ON config_change_log(config_key);
CREATE INDEX IF NOT EXISTS idx_config_change_log_time ON config_change_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_config_change_log_scope ON config_change_log(scope, scope_id);

-- Seed default categories
INSERT INTO config_categories (key, display_name, description, icon, sort_order) VALUES
  ('network', '网络通信', 'WebSocket、HTTP 超时、重连策略', 'Wifi', 1),
  ('vlm', 'VLM AI 智能体', '视觉语言模型推理参数', 'Bot', 2),
  ('decision', '决策引擎', 'Edge-Cloud 双模决策路由', 'Brain', 3),
  ('screenshot', '截图采集', '截图质量、缩放、编码参数', 'Camera', 4),
  ('stream', '屏幕流转发', 'scrcpy 视频流编码与传输', 'Video', 5),
  ('task', '任务执行', '重试策略、超时保护、并发控制', 'ListTodo', 6),
  ('ui', 'UI 交互', '浮窗动画、主题、通知样式', 'Layout', 7),
  ('system', '系统管理', '缓存清理、内存管理、ANR 监控', 'Server', 8),
  ('security', '安全策略', '证书绑定、加密参数、防检测', 'Shield', 9),
  ('feature_flags', '功能开关', '特性门控、实验性功能', 'Toggle', 10),
  ('billing', '计费配置', '套餐限制、用量阈值', 'CreditCard', 11),
  ('device', '设备管理', '心跳间隔、离线检测、注册策略', 'Smartphone', 12),
  ('notification', '通知告警', 'Webhook、邮件、APP 推送', 'Bell', 13),
  ('scrcpy', 'Scrcpy 配置', 'ADB 屏幕镜像参数', 'Monitor', 14),
  ('ai_models', 'AI 模型配置', 'DeepSeek、QwenVL、本地模型参数', 'Cpu', 15)
ON CONFLICT (key) DO NOTHING;
