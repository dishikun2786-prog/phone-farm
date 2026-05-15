/**
 * PhoneFarm RBAC — Role-Based Access Control.
 *
 * Roles: super_admin > admin > operator > viewer
 *
 * Permission matrix defines which roles can access which resources.
 * Admin Dashboard menu visibility is derived from role permissions.
 */

export type Role = "super_admin" | "admin" | "tenant_admin" | "operator" | "viewer" | "customer" | "agent";

export const ROLES: string[] = ["super_admin", "admin", "tenant_admin", "operator", "viewer", "customer", "agent"];

export type Resource =
  | "devices"
  | "device_groups"
  | "tasks"
  | "task_templates"
  | "accounts"
  | "users"
  | "activation"
  | "vlm"
  | "vlm_episodes"
  | "vlm_scripts"
  | "plugins"
  | "models"
  | "audit_logs"
  | "alerts"
  | "webhooks"
  | "api_keys"
  | "stats"
  | "platform_accounts"
  | "system"
  | "config"
  | "tenants"
  | "billing";

export type Action = "read" | "write" | "delete" | "manage";

export const RESOURCES: string[] = [
  "devices", "device_groups", "tasks", "task_templates", "accounts", "users",
  "activation", "vlm", "vlm_episodes", "vlm_scripts", "plugins", "models",
  "audit_logs", "alerts", "webhooks", "api_keys", "stats", "platform_accounts",
  "system", "config", "tenants", "billing",
];

export const ACTIONS: string[] = ["read", "write", "delete", "manage"];

/** Permission matrix: role → resource → allowed actions */
export const PERMISSIONS: Record<Role, Partial<Record<Resource, Action[]>>> = {
  super_admin: {
    devices: ["read", "write", "delete", "manage"],
    device_groups: ["read", "write", "delete", "manage"],
    tasks: ["read", "write", "delete", "manage"],
    task_templates: ["read", "write", "delete", "manage"],
    accounts: ["read", "write", "delete", "manage"],
    users: ["read", "write", "delete", "manage"],
    activation: ["read", "write", "delete", "manage"],
    vlm: ["read", "write", "delete", "manage"],
    vlm_episodes: ["read", "write", "delete", "manage"],
    vlm_scripts: ["read", "write", "delete", "manage"],
    plugins: ["read", "write", "delete", "manage"],
    models: ["read", "write", "delete", "manage"],
    audit_logs: ["read", "manage"],
    alerts: ["read", "write", "delete", "manage"],
    webhooks: ["read", "write", "delete", "manage"],
    api_keys: ["read", "write", "delete", "manage"],
    stats: ["read"],
    platform_accounts: ["read", "write", "delete", "manage"],
    system: ["read", "manage"],
    config: ["read", "write", "manage"],
    tenants: ["read", "write", "delete", "manage"],
    billing: ["read", "write", "delete", "manage"],
  },
  admin: {
    devices: ["read", "write", "manage"],
    device_groups: ["read", "write", "manage"],
    tasks: ["read", "write", "manage"],
    task_templates: ["read", "write", "manage"],
    accounts: ["read", "write", "delete", "manage"],
    users: ["read"],
    activation: ["read", "write", "manage"],
    vlm: ["read", "write"],
    vlm_episodes: ["read"],
    vlm_scripts: ["read", "write"],
    plugins: ["read", "write"],
    models: ["read", "write"],
    audit_logs: ["read"],
    alerts: ["read", "write"],
    webhooks: ["read"],
    api_keys: ["read"],
    stats: ["read"],
    platform_accounts: ["read", "write", "manage"],
    system: ["read"],
    config: ["read", "write"],
    tenants: [],
    billing: ["read", "write"],
  },
  tenant_admin: {
    devices: ["read", "write", "manage"],
    device_groups: ["read", "write", "manage"],
    tasks: ["read", "write", "manage"],
    task_templates: ["read", "write"],
    accounts: ["read", "write", "manage"],
    users: ["read", "write", "manage"],
    activation: ["read", "write"],
    vlm: ["read", "write"],
    vlm_episodes: ["read"],
    vlm_scripts: ["read", "write"],
    plugins: ["read", "write"],
    models: ["read"],
    audit_logs: ["read"],
    alerts: ["read", "write"],
    webhooks: [],
    api_keys: ["read", "write"],
    stats: ["read"],
    platform_accounts: ["read", "write"],
    system: [],
    config: ["read"],
    tenants: [],
    billing: ["read"],
  },
  operator: {
    devices: ["read", "write"],
    device_groups: ["read"],
    tasks: ["read", "write"],
    task_templates: ["read"],
    accounts: ["read", "write"],
    users: [],
    activation: ["read"],
    vlm: ["read"],
    vlm_episodes: ["read"],
    vlm_scripts: ["read"],
    plugins: ["read"],
    models: [],
    audit_logs: [],
    alerts: ["read"],
    webhooks: [],
    api_keys: [],
    stats: ["read"],
    platform_accounts: ["read", "write"],
    system: [],
    config: ["read"],
  },
  viewer: {
    devices: ["read"],
    device_groups: ["read"],
    tasks: ["read"],
    task_templates: ["read"],
    accounts: ["read"],
    users: [],
    activation: [],
    vlm: ["read"],
    vlm_episodes: ["read"],
    vlm_scripts: ["read"],
    plugins: [],
    models: [],
    audit_logs: [],
    alerts: ["read"],
    webhooks: [],
    api_keys: [],
    stats: ["read"],
    platform_accounts: ["read"],
    system: [],
    config: ["read"],
  },
  customer: {
    devices: ["read", "write"],
    device_groups: ["read"],
    tasks: ["read", "write"],
    task_templates: ["read"],
    accounts: ["read", "write"],
    users: [],
    activation: ["read"],
    vlm: ["read", "write"],
    vlm_episodes: ["read"],
    vlm_scripts: ["read"],
    plugins: [],
    models: [],
    audit_logs: [],
    alerts: ["read"],
    webhooks: [],
    api_keys: ["read", "write"],
    stats: ["read"],
    platform_accounts: ["read", "write"],
    system: [],
    config: ["read"],
    tenants: [],
    billing: ["read", "write"],
  },
  agent: {
    devices: ["read"],
    device_groups: ["read"],
    tasks: ["read"],
    task_templates: ["read"],
    accounts: ["read"],
    users: [],
    activation: ["read", "write"],
    vlm: ["read"],
    vlm_episodes: ["read"],
    vlm_scripts: [],
    plugins: [],
    models: [],
    audit_logs: [],
    alerts: [],
    webhooks: [],
    api_keys: [],
    stats: ["read"],
    platform_accounts: [],
    system: [],
    config: [],
  },
};

