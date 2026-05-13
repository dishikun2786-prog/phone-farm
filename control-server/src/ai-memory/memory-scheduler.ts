/**
 * AI Memory Scheduler — 智能内存调度引擎
 *
 * 功能:
 *   1. 定时采集系统内存 + PM2进程状态
 *   2. 调用 DeepSeek AI 获取调度建议
 *   3. 执行进程暂停/恢复操作
 *   4. 记录决策结果，积累AI调度记忆
 *
 * 优先级体系:
 *   P0 — 基础设施(PostgreSQL/Redis/Caddy/Nginx): 绝不操作
 *   P1 — PhoneFarm核心(control/relay): 除非濒临OOM否则不动
 *   P2 — 用户网站(shengri-api/web): 内存<15%时可暂停
 *   P3 — 后台服务(shengri-admin/calendar): 内存<20%时可暂停
 */

import { execSync } from "child_process";
import os from "os";
import { DeepSeekMemoryAdvisor } from "./deepseek-advisor.js";

interface ProcDef {
  name: string;
  priority: 0 | 1 | 2 | 3;
  pm2Managed: boolean;
  description: string;
}

const PROCESS_DEFINITIONS: ProcDef[] = [
  { name: "postgres", priority: 0, pm2Managed: false, description: "PostgreSQL 数据库" },
  { name: "redis", priority: 0, pm2Managed: false, description: "Redis 缓存" },
  { name: "caddy", priority: 0, pm2Managed: false, description: "Caddy HTTPS反代" },
  { name: "nginx", priority: 0, pm2Managed: false, description: "Nginx HTTP服务" },
  { name: "phonefarm-control", priority: 1, pm2Managed: true, description: "PhoneFarm 控制服务器" },
  { name: "phonefarm-relay", priority: 1, pm2Managed: true, description: "PhoneFarm 中继服务器" },
  { name: "shengri-api", priority: 2, pm2Managed: true, description: "生日 API 服务" },
  { name: "shengri-web", priority: 2, pm2Managed: true, description: "生日 Web 前端" },
  { name: "shengri-admin", priority: 3, pm2Managed: true, description: "生日 管理后台" },
  { name: "shengri-calendar", priority: 3, pm2Managed: true, description: "生日 日历引擎" },
  { name: "shengri-caddy", priority: 0, pm2Managed: true, description: "Caddy(PM2管理)" },
];

const CHECK_INTERVAL_MS = 60000;
const COOLDOWN_AFTER_ACTION_MS = 120000;

export interface SchedulerState {
  running: boolean;
  lastCheck: number;
  lastAction: number;
  pausedProcesses: string[];
  currentSnapshot: any;
  lastDecision: any;
  history: any[];
  stats: {
    totalChecks: number;
    totalActions: number;
    pausesToday: number;
    resumesToday: number;
  };
}

export class MemoryScheduler {
  private advisor: DeepSeekMemoryAdvisor;
  private state: SchedulerState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cooldownUntil: number = 0;

  constructor() {
    this.advisor = new DeepSeekMemoryAdvisor();
    this.state = {
      running: false,
      lastCheck: 0,
      lastAction: 0,
      pausedProcesses: [],
      currentSnapshot: null,
      lastDecision: null,
      history: [],
      stats: {
        totalChecks: 0,
        totalActions: 0,
        pausesToday: 0,
        resumesToday: 0,
      },
    };
  }

