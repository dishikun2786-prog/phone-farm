/**
 * PhoneFarm Crash Routes — 崩溃报告接收 + 查询 API
 */
import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";

export interface CrashReport {
  id: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
  androidVersion: string;
  crashType: "java_exception" | "native_signal" | "anr" | "oom" | "unknown";
  stackTrace: string;
  threadName: string;
  scriptName?: string;
  memoryInfo?: { usedMb: number; maxMb: number };
  recentLogs?: string[];
  timestamp: number;
}

export class CrashReportStore {
  private fastify: FastifyInstance;
  private reports: CrashReport[] = [];

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /** 接收设备上报的崩溃 */
  receive(report: Omit<CrashReport, "id">): CrashReport {
    const full: CrashReport = { id: randomUUID(), ...report };
    this.reports.push(full);
    if (this.reports.length > 5000) {
      this.reports = this.reports.slice(-3000);
    }
    this.fastify.log.error(`[Crash] Device ${report.deviceId}: ${report.crashType} at ${report.threadName}`);
    return full;
  }

  /** Get all crash reports (for summary) */
  all(): CrashReport[] {
    return this.reports;
  }

  /** 查询崩溃报告 */
  query(params: {
    deviceId?: string;
    appVersion?: string;
    crashType?: string;
    from?: number;
    to?: number;
    limit?: number;
    offset?: number;
  }): { reports: CrashReport[]; total: number } {
    let filtered = this.reports;
    if (params.deviceId) filtered = filtered.filter((r) => r.deviceId === params.deviceId);
    if (params.appVersion) filtered = filtered.filter((r) => r.appVersion === params.appVersion);
    if (params.crashType) filtered = filtered.filter((r) => r.crashType === params.crashType);
    if (params.from) filtered = filtered.filter((r) => r.timestamp >= params.from!);
    if (params.to) filtered = filtered.filter((r) => r.timestamp <= params.to!);
    const total = filtered.length;
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 50;
    return { reports: filtered.slice(offset, offset + limit), total };
  }
}

export async function crashRoutes(app: FastifyInstance): Promise<void> {
  const store = new CrashReportStore(app);

  // 设备上报崩溃
  app.post("/api/v1/crash/report", async (req, reply) => {
    const report = store.receive(req.body as Omit<CrashReport, "id">);
    return reply.status(201).send({ id: report.id });
  });

  // 查询崩溃报告（管理员）
  app.get("/api/v1/crash/reports", async (req, reply) => {
    const params = req.query as Record<string, string>;
    const result = store.query({
      deviceId: params.deviceId,
      appVersion: params.appVersion,
      crashType: params.crashType,
      from: params.from ? Number(params.from) : undefined,
      to: params.to ? Number(params.to) : undefined,
      limit: Number(params.limit) || 50,
      offset: Number(params.offset) || 0,
    });
    return reply.send(result);
  });

  // 按设备统计崩溃次数
  app.get("/api/v1/crash/summary-by-device", async (_req, reply) => {
    const summary: Record<string, { count: number; lastCrash: number; types: string[] }> = {};
    for (const report of store.all()) {
      if (!summary[report.deviceId]) {
        summary[report.deviceId] = { count: 0, lastCrash: 0, types: [] };
      }
      const entry = summary[report.deviceId]!;
      entry.count++;
      if (report.timestamp > entry.lastCrash) entry.lastCrash = report.timestamp;
      if (!entry.types.includes(report.crashType)) entry.types.push(report.crashType);
    }
    return reply.send({ summary });
  });

  // 崩溃去重分析（找出同一堆栈的重复崩溃）
  app.get("/api/v1/crash/duplicates", async (_req, reply) => {
    const hashGroups = new Map<string, { signature: string; count: number; devices: Set<string>; lastCrash: number; type: string }>();
    for (const report of store.all()) {
      // Generate signature from first 3 lines of stack trace
      const topLines = report.stackTrace.split("\n").slice(0, 3).join("\n");
      const signature = topLines || report.crashType;
      const existing = hashGroups.get(signature);
      if (existing) {
        existing.count++;
        existing.devices.add(report.deviceId);
        if (report.timestamp > existing.lastCrash) existing.lastCrash = report.timestamp;
      } else {
        hashGroups.set(signature, {
          signature,
          count: 1,
          devices: new Set([report.deviceId]),
          lastCrash: report.timestamp,
          type: report.crashType,
        });
      }
    }
    const groups = Array.from(hashGroups.values())
      .filter((g) => g.count > 1)
      .map((g) => ({ ...g, devices: Array.from(g.devices) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);
    return reply.send({ groups });
  });
}
