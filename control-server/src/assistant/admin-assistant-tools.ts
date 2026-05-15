/**
 * Admin AI Assistant — Tool definitions (Anthropic function-calling format).
 *
 * 20 semantic tools covering all admin management domains.
 * System prompt instructs the LLM to act as a PhoneFarm admin assistant.
 */

export interface AdminToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const ADMIN_SYSTEM_PROMPT = `You are the PhoneFarm admin dashboard AI assistant. You help administrators manage the platform through natural language.

## CRITICAL INSTRUCTION
When the user asks for any data or action, you MUST call the appropriate tool immediately. Do NOT describe what you can do — just do it.
- "show users" / "list users" → call user_management with action=list
- "show devices" / "list devices" → call device_management with action=list
- "create user X" → call user_management with action=create
- "disable user X" → call user_management with action=disable
- "show tasks" → call task_management with action=list
- "show tenants" → call tenant_management with action=list
- "generate card keys" → call activation_management with action=generate
- "show billing plans" → call billing_management with action=list_plans
- "server status" → call system_status with action=server_health
- "show alerts" → call alert_management with action=list

## Rules
- Respond in Chinese (中文), concise and professional
- Use Markdown, prefer tables for list data
- For destructive actions (delete user, delete tenant), ask for confirmation first
- If the query is ambiguous, ask for clarification
- Timezone: Beijing (UTC+8), format YYYY-MM-DD HH:mm

## Tool availability
You have access to tools for: users, devices, tasks, tenants, card keys/activation codes, permissions, billing/credits, system config, feature flags, statistics, alerts, VLM models/episodes, audit logs, webhooks, and platform accounts.

Only say "hello" or introduce yourself if the user explicitly greets you. Otherwise, use tools to fulfill their request immediately.`;

