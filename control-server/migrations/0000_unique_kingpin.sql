CREATE TYPE "public"."device_status" AS ENUM('online', 'offline', 'busy', 'error');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('pending', 'running', 'completed', 'failed', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('dy', 'ks', 'wx', 'xhs');--> statement-breakpoint
CREATE TYPE "public"."script_validation" AS ENUM('untested', 'passed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled', 'deleted');--> statement-breakpoint
CREATE TABLE "account_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid NOT NULL,
	"username" varchar(128),
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scheduled_deletion_at" timestamp with time zone NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"platform" "platform" NOT NULL,
	"username" varchar(256) NOT NULL,
	"password_encrypted" text NOT NULL,
	"device_id" uuid,
	"login_status" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" varchar(256) NOT NULL,
	"type" varchar(32) NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid NOT NULL,
	"name" varchar(256) NOT NULL,
	"key_prefix" varchar(32) NOT NULL,
	"key_hash" varchar(128) NOT NULL,
	"permissions" jsonb DEFAULT '["read"]'::jsonb NOT NULL,
	"ip_whitelist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_uses" integer DEFAULT 0,
	"used_count" integer DEFAULT 0,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid NOT NULL,
	"device_id" uuid,
	"title" varchar(256),
	"status" varchar(16) DEFAULT 'active',
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"total_steps" integer DEFAULT 0 NOT NULL,
	"credits_spent" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" varchar(128) NOT NULL,
	"tier" varchar(16) DEFAULT 'free' NOT NULL,
	"monthly_price_cents" integer DEFAULT 0,
	"max_devices" integer DEFAULT 1,
	"max_vlm_calls_per_day" integer DEFAULT 100,
	"max_script_executions_per_day" integer DEFAULT 500,
	"includes_screen_stream" boolean DEFAULT false,
	"includes_vlm_agent" boolean DEFAULT false,
	"includes_priority_support" boolean DEFAULT false,
	"monthly_assistant_credits" integer DEFAULT 0,
	"max_assistant_sessions_per_day" integer DEFAULT 10,
	"features" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"batch_id" uuid,
	"code" varchar(64) NOT NULL,
	"days" integer NOT NULL,
	"max_devices" integer DEFAULT 1 NOT NULL,
	"used_devices" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_by" varchar(128) DEFAULT 'system' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "card_keys_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "crash_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"device_id" varchar(256) NOT NULL,
	"device_name" varchar(256),
	"app_version" varchar(32),
	"android_version" varchar(16),
	"crash_type" varchar(32) NOT NULL,
	"stack_trace" text NOT NULL,
	"thread_name" varchar(128),
	"script_name" varchar(256),
	"memory_info" jsonb,
	"recent_logs" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"scene" varchar(64),
	"reference_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cron_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"task_id" uuid,
	"cron_expr" varchar(128) NOT NULL,
	"device_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"card_key_id" uuid NOT NULL,
	"device_id" varchar(256) NOT NULL,
	"device_name" varchar(256) NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "device_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" varchar(256) NOT NULL,
	"description" text,
	"device_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"device_id" text NOT NULL,
	"platform" text NOT NULL,
	"page_type" text,
	"scenario" text NOT NULL,
	"state_signature" text NOT NULL,
	"observation" text NOT NULL,
	"action_taken" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" text NOT NULL,
	"error_reason" text,
	"success_count" integer DEFAULT 1,
	"fail_count" integer DEFAULT 0,
	"last_seen_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" varchar(128) NOT NULL,
	"public_ip" varchar(45) NOT NULL,
	"deeke_version" varchar(32),
	"model" varchar(128),
	"android_version" varchar(16),
	"status" "device_status" DEFAULT 'offline' NOT NULL,
	"current_app" varchar(256),
	"battery" integer,
	"screen_on" boolean,
	"last_seen" timestamp with time zone DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"task_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"status" "execution_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb,
	"logs" jsonb DEFAULT '[]'::jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experience_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"platform" text NOT NULL,
	"scenario" text NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_action" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" integer DEFAULT 0.5,
	"verified_by_devices" integer DEFAULT 0,
	"total_successes" integer DEFAULT 0,
	"total_trials" integer DEFAULT 0,
	"enabled" boolean DEFAULT true,
	"first_seen_at" timestamp with time zone DEFAULT now(),
	"last_verified_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid NOT NULL,
	"order_id" uuid,
	"invoice_number" varchar(32) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp with time zone,
	"due_date" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"pdf_url" varchar(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"payment_method" varchar(32),
	"paid_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"platform" "platform" NOT NULL,
	"username" varchar(256) NOT NULL,
	"password_encrypted" text NOT NULL,
	"device_id" uuid,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"phone" varchar(20) NOT NULL,
	"code" varchar(6) NOT NULL,
	"scene" varchar(32) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"device_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" varchar(256) NOT NULL,
	"platform" "platform" NOT NULL,
	"script_name" varchar(256) NOT NULL,
	"description" text,
	"default_config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" varchar(256) NOT NULL,
	"template_id" uuid,
	"device_id" uuid,
	"account_id" uuid,
	"config" jsonb DEFAULT '{}'::jsonb,
	"cron_expr" varchar(128),
	"enabled" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"model_name" varchar(64) NOT NULL,
	"model_type" varchar(32) NOT NULL,
	"input_tokens_per_credit" integer NOT NULL,
	"output_tokens_per_credit" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid NOT NULL,
	"device_id" uuid,
	"metric" varchar(64) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"total_earned" integer DEFAULT 0 NOT NULL,
	"total_spent" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_credits_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"username" varchar(128) NOT NULL,
	"password_hash" varchar(256) NOT NULL,
	"role" varchar(32) DEFAULT 'operator' NOT NULL,
	"phone" varchar(20),
	"phone_verified" boolean DEFAULT false,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "vlm_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"task_id" uuid,
	"device_id" uuid NOT NULL,
	"model_name" varchar(128) NOT NULL,
	"task_prompt" text NOT NULL,
	"status" "execution_status" DEFAULT 'pending' NOT NULL,
	"total_steps" integer DEFAULT 0,
	"stats" jsonb DEFAULT '{}'::jsonb,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vlm_scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"episode_id" uuid,
	"name" varchar(256) NOT NULL,
	"platform" "platform" NOT NULL,
	"source_code" text NOT NULL,
	"selector_count" integer DEFAULT 0,
	"validation_status" "script_validation" DEFAULT 'untested' NOT NULL,
	"validation_episode_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vlm_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"episode_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"screenshot_path" varchar(512),
	"model_thinking" text,
	"model_raw_output" text,
	"action" jsonb NOT NULL,
	"element_selector" jsonb,
	"success" boolean DEFAULT true,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"url" varchar(1024) NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secret" varchar(256),
	"enabled" boolean DEFAULT true NOT NULL,
	"retry_count" integer DEFAULT 0,
	"max_retries" integer DEFAULT 3,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"out_trade_no" uuid NOT NULL,
	"transaction_id" varchar(128),
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"gateway" varchar(32) DEFAULT 'wechat_pay',
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"metadata" varchar(2048),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_transactions_out_trade_no_unique" UNIQUE("out_trade_no")
);
--> statement-breakpoint
CREATE TABLE "config_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"display_name" varchar(128) NOT NULL,
	"description" text,
	"icon" varchar(32) DEFAULT 'Settings',
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "config_categories_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "config_change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid,
	"config_key" varchar(128) NOT NULL,
	"scope" varchar(16) NOT NULL,
	"scope_id" varchar(128),
	"old_value" text,
	"new_value" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"change_reason" text
);
--> statement-breakpoint
CREATE TABLE "config_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"key" varchar(128) NOT NULL,
	"display_name" varchar(256) NOT NULL,
	"description" text,
	"value_type" varchar(32) DEFAULT 'string' NOT NULL,
	"default_value" text,
	"enum_options" jsonb,
	"validation_rule" jsonb,
	"is_secret" boolean DEFAULT false NOT NULL,
	"is_overridable" boolean DEFAULT true NOT NULL,
	"allowed_scopes" jsonb DEFAULT '["global","plan","template","group","device"]',
	"tags" jsonb DEFAULT '[]',
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "config_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "config_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"values" jsonb DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"scope" varchar(16) DEFAULT 'global' NOT NULL,
	"scope_id" varchar(128),
	"value" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"domain" varchar(256),
	"contact_name" varchar(128),
	"contact_email" varchar(256),
	"contact_phone" varchar(20),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"max_devices" integer DEFAULT 100,
	"max_users" integer DEFAULT 10,
	"features" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "agent_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"batch_id" uuid,
	"card_key_id" uuid,
	"amount" double precision NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"settlement_period" varchar(7),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"contact_phone" varchar(20),
	"contact_email" varchar(256),
	"commission_rate" double precision DEFAULT 0.3 NOT NULL,
	"total_sold" integer DEFAULT 0 NOT NULL,
	"total_commission" double precision DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_id" uuid,
	"name" varchar(128) NOT NULL,
	"plan_id" uuid,
	"count" integer NOT NULL,
	"days" integer DEFAULT 365 NOT NULL,
	"max_devices" integer DEFAULT 1 NOT NULL,
	"wholesale_price_cents" integer DEFAULT 0 NOT NULL,
	"retail_price_cents" integer DEFAULT 0 NOT NULL,
	"created_by" varchar(128) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"api_key" varchar(256) NOT NULL,
	"key_prefix" varchar(8) NOT NULL,
	"permissions" varchar(256) DEFAULT 'read' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_qps" integer DEFAULT 60 NOT NULL,
	"daily_call_limit" integer DEFAULT 10000 NOT NULL,
	"billing_mode" varchar(16) DEFAULT 'prepaid' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_apps_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