  start(): void {
    if (this.state.running) return;
    this.state.running = true;
    console.log("[MemoryScheduler] 智能内存调度启动 (间隔60s, DeepSeek AI)");

    this.tick();
    this.timer = setInterval(() => this.tick(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    this.state.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getState(): SchedulerState {
    return this.state;
  }

  getAdvisor(): DeepSeekMemoryAdvisor {
    return this.advisor;
  }

  async forceCheck(): Promise<any> {
    return this.tick();
  }

  private async tick(): Promise<any> {
    this.state.lastCheck = Date.now();
    this.state.stats.totalChecks++;

    const snapshot = this.collectSnapshot();
    this.state.currentSnapshot = snapshot;

    if (Date.now() < this.cooldownUntil) {
      return { status: "cooldown", remainingMs: this.cooldownUntil - Date.now() };
    }

    if (this.state.pausedProcesses.length > 0 && snapshot.usagePct < 70) {
      return this.resumeProcesses(snapshot);
    }

    if (snapshot.usagePct < 80) {
      return { status: "healthy", usagePct: snapshot.usagePct, freeMB: snapshot.freeMB };
    }

    const decision = await this.advisor.analyze(snapshot);
    this.state.lastDecision = decision;

    if (decision.recommendation === "hold" || decision.targetProcesses.length === 0) {
      return { status: "hold", decision };
    }

    if (decision.recommendation === "pause") {
      return this.executePause(decision, snapshot);
    }

    if (decision.recommendation === "resume") {
      return this.executeResume(decision, snapshot);
    }

    return { status: "unknown", decision };
  }

  private collectSnapshot() {
    const totalMB = Math.round(os.totalmem() / 1048576);
    const freeMB = Math.round(os.freemem() / 1048576);
    const usedMB = totalMB - freeMB;
    const usagePct = Math.round((usedMB / totalMB) * 1000) / 10;

    let processes: any[] = [];

    try {
      const pm2List = JSON.parse(execSync("pm2 jlist", { encoding: "utf-8", timeout: 5000 }));
      processes = pm2List.map((p: any) => {
        const def = PROCESS_DEFINITIONS.find(d => d.name === p.name);
        return {
          name: p.name || "unknown",
          pid: p.pid || 0,
          memoryMB: Math.round((p.monit?.memory || 0) / 1048576 * 10) / 10,
          cpuPct: p.monit?.cpu || 0,
          status: p.pm2_env?.status || "unknown",
          priority: def?.priority ?? 3,
          pm2Managed: true,
        };
      });
    } catch {
      processes = [];
    }

    PROCESS_DEFINITIONS.filter(d => !d.pm2Managed).forEach(def => {
      try {
        const procs = execSync(`tasklist /FI "IMAGENAME eq ${def.name}*" /FO CSV /NH`, {
          encoding: "utf-8", timeout: 3000,
        }).trim();
        if (procs) {
          const lines = procs.split("\n");
          for (const line of lines) {
            const parts = line.replace(/"/g, "").split(",");
            if (parts.length >= 5) {
              const memKB = parseInt(parts[4]?.replace(/[^0-9]/g, "") || "0", 10);
              processes.push({
                name: def.name,
                pid: parseInt(parts[1] || "0", 10),
                memoryMB: Math.round(memKB / 1024 * 10) / 10,
                cpuPct: 0,
                status: "online",
                priority: def.priority,
                pm2Managed: false,
              });
            }
          }
        }
      } catch {}
    });

    return {
      timestamp: Date.now(),
      totalMB,
      usedMB,
      freeMB,
      usagePct,
      processes,
    };
  }

  private executePause(decision: any, snapshot: any) {
    const results: any[] = [];
    let successCount = 0;

    for (const name of decision.targetProcesses) {
      const def = PROCESS_DEFINITIONS.find(d => d.name === name);
      if (!def || !def.pm2Managed || def.priority < 2) {
        results.push({ name, action: "pause", result: "skipped", reason: "优先级保护" });
        continue;
      }

      try {
        execSync(`pm2 stop ${name}`, { encoding: "utf-8", timeout: 10000 });
        this.state.pausedProcesses.push(name);
        results.push({ name, action: "pause", result: "success" });
        successCount++;
        console.log(`[MemoryScheduler] AI决策 → 暂停 ${name}`);
      } catch (err: any) {
        results.push({ name, action: "pause", result: "failed", error: err.message });
      }
    }

    this.state.lastAction = Date.now();
    this.state.stats.totalActions++;
    this.state.stats.pausesToday++;
    this.cooldownUntil = Date.now() + COOLDOWN_AFTER_ACTION_MS;

    this.advisor.markExecuted(decision, successCount > 0);

    this.state.history.push({
      time: Date.now(),
      action: "pause",
      targets: decision.targetProcesses,
      results,
      freeBefore: snapshot.freeMB,
    });

    return { status: "paused", targets: decision.targetProcesses, results };
  }

  private executeResume(decision: any, snapshot: any) {
    const results: any[] = [];
    let successCount = 0;

    for (const name of decision.targetProcesses) {
      if (!this.state.pausedProcesses.includes(name)) {
        results.push({ name, action: "resume", result: "skipped", reason: "未被暂停" });
        continue;
      }

      try {
        execSync(`pm2 start ${name}`, { encoding: "utf-8", timeout: 10000 });
        this.state.pausedProcesses = this.state.pausedProcesses.filter(n => n !== name);
        results.push({ name, action: "resume", result: "success" });
        successCount++;
        console.log(`[MemoryScheduler] AI决策 → 恢复 ${name}`);
      } catch (err: any) {
        results.push({ name, action: "resume", result: "failed", error: err.message });
      }
    }

    this.state.lastAction = Date.now();
    this.state.stats.totalActions++;
    this.state.stats.resumesToday++;
    this.cooldownUntil = Date.now() + COOLDOWN_AFTER_ACTION_MS;

    this.advisor.markExecuted(decision, successCount > 0);

    this.state.history.push({
      time: Date.now(),
      action: "resume",
      targets: decision.targetProcesses,
      results,
      freeBefore: snapshot.freeMB,
    });

    return { status: "resumed", targets: decision.targetProcesses, results };
  }

  private resumeProcesses(snapshot: any) {
    if (this.state.pausedProcesses.length === 0) {
      return { status: "healthy", usagePct: snapshot.usagePct };
    }

    const toResume = [...this.state.pausedProcesses];
    const results: any[] = [];

    for (const name of toResume) {
      try {
        execSync(`pm2 start ${name}`, { encoding: "utf-8", timeout: 10000 });
        this.state.pausedProcesses = this.state.pausedProcesses.filter(n => n !== name);
        results.push({ name, action: "resume", result: "success" });
        console.log(`[MemoryScheduler] 内存恢复 → 自动恢复 ${name}`);
      } catch (err: any) {
        results.push({ name, action: "resume", result: "failed", error: err.message });
      }
    }

    this.cooldownUntil = Date.now() + COOLDOWN_AFTER_ACTION_MS;
    return { status: "resumed", targets: toResume, results };
  }
}