// ── DB override cache ──
let dbOverrides: Record<string, Record<string, string[]>> | null = null;

/** Reload permission overrides from the database */
export async function reloadPermissions(): Promise<void> {
  try {
    // Dynamic import to avoid circular dependency
    const { db } = await import('../db.js');
    const { rolePermissions } = await import('../schema.js');
    const { isNull } = await import('drizzle-orm');

    const rows = await db
      .select()
      .from(rolePermissions)
      .where(isNull(rolePermissions.tenantId));

    const map: Record<string, Record<string, string[]>> = {};
    for (const row of rows) {
      if (!map[row.role]) map[row.role] = {};
      map[row.role][row.resource] = row.actions;
    }
    dbOverrides = map;
  } catch {
    // DB might not be ready during startup — that's ok, use defaults
    dbOverrides = null;
  }
}

/** Check if a role has permission to perform an action on a resource */
export function hasPermission(role: Role, resource: Resource, action: Action): boolean {
  // Check DB overrides first
  const overrideActions = dbOverrides?.[role]?.[resource];
  if (overrideActions !== undefined) {
    return overrideActions.includes(action) || overrideActions.includes('manage');
  }
  // Fall back to hardcoded defaults
  const resourcePermissions = PERMISSIONS[role]?.[resource];
  if (!resourcePermissions) return false;
  return resourcePermissions.includes(action) || resourcePermissions.includes('manage');
}

/** Get all resources a role can access (for menu rendering) */
export function getAccessibleResources(role: Role): Resource[] {
  const entries = PERMISSIONS[role];
  if (!entries) return [];
  return Object.entries(entries)
    .filter(([_, actions]) => actions && actions.length > 0)
    .map(([resource]) => resource as Resource);
}

/** Admin menu items keyed by resource, with display labels */
export const ADMIN_MENU_ITEMS: Record<Resource, { label: string; icon: string; path: string }> = {
  devices: { label: "设备管理", icon: "smartphone", path: "/devices" },
  device_groups: { label: "设备分组", icon: "folder", path: "/device-groups" },
  tasks: { label: "任务管理", icon: "play-circle", path: "/tasks" },
  task_templates: { label: "任务模板", icon: "file-text", path: "/templates" },
  accounts: { label: "账号管理", icon: "users", path: "/accounts" },
  users: { label: "用户管理", icon: "shield", path: "/users" },
  activation: { label: "卡密管理", icon: "key", path: "/activation" },
  vlm: { label: "VLM 配置", icon: "cpu", path: "/vlm" },
  vlm_episodes: { label: "VLM 记录", icon: "video", path: "/vlm-episodes" },
  vlm_scripts: { label: "VLM 脚本", icon: "code", path: "/vlm-scripts" },
  plugins: { label: "插件管理", icon: "package", path: "/plugins" },
  models: { label: "模型管理", icon: "box", path: "/models" },
  audit_logs: { label: "审计日志", icon: "clipboard", path: "/audit-logs" },
  alerts: { label: "告警规则", icon: "bell", path: "/alerts" },
  webhooks: { label: "Webhook", icon: "link", path: "/webhooks" },
  api_keys: { label: "API Key", icon: "lock", path: "/api-keys" },
  stats: { label: "用量统计", icon: "bar-chart", path: "/stats" },
  platform_accounts: { label: "平台账号", icon: "at-sign", path: "/platform-accounts" },
  system: { label: "系统设置", icon: "settings", path: "/system" },
  config: { label: "配置管理", icon: "sliders", path: "/config" },
  tenants: { label: "租户管理", icon: "building", path: "/admin/tenants" },
  billing: { label: "计费管理", icon: "credit-card", path: "/admin/billing" },
};

/** Build the visible menu tree for a given role */
export function buildMenuForRole(role: Role): Array<{ label: string; icon: string; path: string }> {
  const resources = getAccessibleResources(role);
  return resources
    .filter((r) => r in ADMIN_MENU_ITEMS)
    .map((r) => ADMIN_MENU_ITEMS[r]);
}

/** Fastify preHandler middleware — require specific permission */
export function requirePermission(resource: Resource, action: Action) {
  return async (req: any, reply: any) => {
    const role = req.user?.role as Role | undefined;
    if (!role || !hasPermission(role, resource, action)) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
  };
}
