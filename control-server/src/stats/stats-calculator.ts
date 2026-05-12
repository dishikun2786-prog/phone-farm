/**
 * PhoneFarm Stats Calculator — 统计计算引擎（VLM 用量/设备使用/任务成功率/带宽）
 */
import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { vlmEpisodes, executions, tasks, taskTemplates, accounts } from "../schema.js";
import { eq, and, gte, lte } from "drizzle-orm";

export interface VlmUsageRow {
  date: string;
  modelName: string;
  deviceId: string;
  calls: number;
  tokens: number;
  costUsd: number;
}

export interface DeviceUsageRow {
  deviceId: string;
  date: string;
  onlineMinutes: number;
  tasks: number;
  successCount: number;
  failCount: number;
  bandwidthMb: number;
}

// Cost per 1K tokens by model (USD)
const MODEL_PRICING: Record<string, number> = {
  "autoglm-phone-9b": 0.001,
  "qwen2.5-vl-7b": 0.0008,
  "qwen3-vl-8b": 0.001,
  "ui-tars-7b": 0.0007,
  "gui-owl": 0.0005,
  "maiui-7b": 0.0006,
  "default": 0.001,
};

function getModelCost(modelName: string, tokens: number): number {
  const rate = MODEL_PRICING[modelName] ?? MODEL_PRICING["default"] ?? 0.001;
  return Math.round((tokens / 1000) * rate * 10000) / 10000;
}

export class StatsCalculator {
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /** 计算 VLM 用量统计 */
  async calcVlmUsage(from: number, to: number): Promise<{
    totalCalls: number;
    totalTokens: number;
    totalCostUsd: number;
    byModel: Record<string, { calls: number; tokens: number; costUsd: number }>;
    byDevice: Record<string, { calls: number; tokens: number }>;
    byDay: Record<string, { calls: number; tokens: number }>;
  }> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const episodes = await db
      .select()
      .from(vlmEpisodes)
      .where(
        and(
          gte(vlmEpisodes.createdAt, fromDate),
          lte(vlmEpisodes.createdAt, toDate),
        ),
      );

    let totalCalls = episodes.length;
    let totalTokens = 0;
    let totalCostUsd = 0;
    const byModel: Record<string, { calls: number; tokens: number; costUsd: number }> = {};
    const byDevice: Record<string, { calls: number; tokens: number }> = {};
    const byDay: Record<string, { calls: number; tokens: number }> = {};

    // Aggregate VLM episode stats from the stats JSONB column
    for (const ep of episodes) {
      const epStats = ep.stats as Record<string, number> | null;
      const tokens = (epStats?.totalTokens as number) ?? (epStats?.tokens as number) ?? 0;
      const modelName = ep.modelName || "unknown";
      const deviceId = ep.deviceId;
      const day = ep.createdAt.toISOString().slice(0, 10);

      totalTokens += tokens;
      const cost = getModelCost(modelName, tokens);
      totalCostUsd += cost;

      // By model
      if (!byModel[modelName]) byModel[modelName] = { calls: 0, tokens: 0, costUsd: 0 };
      byModel[modelName]!.calls++;
      byModel[modelName]!.tokens += tokens;
      byModel[modelName]!.costUsd += cost;

      // By device
      if (!byDevice[deviceId]) byDevice[deviceId] = { calls: 0, tokens: 0 };
      byDevice[deviceId]!.calls++;
      byDevice[deviceId]!.tokens += tokens;

      // By day
      if (!byDay[day]) byDay[day] = { calls: 0, tokens: 0 };
      byDay[day]!.calls++;
      byDay[day]!.tokens += tokens;
    }

    totalCostUsd = Math.round(totalCostUsd * 10000) / 10000;

