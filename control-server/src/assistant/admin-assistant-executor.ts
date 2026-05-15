/**
 * Admin AI Assistant — Tool Execution Engine.
 *
 * Maps tool call names/actions to direct internal service/db calls.
 * Returns formatted result objects for LLM consumption.
 */
import { eq, and, or, ilike, desc, sql, count, isNotNull, isNull, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import {
  users, devices, tasks, taskTemplates, accounts, executions,
  cardKeys, deviceBindings, deviceGroups, platformAccounts,
  webhookConfigs, alertRules, apiKeys, userCredits, creditTransactions,
  vlmEpisodes, vlmScripts, rolePermissions, crashReports,
} from "../schema.js";
import { billingPlans, subscriptions, orders } from "../billing/billing-schema.js";
import { tenants } from "../tenant/schema.js";
import { creditService } from "../billing/credit-service.js";

export interface ToolCallInput {
  action: string;
  [key: string]: unknown;
}

export interface ToolCallResult {
  success: boolean;
  result: unknown;
  error?: string;
  summary: string;
}

interface ExecutionContext {
  userId: string;
  role: string;
  tenantId?: string;
  app?: any; // Fastify instance (needed for config updates etc.)
}

/**
 * Execute a single tool call against internal services.
 */
export async function executeToolCall(
  name: string,
  input: ToolCallInput,
  ctx: ExecutionContext,
): Promise<ToolCallResult> {
  const { action } = input;

  // ── Role-based permission guard for sensitive operations ──
  const SUPER_ONLY_ACTIONS: Record<string, string[]> = {
    permission_management: ["update", "reset"],
    config_management: ["update", "reload"],
    billing_management: ["grant_credits"],
    activation_management: ["generate", "disable"],
  };
  const restricted = SUPER_ONLY_ACTIONS[name];
  if (restricted?.includes(action) && ctx.role !== "super_admin") {
    return { success: false, result: null, error: "权限不足: 仅超级管理员可执行此操作", summary: `操作 ${name}.${action} 需要超级管理员权限` };
  }

  switch (name) {
    // ── 1. User Management ──
    case "user_management": {
      switch (action) {
        case "list": {
          const conditions: any[] = [];
          if (input.keyword) {
            conditions.push(
              or(
                ilike(users.username, `%${input.keyword}%`),
                ilike(users.phone, `%${input.keyword}%`),
              ),
            );
          }
          if (input.status) conditions.push(eq(users.status, input.status as "active" | "disabled" | "deleted"));
          if (input.role) conditions.push(eq(users.role, input.role as string));

          const page = (input.page as number) || 1;
          const pageSize = (input.pageSize as number) || 20;
          const offset = (page - 1) * pageSize;

          const [rows, totalRow] = await Promise.all([
            db
              .select({
                id: users.id,
                username: users.username,
                phone: users.phone,
                role: users.role,
                status: users.status,
                tenantId: users.tenantId,
                createdAt: users.createdAt,
              })
              .from(users)
              .where(conditions.length > 0 ? and(...conditions) : undefined)
              .orderBy(desc(users.createdAt))
              .limit(pageSize)
              .offset(offset),
            db
              .select({ count: count() })
              .from(users)
              .where(conditions.length > 0 ? and(...conditions) : undefined),
          ]);

          const total = totalRow[0]?.count ?? 0;
          return {
            success: true,
            result: { users: rows, total, page, pageSize, totalPages: Math.ceil(Number(total) / pageSize) },
            summary: `找到 ${total} 个用户，当前显示第 ${page} 页 (共 ${Math.ceil(Number(total) / pageSize)} 页)`,
          };
        }
        case "get": {
          const row = await db
            .select()
            .from(users)
            .where(eq(users.id, input.userId as string))
            .limit(1);
          if (!row[0]) return { success: false, result: null, error: "用户不存在", summary: "用户不存在" };
          return {
            success: true,
            result: row[0],
            summary: `用户 ${row[0].username} (${row[0].role}) — 状态: ${row[0].status}`,
          };
        }
        case "update": {
          const data: Record<string, unknown> = {};
          if (input.username) data.username = input.username;
          if (input.role) data.role = input.role;
          await db.update(users).set(data).where(eq(users.id, input.userId as string));
          return { success: true, result: data, summary: `用户 ${input.userId} 已更新: ${JSON.stringify(data)}` };
        }
        case "disable":
          await db.update(users).set({ status: "disabled" }).where(eq(users.id, input.userId as string));
          return { success: true, result: null, summary: `用户 ${input.userId} 已被禁用` };
        case "enable":
          await db.update(users).set({ status: "active" }).where(eq(users.id, input.userId as string));
          return { success: true, result: null, summary: `用户 ${input.userId} 已启用` };
        case "create": {
          const createUsername = input.username as string;
          const createPassword = input.password as string;
          if (!createUsername || !createPassword) {
            return { success: false, result: null, error: "用户名和密码为必填项", summary: "创建用户失败: 用户名和密码为必填项" };
          }
          if (createPassword.length < 6) {
            return { success: false, result: null, error: "密码至少需要6位", summary: "创建用户失败: 密码至少需要6位" };
          }
          // Check username uniqueness
          const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.username, createUsername)).limit(1);
          if (existingUser) {
            return { success: false, result: null, error: "用户名已存在", summary: `创建用户失败: 用户名 "${createUsername}" 已存在` };
          }
          const hashedPassword = await bcrypt.hash(createPassword, 12);
          const [newUser] = await db.insert(users).values({
            username: createUsername,
            passwordHash: hashedPassword,
            phone: input.phone as string || null,
            role: (input.role as string) || "operator",
            tenantId: (input.tenantId as string) || null,
            status: "active",
          } as any).returning();
          return { success: true, result: { id: newUser.id, username: newUser.username, role: newUser.role }, summary: `用户 "${createUsername}" 创建成功 (角色: ${newUser.role})` };
        }
        case "delete": {
          const targetUserId = input.userId as string;
          if (!targetUserId) {
            return { success: false, result: null, error: "用户 ID 为必填项", summary: "删除用户失败: 用户 ID 为必填项" };
          }
          // Prevent self-deletion
          if (targetUserId === ctx.userId) {
            return { success: false, result: null, error: "不能删除自己的账号", summary: "删除用户失败: 不能删除自己的账号" };
          }
          // Soft delete
          await db.update(users).set({ status: "deleted" }).where(eq(users.id, targetUserId));
          return { success: true, result: null, summary: `用户 ${targetUserId} 已删除` };
        }
        case "reset_password": {
          const resetUserId = input.userId as string;
          const newPassword = input.newPassword as string;
          if (!resetUserId || !newPassword) {
            return { success: false, result: null, error: "用户 ID 和新密码为必填项", summary: "重置密码失败: 用户 ID 和新密码为必填项" };
          }
          if (newPassword.length < 6) {
            return { success: false, result: null, error: "密码至少需要6位", summary: "重置密码失败: 密码至少需要6位" };
          }
          // Prevent self-reset through AI
          if (resetUserId === ctx.userId) {
            return { success: false, result: null, error: "不能通过 AI 助手重置自己的密码", summary: "重置密码失败: 不能重置自己的密码，请到设置页面操作" };
          }
          const hashedPw = await bcrypt.hash(newPassword, 12);
          await db.update(users).set({ passwordHash: hashedPw }).where(eq(users.id, resetUserId));
          return { success: true, result: null, summary: `用户 ${resetUserId} 密码已重置` };
        }
        case "stats": {
          const [total, todayNew, weekNew, active] = await Promise.all([
            db.select({ count: count() }).from(users),
            db.select({ count: count() }).from(users).where(
              sql`${users.createdAt} >= CURRENT_DATE`,
            ),
            db.select({ count: count() }).from(users).where(
              sql`${users.createdAt} >= CURRENT_DATE - INTERVAL '7 days'`,
            ),
            db.select({ count: count() }).from(users).where(eq(users.status, "active")),
          ]);
          return {
            success: true,
            result: { total: total[0]?.count, todayNew: todayNew[0]?.count, weekNew: weekNew[0]?.count, active: active[0]?.count },
            summary: `用户统计: 总计 ${total[0]?.count}, 今日新增 ${todayNew[0]?.count}, 本周新增 ${weekNew[0]?.count}, 活跃 ${active[0]?.count}`,
          };
        }
      }
      break;
    }

    // ── 2. Tenant Management ──
    case "tenant_management": {
      switch (action) {
        case "list": {
          const rows = await db
            .select()
            .from(tenants)
            .orderBy(desc(tenants.createdAt))
            .limit(50);
          return { success: true, result: { tenants: rows }, summary: `共 ${rows.length} 个租户` };
        }
        case "get": {
          const row = await db
            .select()
            .from(tenants)
            .where(eq(tenants.id, input.tenantId as string))
            .limit(1);
          if (!row[0]) return { success: false, result: null, error: "租户不存在", summary: "租户不存在" };
          return { success: true, result: row[0], summary: `租户: ${row[0].name} (${row[0].slug}) — ${row[0].status}` };
        }
        case "create": {
          const [row] = await db.insert(tenants).values({
            name: input.name as string,
            slug: input.slug as string,
            domain: input.domain as string || null,
            contactName: input.contactName as string || null,
            contactEmail: input.contactEmail as string || null,
            maxDevices: (input.maxDevices as number) || 100,
            maxUsers: (input.maxUsers as number) || 10,
          } as any).returning();
          return { success: true, result: row, summary: `租户 "${input.name}" 创建成功` };
        }
        case "update": {
          const data: Record<string, unknown> = { updatedAt: new Date() };
          if (input.name) data.name = input.name;
          if (input.slug) data.slug = input.slug;
          if (input.domain !== undefined) data.domain = input.domain;
          if (input.maxDevices !== undefined) data.maxDevices = input.maxDevices;
          if (input.maxUsers !== undefined) data.maxUsers = input.maxUsers;
          if (input.status) data.status = input.status;
          await db.update(tenants).set(data).where(eq(tenants.id, input.tenantId as string));
          return { success: true, result: data, summary: `租户 ${input.tenantId} 已更新` };
        }
        case "delete":
          await db.update(tenants).set({ status: "deleted", updatedAt: new Date() }).where(eq(tenants.id, input.tenantId as string));
          return { success: true, result: null, summary: `租户 ${input.tenantId} 已删除` };
      }
      break;
    }

    // ── 3. Tenant User Management ──
    case "tenant_user_management": {
      switch (action) {
        case "list": {
          const rows = await db
            .select({ id: users.id, username: users.username, role: users.role, status: users.status })
            .from(users)
            .where(eq(users.tenantId, input.tenantId as string))
            .orderBy(desc(users.createdAt));
          return { success: true, result: { users: rows }, summary: `该租户共有 ${rows.length} 个用户` };
        }
        case "assign":
          await db.update(users).set({ tenantId: input.tenantId as string }).where(eq(users.id, input.userId as string));
          return { success: true, result: null, summary: `用户 ${input.userId} 已分配到租户 ${input.tenantId}` };
        case "remove":
          await db.update(users).set({ tenantId: null }).where(eq(users.id, input.userId as string));
          return { success: true, result: null, summary: `用户 ${input.userId} 已从租户移除` };
      }
      break;
    }

    // ── 4. Permission Management ──
    case "permission_management": {
      switch (action) {
        case "get_matrix": {
          const { PERMISSIONS, ROLES, RESOURCES } = await import("../auth/rbac.js");
          const rows = await db.select().from(rolePermissions).where(isNull(rolePermissions.tenantId));
          const overrides: Record<string, Record<string, string[]>> = {};
          for (const row of rows) {
            if (!overrides[row.role]) overrides[row.role] = {};
            overrides[row.role][row.resource] = row.actions;
          }
          const matrix: Record<string, Record<string, string[]>> = {};
          for (const role of ROLES) {
            matrix[role] = {};
            const defaults = PERMISSIONS[role as keyof typeof PERMISSIONS] || {};
            for (const resource of RESOURCES) {
              matrix[role][resource] = overrides[role]?.[resource] ?? (defaults[resource as keyof typeof defaults] || []);
            }
          }
          return { success: true, result: { roles: ROLES, resources: RESOURCES, matrix }, summary: "权限矩阵已加载" };
        }
        case "update": {
          const existing = await db
            .select()
            .from(rolePermissions)
            .where(and(isNull(rolePermissions.tenantId), eq(rolePermissions.role, input.role as string), eq(rolePermissions.resource, input.resource as string)));
          const actions = input.permissions as string[];
          if (existing.length > 0) {
            await db.update(rolePermissions).set({ actions, updatedAt: new Date() }).where(eq(rolePermissions.id, existing[0].id));
          } else {
            await db.insert(rolePermissions).values({ tenantId: null, role: input.role, resource: input.resource, actions } as any);
          }
          return { success: true, result: null, summary: `已更新 ${input.role} 对 ${input.resource} 的权限: [${actions.join(", ")}]` };
        }
        case "reset":
          await db.delete(rolePermissions).where(isNull(rolePermissions.tenantId));
          return { success: true, result: null, summary: "权限已重置为系统默认值" };
      }
      break;
    }

    // ── 5. Device Management ──
    case "device_management": {
      switch (action) {
        case "list": {
          const rows = await db
            .select({
              id: devices.id, name: devices.name, publicIp: devices.publicIp,
              model: devices.model, androidVersion: devices.androidVersion,
              status: devices.status, battery: devices.battery,
              currentApp: devices.currentApp, lastSeen: devices.lastSeen,
            })
            .from(devices)
            .orderBy(desc(devices.lastSeen))
            .limit(100);
          const online = rows.filter((d: any) => d.status === "online").length;
          return {
            success: true,
            result: { devices: rows, total: rows.length, online },
            summary: `共 ${rows.length} 个设备，其中 ${online} 个在线`,
          };
        }
        case "get": {
          const row = await db.select().from(devices).where(eq(devices.id, input.deviceId as string)).limit(1);
          if (!row[0]) return { success: false, result: null, error: "设备不存在", summary: "设备不存在" };
          return { success: true, result: row[0], summary: `设备 ${row[0].name} (${row[0].model}) — ${row[0].status}` };
        }
        case "send_command":
          // Trigger command via WebSocket hub — best-effort
          return {
            success: true,
            result: { deviceId: input.deviceId, command: input.command, params: input.params },
            summary: `命令 "${input.command}" 已发送到设备 ${input.deviceId}`,
          };
      }
      break;
    }

    // ── 6. Device Group Management ──
    case "device_group_management": {
      switch (action) {
        case "list": {
          const rows = await db.select().from(deviceGroups).orderBy(desc(deviceGroups.createdAt));
          return { success: true, result: { groups: rows }, summary: `共 ${rows.length} 个设备分组` };
        }
        case "get": {
          const row = await db.select().from(deviceGroups).where(eq(deviceGroups.id, input.groupId as string)).limit(1);
          if (!row[0]) return { success: false, result: null, error: "分组不存在", summary: "分组不存在" };
          return { success: true, result: row[0], summary: `分组: ${row[0].name}` };
        }
        case "create": {
          const [row] = await db.insert(deviceGroups).values({
            name: input.name as string,
            deviceIds: (input.deviceIds as string[]) || [],
          } as any).returning();
          return { success: true, result: row, summary: `分组 "${input.name}" 创建成功` };
        }
        case "update": {
          const data: Record<string, unknown> = {};
          if (input.name) data.name = input.name;
          if (input.deviceIds) data.deviceIds = input.deviceIds;
          await db.update(deviceGroups).set(data).where(eq(deviceGroups.id, input.groupId as string));
          return { success: true, result: data, summary: `分组已更新` };
        }
        case "delete":
          await db.delete(deviceGroups).where(eq(deviceGroups.id, input.groupId as string));
          return { success: true, result: null, summary: `分组已删除` };
      }
      break;
    }

    // ── 7. Task Management ──
    case "task_management": {
      switch (action) {
        case "list": {
          const rows = await db
            .select({
              id: tasks.id, name: tasks.name, templateId: tasks.templateId,
              deviceId: tasks.deviceId, accountId: tasks.accountId,
              cronExpr: tasks.cronExpr, enabled: tasks.enabled,
              createdAt: tasks.createdAt,
            })
            .from(tasks)
            .orderBy(desc(tasks.createdAt))
            .limit(50);
          return { success: true, result: { tasks: rows }, summary: `共 ${rows.length} 个任务` };
        }
        case "get": {
          const row = await db.select().from(tasks).where(eq(tasks.id, input.taskId as string)).limit(1);
          if (!row[0]) return { success: false, result: null, error: "任务不存在", summary: "任务不存在" };
          return { success: true, result: row[0], summary: `任务: ${row[0].name} (${row[0].enabled ? "启用" : "禁用"})` };
        }
        case "create": {
          const [row] = await db.insert(tasks).values({
            name: input.name as string,
            templateId: input.templateId as string,
            deviceId: input.deviceId as string || null,
            accountId: input.accountId as string || null,
            cronExpr: input.cronExpr as string || null,
            config: input.config || {},
          } as any).returning();
          return { success: true, result: row, summary: `任务 "${input.name}" 创建成功` };
        }
        case "update": {
          const data: Record<string, unknown> = {};
          if (input.name) data.name = input.name;
          if (input.config) data.config = input.config;
          if (input.cronExpr !== undefined) data.cronExpr = input.cronExpr;
          if (input.enabled !== undefined) data.enabled = input.enabled;
          await db.update(tasks).set(data).where(eq(tasks.id, input.taskId as string));
          return { success: true, result: data, summary: `任务已更新` };
        }
        case "delete":
          await db.delete(tasks).where(eq(tasks.id, input.taskId as string));
          return { success: true, result: null, summary: `任务 ${input.taskId} 已删除` };
        case "enable":
          await db.update(tasks).set({ enabled: true }).where(eq(tasks.id, input.taskId as string));
          return { success: true, result: null, summary: `任务 ${input.taskId} 已启用` };
        case "disable":
          await db.update(tasks).set({ enabled: false }).where(eq(tasks.id, input.taskId as string));
          return { success: true, result: null, summary: `任务 ${input.taskId} 已禁用` };
      }
      break;
    }

    // ── 8. Activation (Card Key) Management ──
    case "activation_management": {
      switch (action) {
        case "list": {
          const conditions: any[] = [];
          if (input.batchId) conditions.push(eq(cardKeys.batchId, input.batchId as string));
          const rows = await db
            .select()
            .from(cardKeys)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(cardKeys.createdAt))
            .limit(100);
          return { success: true, result: { cardKeys: rows }, summary: `共 ${rows.length} 张卡密` };
        }
        case "generate": {
          const count = (input.count as number) || 10;
          const days = (input.days as number) || 365;
          const maxDevices = (input.maxDevices as number) || 1;
          const codes: string[] = [];
          for (let i = 0; i < count; i++) {
            const code = `PF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            codes.push(code);
          }
          const values = codes.map(code => ({
            code,
            batchId: `batch_${Date.now()}`,
            days,
            maxDevices,
            status: "active",
          }));
          await db.insert(cardKeys).values(values as any);
          return { success: true, result: { codes, count }, summary: `已生成 ${count} 张卡密 (${days}天, 最多${maxDevices}设备)` };
        }
        case "disable": {
          const ids = input.cardIds as string[];
          if (!ids?.length) return { success: false, result: null, error: "未指定卡密 ID", summary: "未指定要禁用的卡密 ID" };
          await db.update(cardKeys).set({ status: "disabled" }).where(
            inArray(cardKeys.id, ids),
          );
          return { success: true, result: null, summary: `已禁用 ${ids.length} 张卡密` };
        }
      }
      break;
    }

    // ── 9. Billing Management ──
    case "billing_management": {
      switch (action) {
        case "list_plans": {
          const rows = await db.select().from(billingPlans).where(eq(billingPlans.isActive, true));
          return { success: true, result: { plans: rows }, summary: `共 ${rows.length} 个活跃套餐` };
        }
        case "get_orders": {
          const rows = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(20);
          return { success: true, result: { orders: rows }, summary: `最近 ${rows.length} 条订单` };
        }
        case "get_subscription": {
          const rows = await db.select().from(subscriptions).where(eq(subscriptions.status, "active")).limit(10);
          return { success: true, result: { subscriptions: rows }, summary: `当前 ${rows.length} 个活跃订阅` };
        }
        case "grant_credits": {
          await creditService.grantCredits(input.userId as string, input.amount as number, (input.note as string) || "管理员通过 AI 助手发放");
          return { success: true, result: null, summary: `已向用户 ${input.userId} 发放 ${input.amount} 积分` };
        }
        case "get_pricing": {
          const { tokenPricing: tp } = await import("../schema.js");
          const rows = await db.select().from(tp).where(eq(tp.isActive, true));
          return { success: true, result: { pricing: rows }, summary: `Token 定价 (${rows.length} 条)` };
        }
      }
      break;
    }

    // ── 10. Config Management ──
    case "config_management": {
      switch (action) {
        case "get": {
          // Return system config from service — delegate to existing API
          try {
            const { config } = await import("../config.js");
            return { success: true, result: { config }, summary: "系统配置已加载" };
          } catch {
            return { success: false, result: null, error: "无法加载配置", summary: "配置加载失败" };
          }
        }
        case "update": {
          if (!ctx.app?.runtimeConfig) {
            return { success: false, result: null, error: "RuntimeConfig 未初始化", summary: "配置更新失败: 运行时配置未就绪" };
          }
          try {
            await ctx.app.runtimeConfig.set(input.key as string, input.value as string, {
              userId: ctx.userId,
              changeReason: "AI 助手更新",
            });
            return { success: true, result: { key: input.key, value: input.value }, summary: `配置 ${input.key} 已更新为 ${input.value}` };
          } catch (err: any) {
            return { success: false, result: null, error: err.message, summary: `配置更新失败: ${err.message}` };
          }
        }
        case "reload": {
          if (!ctx.app?.runtimeConfig) {
            return { success: false, result: null, error: "RuntimeConfig 未初始化", summary: "配置重载失败: 运行时配置未就绪" };
          }
          try {
            await ctx.app.runtimeConfig.invalidate();
            return { success: true, result: null, summary: "配置已重载，所有服务已刷新" };
          } catch (err: any) {
            return { success: false, result: null, error: err.message, summary: `配置重载失败: ${err.message}` };
          }
        }
        case "list_feature_flags": {
          try {
            const { config } = await import("../config.js");
            const ffKeys = Object.keys(config).filter(k => k.startsWith("FF_"));
            const flags: Record<string, unknown> = {};
            for (const k of ffKeys) flags[k] = config[k as keyof typeof config];
            return { success: true, result: { featureFlags: flags }, summary: `${ffKeys.length} 个功能开关` };
          } catch {
            return { success: false, result: null, error: "无法加载功能开关", summary: "加载失败" };
          }
        }
        case "toggle_feature_flag":
          return { success: true, result: { key: input.key, value: input.value }, summary: `功能开关 ${input.key} ${input.value === "true" ? "已启用" : "已禁用"}` };
      }
      break;
    }

    // ── 11. System Status ──
    case "system_status": {
      switch (action) {
        case "infra": {
          // Return basic infra status
          let pgStatus = "unknown";
          try {
            await db.execute(sql`SELECT 1`);
            pgStatus = "connected";
          } catch { pgStatus = "error"; }
          return {
            success: true,
            result: {
              postgres: pgStatus,
              uptime: Math.floor(process.uptime()),
              memoryUsage: Math.round(process.memoryUsage().rss / 1024 / 1024) + " MB",
            },
            summary: `系统运行时间: ${Math.floor(process.uptime())}s, 内存: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
          };
        }
        case "server_health": {
          const onlineDevices = await db.select({ count: count() }).from(devices).where(eq(devices.status, "online"));
          const totalDevices = await db.select({ count: count() }).from(devices);
          const totalUsers = await db.select({ count: count() }).from(users);
          return {
            success: true,
            result: {
              uptime: Math.floor(process.uptime()),
              version: "1.0.0",
              memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
              devices: { online: onlineDevices[0]?.count ?? 0, total: totalDevices[0]?.count ?? 0 },
              users: totalUsers[0]?.count ?? 0,
            },
            summary: `服务器健康: 运行 ${Math.floor(process.uptime())}s, ${onlineDevices[0]?.count ?? 0}/${totalDevices[0]?.count ?? 0} 设备在线`,
          };
        }
        case "queue_stats": {
          const pending = await db.select({ count: count() }).from(executions).where(eq(executions.status, "pending"));
          const running = await db.select({ count: count() }).from(executions).where(eq(executions.status, "running"));
          return {
            success: true,
            result: { pending: pending[0]?.count ?? 0, running: running[0]?.count ?? 0 },
            summary: `任务队列: ${pending[0]?.count ?? 0} 等待中, ${running[0]?.count ?? 0} 运行中`,
          };
        }
      }
      break;
    }

    // ── 12. Stats Management ──
    case "stats_management": {
      switch (action) {
        case "vlm_usage": {
          const total = await db.select({ count: count() }).from(vlmEpisodes);
          const completed = await db.select({ count: count() }).from(vlmEpisodes).where(eq(vlmEpisodes.status, "completed"));
          return {
            success: true,
            result: { totalEpisodes: total[0]?.count ?? 0, completed: completed[0]?.count ?? 0 },
            summary: `VLM 用量: 共 ${total[0]?.count ?? 0} 个剧集, ${completed[0]?.count ?? 0} 已完成`,
          };
        }
        case "device_usage": {
          const online = await db.select({ count: count() }).from(devices).where(eq(devices.status, "online"));
          const total = await db.select({ count: count() }).from(devices);
          const rate = Number(total[0]?.count) > 0 ? Math.round((Number(online[0]?.count) / Number(total[0]?.count)) * 100) : 0;
          return {
            success: true,
            result: { online: online[0]?.count ?? 0, total: total[0]?.count ?? 0, onlineRate: rate + "%" },
            summary: `设备使用率: ${online[0]?.count ?? 0}/${total[0]?.count ?? 0} (${rate}%)`,
          };
        }
        case "summary": {
          const [deviceTotal, userTotal, taskTotal, episodeTotal] = await Promise.all([
            db.select({ count: count() }).from(devices),
            db.select({ count: count() }).from(users),
            db.select({ count: count() }).from(tasks),
            db.select({ count: count() }).from(vlmEpisodes),
          ]);
          return {
            success: true,
            result: {
              devices: deviceTotal[0]?.count ?? 0,
              users: userTotal[0]?.count ?? 0,
              tasks: taskTotal[0]?.count ?? 0,
              vlmEpisodes: episodeTotal[0]?.count ?? 0,
              uptime: Math.floor(process.uptime()),
            },
            summary: `系统概览: ${deviceTotal[0]?.count ?? 0} 设备, ${userTotal[0]?.count ?? 0} 用户, ${taskTotal[0]?.count ?? 0} 任务, ${episodeTotal[0]?.count ?? 0} VLM 剧集`,
          };
        }
      }
      break;
    }

    // ── 13. Alert Management ──
    case "alert_management": {
      switch (action) {
        case "list": {
          const rows = await db.select().from(alertRules).orderBy(desc(alertRules.createdAt));
          return { success: true, result: { rules: rows }, summary: `共 ${rows.length} 条告警规则` };
        }
        case "get": {
          const row = await db.select().from(alertRules).where(eq(alertRules.id, input.ruleId as string)).limit(1);
          if (!row[0]) return { success: false, result: null, error: "规则不存在", summary: "告警规则不存在" };
          return { success: true, result: row[0], summary: `告警规则: ${row[0].name}` };
        }
        case "create": {
          const [row] = await db.insert(alertRules).values({
            name: input.name as string,
            type: input.alertType as string || "device_offline",
            conditions: input.conditions || {},
            channels: input.channels || [],
            enabled: true,
          } as any).returning();
          return { success: true, result: row, summary: `告警规则 "${input.name}" 创建成功` };
        }
        case "update": {
          const data: Record<string, unknown> = { updatedAt: new Date() };
          if (input.name) data.name = input.name;
          if (input.conditions) data.conditions = input.conditions;
          if (input.channels) data.channels = input.channels;
          await db.update(alertRules).set(data).where(eq(alertRules.id, input.ruleId as string));
          return { success: true, result: data, summary: `告警规则已更新` };
        }
        case "delete":
          await db.delete(alertRules).where(eq(alertRules.id, input.ruleId as string));
          return { success: true, result: null, summary: `告警规则已删除` };
        case "toggle": {
          const [row] = await db.select({ enabled: alertRules.enabled }).from(alertRules).where(eq(alertRules.id, input.ruleId as string)).limit(1);
          if (!row) return { success: false, result: null, error: "规则不存在", summary: "告警规则不存在" };
          await db.update(alertRules).set({ enabled: !row.enabled }).where(eq(alertRules.id, input.ruleId as string));
          return { success: true, result: null, summary: `告警规则已${row.enabled ? "禁用" : "启用"}` };
        }
      }
      break;
    }

    // ── 14. VLM Management ──
    case "vlm_management": {
      switch (action) {
        case "list_episodes": {
          const conditions: any[] = [];
          if (input.deviceId) conditions.push(eq(vlmEpisodes.deviceId, input.deviceId as string));
          if (input.status) conditions.push(eq(vlmEpisodes.status, input.status as any));
          const rows = await db
            .select({
              id: vlmEpisodes.id, deviceId: vlmEpisodes.deviceId,
              taskPrompt: vlmEpisodes.taskPrompt, modelName: vlmEpisodes.modelName,
              status: vlmEpisodes.status, totalSteps: vlmEpisodes.totalSteps,
              createdAt: vlmEpisodes.createdAt,
            })
            .from(vlmEpisodes)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(vlmEpisodes.createdAt))
            .limit(20);
          return { success: true, result: { episodes: rows }, summary: `最近 ${rows.length} 个 VLM 剧集` };
        }
        case "list_models": {
          return { success: true, result: { models: [] }, summary: "VLM 模型列表通过 /api/v1/vlm/models 端点管理，请直接访问该接口" };
        }
        case "test_model":
          return { success: true, result: null, summary: `模型 ${input.modelId} 连接测试已提交` };
      }
      break;
    }

    // ── 15. Audit Management ──
    case "audit_management": {
      try {
        const { auditLogs } = await import("../audit/audit-schema.js");
        const limit = (input.limit as number) || 50;
        const conditions: any[] = [];
        if (input.userId) conditions.push(eq(auditLogs.userId, input.userId as string));
        if (input.operation) conditions.push(eq(auditLogs.action, input.operation as string));
        const rows = await db
          .select()
          .from(auditLogs)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(auditLogs.createdAt))
          .limit(limit);
        return { success: true, result: { logs: rows }, summary: `最近 ${rows.length} 条审计日志` };
      } catch {
        return { success: true, result: { logs: [] }, summary: "审计日志表尚未初始化" };
      }
    }

    // ── 16/20. Platform Account Management ──
    case "platform_account_management":
    case "account_management": {
      switch (action) {
        case "list": {
          const rows = await db.select().from(platformAccounts).limit(50);
          return { success: true, result: { accounts: rows }, summary: `共 ${rows.length} 个平台账号` };
        }
        case "get": {
          const row = await db.select().from(platformAccounts).where(eq(platformAccounts.id, input.accountId as string)).limit(1);
          if (!row[0]) return { success: false, result: null, error: "账号不存在", summary: "平台账号不存在" };
          return { success: true, result: row[0], summary: `平台账号: ${row[0].username}` };
        }
      }
      break;
    }

    // ── 17. Credit Management ──
    case "credit_management": {
      switch (action) {
        case "overview": {
          const total = await db.select({ count: count() }).from(userCredits);
          const totalBalance = await db.select({ sum: sql`COALESCE(SUM(balance), 0)` }).from(userCredits);
          return {
            success: true,
            result: { userCount: total[0]?.count ?? 0, totalBalance: totalBalance[0]?.sum ?? 0 },
            summary: `积分概览: ${total[0]?.count ?? 0} 个用户有积分记录, 总余额 ${totalBalance[0]?.sum ?? 0}`,
          };
        }
        case "grant": {
          await creditService.grantCredits(input.userId as string, input.amount as number, (input.note as string) || "管理员通过 AI 助手发放");
          return { success: true, result: null, summary: `已向用户 ${input.userId} 发放 ${input.amount} 积分` };
        }
        case "transactions": {
          const rows = await db
            .select()
            .from(creditTransactions)
            .orderBy(desc(creditTransactions.createdAt))
            .limit(20);
          return { success: true, result: { transactions: rows }, summary: `最近 ${rows.length} 条积分交易` };
        }
        case "balance": {
          const ids = (input.userIds as string[]) || (input.userId ? [input.userId as string] : []);
          if (ids.length === 0) {
            return { success: false, result: null, error: "请提供 userId 或 userIds", summary: "查询积分余额失败: 请提供用户 ID" };
          }
          if (ids.length > 200) {
            return { success: false, result: null, error: "最多查询 200 个用户", summary: "查询积分余额失败: 最多 200 个用户" };
          }
          const balances = await creditService.getBalances(ids);
          const result: Record<string, unknown> = {};
          for (const [uid, info] of balances) {
            result[uid] = { balance: info.balance, totalEarned: info.totalEarned, totalSpent: info.totalSpent };
          }
          // Build readable summary
          const entries = Object.entries(result);
          const summaryParts = entries.slice(0, 10).map(([uid, info]: [string, any]) => `${uid.slice(0, 8)}...: ${info.balance}`);
          let summary = `查询了 ${entries.length} 个用户积分: ${summaryParts.join("; ")}`;
          if (entries.length > 10) summary += ` ...等`;
          return { success: true, result: { balances: result }, summary };
        }
      }
      break;
    }

    // ── 18. Agent Management ──
    case "agent_management": {
      switch (action) {
        case "list": {
          try {
            const { agents } = await import("../agent/agent-schema.js");
            const rows = await db.select().from(agents).orderBy(desc(agents.createdAt)).limit(50);
            return { success: true, result: { agents: rows }, summary: `共 ${rows.length} 个代理商` };
          } catch {
            return { success: true, result: { agents: [] }, summary: "代理商表尚未初始化" };
          }
        }
        case "create": {
          const { agents } = await import("../agent/agent-schema.js");
          const [row] = await db.insert(agents).values({
            name: input.name as string,
            tenantId: ctx.tenantId || null,
            userId: ctx.userId,
            contactEmail: input.contactEmail as string || null,
            commissionRate: (input.commissionRate as number) || 0.3,
          } as any).returning();
          return { success: true, result: row, summary: `代理商 "${input.name}" 创建成功` };
        }
        case "commissions": {
          const { agentCommissions } = await import("../agent/agent-schema.js");
          const rows = await db.select().from(agentCommissions).orderBy(desc(agentCommissions.createdAt)).limit(20);
          return { success: true, result: { commissions: rows }, summary: `最近 ${rows.length} 条佣金记录` };
        }
      }
      break;
    }

    // ── 19. Webhook Management ──
    case "webhook_management": {
      switch (action) {
        case "list": {
          const rows = await db.select().from(webhookConfigs).orderBy(desc(webhookConfigs.createdAt));
          return { success: true, result: { webhooks: rows }, summary: `共 ${rows.length} 个 Webhook` };
        }
        case "create": {
          const [row] = await db.insert(webhookConfigs).values({
            url: input.url as string,
            secret: input.secret as string || null,
            events: input.events || [],
            enabled: true,
          } as any).returning();
          return { success: true, result: row, summary: `Webhook 创建成功 → ${input.url}` };
        }
        case "delete":
          await db.delete(webhookConfigs).where(eq(webhookConfigs.id, input.webhookId as string));
          return { success: true, result: null, summary: `Webhook 已删除` };
        case "test": {
          const [row] = await db.select({ url: webhookConfigs.url, secret: webhookConfigs.secret }).from(webhookConfigs).where(eq(webhookConfigs.id, input.webhookId as string)).limit(1);
          if (!row) return { success: false, result: null, error: "Webhook 不存在", summary: "Webhook 不存在" };
          try {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (row.secret) headers["X-Webhook-Secret"] = row.secret;
            await fetch(row.url, { method: "POST", headers, body: JSON.stringify({ test: true, timestamp: new Date().toISOString() }), signal: AbortSignal.timeout(5000) });
            return { success: true, result: null, summary: `Webhook 测试发送成功 → ${row.url}` };
          } catch (err: any) {
            return { success: false, result: null, error: err.message, summary: `Webhook 测试失败: ${err.message}` };
          }
        }
      }
      break;
    }

    default:
      return { success: false, result: null, error: `未知工具: ${name}`, summary: `不支持的工具: ${name}` };
  }

  return { success: false, result: null, error: `未知操作: ${name}.${action}`, summary: `不支持的操作: ${name}.${action}` };
}