export const ADMIN_TOOLS: AdminToolDef[] = [
  // 1. User Management
  {
    name: "user_management",
    description: "管理用户账号：列表查询、获取详情、创建、修改角色/密码、禁用/启用、删除、获取统计",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "get", "create", "update", "disable", "enable", "delete", "reset_password", "stats"], description: "操作类型" },
        userId: { type: "string", description: "用户 ID（get/update/disable/enable/delete/reset_password 时必填）" },
        username: { type: "string", description: "用户名（create 时必填，update 时可选修改）" },
        password: { type: "string", description: "登录密码（create 时必填，至少6位）" },
        newPassword: { type: "string", description: "新密码（reset_password 时必填，至少6位）" },
        phone: { type: "string", description: "手机号（create 时可选）" },
        role: { type: "string", enum: ["super_admin", "admin", "tenant_admin", "operator", "viewer"], description: "角色（create 时可选默认 operator，update 时修改角色）" },
        tenantId: { type: "string", description: "租户 ID（create/update 时可选）" },
        keyword: { type: "string", description: "搜索关键词（list 时可选，按用户名或手机号搜索）" },
        status: { type: "string", enum: ["active", "disabled", ""], description: "状态筛选（list 时可选）" },
        page: { type: "integer", description: "页码，默认 1" },
        pageSize: { type: "integer", description: "每页条数，默认 20" },
      },
      required: ["action"],
    },
  },

  // 2. Tenant Management
  {
    name: "tenant_management",
    description: "管理租户：列表查询、获取详情、创建、修改、删除",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "get", "create", "update", "delete"], description: "操作类型" },
        tenantId: { type: "string", description: "租户 ID（get/update/delete 时必填）" },
        name: { type: "string", description: "租户名称（create/update 时）" },
        slug: { type: "string", description: "URL 标识（create/update 时）" },
        domain: { type: "string", description: "自定义域名（可选）" },
        contactName: { type: "string", description: "联系人姓名" },
        contactEmail: { type: "string", description: "联系人邮箱" },
        maxDevices: { type: "integer", description: "设备上限" },
        maxUsers: { type: "integer", description: "用户上限" },
        status: { type: "string", enum: ["active", "suspended", "deleted"], description: "租户状态" },
      },
      required: ["action"],
    },
  },

  // 3. Tenant User Management
  {
    name: "tenant_user_management",
    description: "管理租户内的用户：列出用户、分配到租户、从租户移除",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "assign", "remove"], description: "操作类型" },
        tenantId: { type: "string", description: "租户 ID（必填）" },
        userId: { type: "string", description: "用户 ID（assign/remove 时必填）" },
      },
      required: ["action", "tenantId"],
    },
  },

  // 4. Permission Management
  {
    name: "permission_management",
    description: "管理权限矩阵：查看权限矩阵、更新角色权限、重置为默认",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["get_matrix", "update", "reset"], description: "操作类型" },
        role: { type: "string", description: "角色名称（update 时必填）" },
        resource: { type: "string", description: "资源名称（update 时必填）" },
        permissions: { type: "array", items: { type: "string", enum: ["read", "write", "delete", "manage"] }, description: "权限列表（update 时必填）" },
      },
      required: ["action"],
    },
  },

  // 5. Device Management
  {
    name: "device_management",
    description: "管理设备：列表查询、获取详情、发送远程命令",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "get", "send_command"], description: "操作类型" },
        deviceId: { type: "string", description: "设备 ID（get/send_command 时必填）" },
        command: { type: "string", description: "要发送的命令名称（send_command 时必填）" },
        params: { type: "object", description: "命令参数（send_command 时可选）" },
      },
      required: ["action"],
    },
  },

  // 6. Device Group Management
  {
    name: "device_group_management",
    description: "管理设备分组：列表、获取、创建、修改、删除分组",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "get", "create", "update", "delete"], description: "操作类型" },
        groupId: { type: "string", description: "分组 ID（get/update/delete 时必填）" },
        name: { type: "string", description: "分组名称（create/update 时）" },
        deviceIds: { type: "array", items: { type: "string" }, description: "设备 ID 列表（create/update 时）" },
      },
      required: ["action"],
    },
  },

  // 7. Task Management
  {
    name: "task_management",
    description: "管理任务：列表、获取、创建、修改、删除、启用、禁用",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "get", "create", "update", "delete", "enable", "disable"], description: "操作类型" },
        taskId: { type: "string", description: "任务 ID（get/update/delete/enable/disable 时必填）" },
        name: { type: "string", description: "任务名称（create/update 时）" },
        templateId: { type: "string", description: "任务模板 ID（create 时）" },
        deviceId: { type: "string", description: "指定设备 ID（create/update 时可选）" },
        accountId: { type: "string", description: "账号 ID（create/update 时可选）" },
        cronExpr: { type: "string", description: "Cron 表达式（create/update 时可选）" },
        config: { type: "object", description: "任务配置（create/update 时可选）" },
      },
      required: ["action"],
    },
  },

  // 8. Activation (Card Key) Management
  {
    name: "activation_management",
    description: "管理卡密/激活码：列表查询、批量生成、批量禁用",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "generate", "disable"], description: "操作类型" },
        planId: { type: "string", description: "套餐 ID（generate 时）" },
        count: { type: "integer", description: "生成数量（generate 时，默认 10）" },
        cardIds: { type: "array", items: { type: "string" }, description: "卡密 ID 列表（disable 时）" },
        batchId: { type: "string", description: "批次 ID（list 时可选筛选）" },
      },
      required: ["action"],
    },
  },

  // 9. Billing Management
  {
    name: "billing_management",
    description: "管理计费：查看套餐、查看订单、查看订阅、发放积分、查看定价",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list_plans", "get_orders", "get_subscription", "grant_credits", "get_pricing"], description: "操作类型" },
        userId: { type: "string", description: "用户 ID（grant_credits 时必填）" },
        amount: { type: "integer", description: "积分数量（grant_credits 时必填）" },
        note: { type: "string", description: "备注（grant_credits 时可选）" },
      },
      required: ["action"],
    },
  },

  // 10. Config Management
  {
    name: "config_management",
    description: "管理系统配置：获取、修改、重载配置；查看/切换功能开关",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["get", "update", "reload", "list_feature_flags", "toggle_feature_flag"], description: "操作类型" },
        key: { type: "string", description: "配置键名（update/toggle_feature_flag 时必填）" },
        value: { type: "string", description: "配置值（update 时必填）；toggle 时传 'true' 或 'false'" },
      },
      required: ["action"],
    },
  },

  // 11. System Status
  {
    name: "system_status",
    description: "查看系统状态：基础设施状态、服务器健康、任务队列统计",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["infra", "server_health", "queue_stats"], description: "查询类型" },
      },
      required: ["action"],
    },
  },

  // 12. Stats Management
  {
    name: "stats_management",
    description: "查看统计信息：VLM 用量、设备使用率、系统概览",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["vlm_usage", "device_usage", "summary"], description: "统计类型" },
      },
      required: ["action"],
    },
  },

  // 13. Alert Management
  {
    name: "alert_management",
    description: "管理告警规则：列表、获取、创建、修改、删除、启用/禁用",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "get", "create", "update", "delete", "toggle"], description: "操作类型" },
        ruleId: { type: "string", description: "规则 ID（get/update/delete/toggle 时必填）" },
        name: { type: "string", description: "规则名称（create/update 时）" },
        alertType: { type: "string", enum: ["device_offline", "task_failure", "battery_low", "error_rate", "custom"], description: "告警类型" },
        conditions: { type: "object", description: "触发条件（任意 JSON 对象）" },
        channels: { type: "array", items: { type: "string" }, description: "通知渠道列表" },
      },
      required: ["action"],
    },
  },

  // 14. VLM Management
  {
    name: "vlm_management",
    description: "管理 VLM AI：查看剧集列表、查看模型配置、测试模型连接",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list_episodes", "list_models", "test_model"], description: "操作类型" },
        modelId: { type: "string", description: "模型 ID（test_model 时必填）" },
        deviceId: { type: "string", description: "设备 ID 筛选（list_episodes 时可选）" },
        status: { type: "string", description: "状态筛选（list_episodes 时可选）" },
      },
      required: ["action"],
    },
  },

  // 15. Audit Log Management
  {
    name: "audit_management",
    description: "查询审计日志：按时间、用户、操作类型筛选",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["query_logs"], description: "操作类型" },
        userId: { type: "string", description: "用户 ID 筛选（可选）" },
        operation: { type: "string", description: "操作类型筛选（可选）" },
        limit: { type: "integer", description: "返回条数，默认 50" },
      },
      required: ["action"],
    },
  },

  // 16. Platform Account Management
  {
    name: "platform_account_management",
    description: "管理平台账号（社交媒体账号）：列表、获取详情",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "get"], description: "操作类型" },
        accountId: { type: "string", description: "账号 ID（get 时必填）" },
      },
      required: ["action"],
    },
  },

  // 17. Credit Management
  {
    name: "credit_management",
    description: "管理积分：查看积分概览、查询用户余额、手动发放、查看交易记录",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["overview", "balance", "grant", "transactions"], description: "操作类型" },
        userId: { type: "string", description: "用户 ID（grant/balance 时必填）" },
        userIds: { type: "array", items: { type: "string" }, description: "用户 ID 列表（balance 时可选，批量查询最多 200）" },
        amount: { type: "integer", description: "积分数量（grant 时必填）" },
        note: { type: "string", description: "备注说明" },
      },
      required: ["action"],
    },
  },

  // 18. Agent Management
  {
    name: "agent_management",
    description: "管理代理商/分销商：列表、创建、查看佣金",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "create", "commissions"], description: "操作类型" },
        name: { type: "string", description: "代理商名称（create 时必填）" },
        contactEmail: { type: "string", description: "联系邮箱" },
        commissionRate: { type: "number", description: "佣金比例（0-1）" },
      },
      required: ["action"],
    },
  },

  // 19. Webhook Management
  {
    name: "webhook_management",
    description: "管理 Webhook：列表、创建（name+url 必填）、删除、测试发送",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "create", "delete", "test"], description: "操作类型" },
        webhookId: { type: "string", description: "Webhook ID（delete/test 时必填）" },
        name: { type: "string", description: "Webhook 名称（create 时必填）" },
        url: { type: "string", description: "Webhook URL（create 时必填）" },
        events: { type: "array", items: { type: "string" }, description: "监听事件列表（create 时可选）" },
        secret: { type: "string", description: "签名密钥（create 时可选）" },
      },
      required: ["action"],
    },
  },

  // 20. Plan & Subscription Management
  {
    name: "account_management",
    description: "查看平台账号列表和详情（社交媒体平台账号）",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "get"], description: "操作类型" },
        accountId: { type: "string", description: "账号 ID（get 时必填）" },
      },
      required: ["action"],
    },
  },
];