    return { totalCalls, totalTokens, totalCostUsd, byModel, byDevice, byDay };
  }

  /** 计算设备使用统计 */
  async calcDeviceUsage(params: {
    deviceId?: string;
    from: number;
    to: number;
  }): Promise<{
    totalOnlineMinutes: number;
    totalTasks: number;
    successRate: number;
    avgResponseTimeMs: number;
    byDevice: Record<string, {
      onlineMinutes: number; tasks: number; successRate: number; bandwidthMb: number;
    }>;
  }> {
    const fromDate = new Date(params.from);
    const toDate = new Date(params.to);

    const conditions = [
      gte(executions.createdAt, fromDate),
      lte(executions.createdAt, toDate),
    ];
    if (params.deviceId) conditions.push(eq(executions.deviceId, params.deviceId));

    const execs = await db
      .select()
      .from(executions)
      .where(and(...conditions));

    const byDevice: Record<string, {
      onlineMinutes: number; tasks: number; successRate: number; bandwidthMb: number;
    }> = {};

    let totalTasks = 0;
    let totalSuccess = 0;
    let totalResponseTime = 0;
    let responseCount = 0;

    for (const exec of execs) {
      const devId = exec.deviceId;
      if (!byDevice[devId]) {
        byDevice[devId] = { onlineMinutes: 0, tasks: 0, successRate: 0, bandwidthMb: 0 };
      }
      byDevice[devId]!.tasks++;
      totalTasks++;

      if (exec.status === "completed") {
        totalSuccess++;
        byDevice[devId]!.successRate =
          (byDevice[devId]!.successRate * (byDevice[devId]!.tasks - 1) + 1) / byDevice[devId]!.tasks;
      }

      if (exec.startedAt && exec.finishedAt) {
        const duration = exec.finishedAt.getTime() - exec.startedAt.getTime();
        totalResponseTime += duration;
        responseCount++;
      }

      // Estimate bandwidth: ~5MB per execution (screenshots + commands)
      byDevice[devId]!.bandwidthMb += 5;
    }

    // Calculate success rates
    for (const key of Object.keys(byDevice)) {
      const entry = byDevice[key]!;
      entry.successRate = entry.tasks > 0
        ? Math.round((entry.successRate / entry.tasks) * 10000) / 100
        : 0;
    }

    const overallSuccessRate = totalTasks > 0
      ? Math.round((totalSuccess / totalTasks) * 10000) / 100
      : 0;
    const avgResponseTimeMs = responseCount > 0
      ? Math.round(totalResponseTime / responseCount)
      : 0;

    return {
      totalOnlineMinutes: 0,
      totalTasks,
      successRate: overallSuccessRate,
      avgResponseTimeMs,
      byDevice,
    };
  }

  /** 计算任务成功率 */
  async calcTaskSuccessRate(params: {
    from: number; to: number; platform?: string;
  }): Promise<{
    overall: number;
    byPlatform: Record<string, number>;
    byScript: Record<string, { success: number; total: number; rate: number }>;
    byDay: Record<string, number>;
  }> {
    const fromDate = new Date(params.from);
    const toDate = new Date(params.to);

    const execs = await db
      .select()
      .from(executions)
      .where(
        and(
          gte(executions.createdAt, fromDate),
          lte(executions.createdAt, toDate),
        ),
      );

    // Also fetch tasks to get template/platform info
    const allTasks = await db.select().from(tasks);
    const allTemplates = await db.select().from(taskTemplates);
    const taskMap = new Map(allTasks.map((t) => [t.id, t]));
    const templateMap = new Map(allTemplates.map((t) => [t.id, t]));

    const byPlatform: Record<string, { success: number; total: number }> = {};
    const byScript: Record<string, { success: number; total: number; rate: number }> = {};
    const byDay: Record<string, { success: number; total: number }> = {};

    let totalSuccess = 0;
    let totalCount = 0;

    for (const exec of execs) {
      const task = taskMap.get(exec.taskId);
      const template = task?.templateId ? templateMap.get(task.templateId) : null;
      const platform = template?.platform ?? "unknown";
      const scriptName = template?.scriptName ?? "unknown";
      const day = exec.createdAt.toISOString().slice(0, 10);
      const success = exec.status === "completed" ? 1 : 0;

      totalCount++;
      totalSuccess += success;

      // By platform
      if (!byPlatform[platform]) byPlatform[platform] = { success: 0, total: 0 };
      byPlatform[platform]!.total++;
      byPlatform[platform]!.success += success;

      // By script
      if (!byScript[scriptName]) byScript[scriptName] = { success: 0, total: 0, rate: 0 };
      byScript[scriptName]!.total++;
      byScript[scriptName]!.success += success;

      // By day
      if (!byDay[day]) byDay[day] = { success: 0, total: 0 };
      byDay[day]!.total++;
      byDay[day]!.success += success;
    }

    // Calculate rates
    const byPlatformRates: Record<string, number> = {};
    for (const [key, val] of Object.entries(byPlatform)) {
      byPlatformRates[key] = val.total > 0
        ? Math.round((val.success / val.total) * 10000) / 100
        : 0;
    }

    for (const entry of Object.values(byScript)) {
      entry.rate = entry.total > 0
        ? Math.round((entry.success / entry.total) * 10000) / 100
        : 0;
    }

    const byDayRates: Record<string, number> = {};
    for (const [key, val] of Object.entries(byDay)) {
      byDayRates[key] = val.total > 0
        ? Math.round((val.success / val.total) * 10000) / 100
        : 0;
    }

    const overall = totalCount > 0
      ? Math.round((totalSuccess / totalCount) * 10000) / 100
      : 0;

    return { overall, byPlatform: byPlatformRates, byScript, byDay: byDayRates };
  }

  /** 计算带宽使用 */
  async calcBandwidthUsage(params: {
    deviceId?: string;
    from: number; to: number;
  }): Promise<{
    totalMb: number;
    wsMb: number;
    apiMb: number;
    downloadMb: number;
    byDay: Record<string, number>;
  }> {
    const fromDate = new Date(params.from);
    const toDate = new Date(params.to);

    const conditions = [
      gte(executions.createdAt, fromDate),
      lte(executions.createdAt, toDate),
    ];
    if (params.deviceId) conditions.push(eq(executions.deviceId, params.deviceId));

    const execs = await db
      .select()
      .from(executions)
      .where(and(...conditions));

    let wsMb = 0;
    let apiMb = 0;
    let downloadMb = 0;
    const byDay: Record<string, number> = {};

    for (const exec of execs) {
      const day = exec.createdAt.toISOString().slice(0, 10);
      // Estimate: ~2MB WebSocket commands + 0.5MB API + 3MB downloads per execution
      wsMb += 2;
      apiMb += 0.5;
      downloadMb += 3;

      if (!byDay[day]) byDay[day] = 0;
      byDay[day] += 5.5;
    }

    const totalMb = Math.round((wsMb + apiMb + downloadMb) * 100) / 100;

    return {
      totalMb,
      wsMb: Math.round(wsMb * 100) / 100,
      apiMb: Math.round(apiMb * 100) / 100,
      downloadMb: Math.round(downloadMb * 100) / 100,
      byDay,
    };
  }

  /** 计算平台账号统计 */
  async calcPlatformAccountStats(): Promise<{
    byPlatform: Record<string, { total: number; online: number; banned: number }>;
  }> {
    const allAccounts = await db.select().from(accounts);
    const byPlatform: Record<string, { total: number; online: number; banned: number }> = {};

    for (const a of allAccounts) {
      if (!byPlatform[a.platform]) {
        byPlatform[a.platform] = { total: 0, online: 0, banned: 0 };
      }
      byPlatform[a.platform]!.total++;
      if (a.loginStatus) byPlatform[a.platform]!.online++;
    }

    // Accounts table doesn't have a "banned" field, so banned stays 0 unless we add it
    return { byPlatform };
  }

  /** 计算服务端健康指标 */
  async calcServerHealth(): Promise<{
    cpuPercent: number;
    memoryMb: { used: number; total: number };
    wsConnections: { devices: number; frontends: number };
    messagesPerMin: number;
    uptimeSeconds: number;
  }> {
    const mem = process.memoryUsage();
    const wsHub = (this.fastify as any).wsHub;
    const os = await import("os");

    let cpuPercent = 0;
    try {
      const cpus = os.cpus();
      if (cpus.length > 0) {
        // Calculate average CPU usage across all cores
        let totalIdle = 0;
        let totalTick = 0;
        for (const cpu of cpus) {
          for (const type of Object.keys(cpu.times)) {
            totalTick += (cpu.times as any)[type];
          }
          totalIdle += cpu.times.idle;
        }
        cpuPercent = totalTick > 0
          ? Math.round((1 - totalIdle / totalTick) * 10000) / 100
          : 0;
      }
    } catch {
      cpuPercent = 0;
    }

    return {
      cpuPercent,
      memoryMb: {
        used: Math.round(mem.heapUsed / 1024 / 1024),
        total: Math.round(mem.heapTotal / 1024 / 1024),
      },
      wsConnections: {
        devices: wsHub?.getOnlineDevices?.()?.length ?? 0,
        frontends: wsHub?.getFrontendCount?.() ?? 0,
      },
      messagesPerMin: 0,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