CREATE TABLE "api_usage_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_usage_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"app_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"endpoint" varchar(256) NOT NULL,
	"method" varchar(8) NOT NULL,
	"status_code" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"billed_cents" double precision DEFAULT 0 NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whitelabel_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"brand_name" varchar(128),
	"logo_url" text,
	"favicon_url" text,
	"primary_color" varchar(7) DEFAULT '#3B82F6',
	"secondary_color" varchar(7) DEFAULT '#8B5CF6',
	"font_family" varchar(128),
	"custom_css" text,
	"custom_domain" varchar(256),
	"login_background_url" text,
	"footer_text" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whitelabel_configs_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "support_ticket_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"is_staff" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ticket_number" varchar(32) NOT NULL,
	"subject" varchar(256) NOT NULL,
	"category" varchar(32) DEFAULT 'technical' NOT NULL,
	"priority" varchar(16) DEFAULT 'normal' NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid,
	"username" varchar(128),
	"action" varchar(64) NOT NULL,
	"resource_type" varchar(64),
	"resource_id" varchar(256),
	"detail" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_deletions" ADD CONSTRAINT "account_deletions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_sessions" ADD CONSTRAINT "assistant_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_sessions" ADD CONSTRAINT "assistant_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cron_jobs" ADD CONSTRAINT "cron_jobs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_bindings" ADD CONSTRAINT "device_bindings_card_key_id_card_keys_id_fk" FOREIGN KEY ("card_key_id") REFERENCES "public"."card_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_billing_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vlm_episodes" ADD CONSTRAINT "vlm_episodes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vlm_episodes" ADD CONSTRAINT "vlm_episodes_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vlm_scripts" ADD CONSTRAINT "vlm_scripts_episode_id_vlm_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."vlm_episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vlm_scripts" ADD CONSTRAINT "vlm_scripts_validation_episode_id_vlm_episodes_id_fk" FOREIGN KEY ("validation_episode_id") REFERENCES "public"."vlm_episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vlm_steps" ADD CONSTRAINT "vlm_steps_episode_id_vlm_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."vlm_episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_change_log" ADD CONSTRAINT "config_change_log_definition_id_config_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."config_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_change_log" ADD CONSTRAINT "config_change_log_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_definitions" ADD CONSTRAINT "config_definitions_category_id_config_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."config_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_templates" ADD CONSTRAINT "config_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_values" ADD CONSTRAINT "config_values_definition_id_config_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."config_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_values" ADD CONSTRAINT "config_values_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_replies" ADD CONSTRAINT "support_ticket_replies_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_keys_hash" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "idx_api_keys_user" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_asst_session_user" ON "assistant_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_asst_session_device" ON "assistant_sessions" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_credit_tx_user" ON "credit_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_credit_tx_scene" ON "credit_transactions" USING btree ("scene");--> statement-breakpoint
CREATE INDEX "idx_credit_tx_created" ON "credit_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_devices_last_seen" ON "devices" USING btree ("last_seen");--> statement-breakpoint
CREATE INDEX "idx_devices_status" ON "devices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_executions_task" ON "executions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_executions_device" ON "executions" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_executions_created" ON "executions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_executions_started" ON "executions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_executions_status" ON "executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_invoices_user" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_order" ON "invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_status" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_orders_user" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_orders_subscription" ON "orders" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sms_codes_phone_scene" ON "sms_codes" USING btree ("phone","scene");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_user" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_plan" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_period_end" ON "subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_status" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tasks_device" ON "tasks" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_template" ON "tasks" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_usage_user" ON "usage_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_usage_metric" ON "usage_records" USING btree ("metric");--> statement-breakpoint
CREATE INDEX "idx_usage_recorded" ON "usage_records" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "idx_usage_user_metric" ON "usage_records" USING btree ("user_id","metric");--> statement-breakpoint
CREATE INDEX "idx_vlm_episodes_task" ON "vlm_episodes" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_vlm_episodes_device" ON "vlm_episodes" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_vlm_episodes_created" ON "vlm_episodes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_vlm_episodes_status" ON "vlm_episodes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_vlm_steps_episode" ON "vlm_steps" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "idx_payments_out_trade_no" ON "payment_transactions" USING btree ("out_trade_no");--> statement-breakpoint
CREATE INDEX "idx_payments_status" ON "payment_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_config_categories_key" ON "config_categories" USING btree ("key");--> statement-breakpoint
CREATE INDEX "idx_config_changelog_key" ON "config_change_log" USING btree ("config_key");--> statement-breakpoint
CREATE INDEX "idx_config_changelog_changed" ON "config_change_log" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "idx_config_changelog_by" ON "config_change_log" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "idx_config_defs_category" ON "config_definitions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_config_defs_key" ON "config_definitions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "idx_config_templates_active" ON "config_templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_config_values_def" ON "config_values" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "idx_config_values_scope" ON "config_values" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_config_values_def_scope" ON "config_values" USING btree ("definition_id","scope");--> statement-breakpoint
CREATE INDEX "idx_config_values_lookup" ON "config_values" USING btree ("definition_id","scope","scope_id");--> statement-breakpoint
CREATE INDEX "idx_tenants_slug" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_tenants_domain" ON "tenants" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_tenants_status" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_commissions_agent" ON "agent_commissions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_commissions_period" ON "agent_commissions" USING btree ("settlement_period");--> statement-breakpoint
CREATE INDEX "idx_agents_tenant" ON "agents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_agents_user" ON "agents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_batches_tenant" ON "card_batches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_batches_agent" ON "card_batches" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_api_apps_key" ON "api_apps" USING btree ("api_key");--> statement-breakpoint
CREATE INDEX "idx_api_apps_tenant" ON "api_apps" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_api_usage_app" ON "api_usage_logs" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "idx_api_usage_tenant" ON "api_usage_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_api_usage_time" ON "api_usage_logs" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "idx_whitelabel_tenant" ON "whitelabel_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_whitelabel_domain" ON "whitelabel_configs" USING btree ("custom_domain");--> statement-breakpoint
CREATE INDEX "idx_ticket_replies_ticket" ON "support_ticket_replies" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_user" ON "support_tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_status" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tickets_updated" ON "support_tickets" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_audit_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_tenant" ON "audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_audit_user" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "audit_logs" USING btree ("created_at");