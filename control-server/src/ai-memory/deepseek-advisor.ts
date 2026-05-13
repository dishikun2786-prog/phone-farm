/**
 * AI Memory Advisor — DeepSeek (Anthropic API) 智能内存调度决策引擎
 *
 * 功能:
 *   1. 接收当前内存快照 + 历史数据 → DeepSeek AI 分析
 *   2. 输出智能决策: 哪些进程可暂停/恢复，何时操作
 *   3. 记录决策历史，积累调度经验记忆
 *   4. 按时间模式预测内存需求（白天/夜间不同策略）
 *
 * API: Anthropic Messages API via https://api.deepseek.com/anthropic
 * 模型: deepseek-v4-flash
 */
import fs from "fs";
import path from "path";
import { DeepSeekAnthropicClient, getAnthropicClient } from "./anthropic-client.js";

const MEMORY_FILE = path.join(process.cwd(), ".ai-memory-store.json");

function loadMemory(): DecisionMemory {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
    }
  } catch { }
  return {
    decisions: [],
    patterns: {},
    totalDecisions: 0,
    successfulPauses: 0,
    failedPauses: 0,
    avgFreeMemoryAfterAction: 0,
    lastUpdated: Date.now(),
  };
}

function saveMemory(mem: DecisionMemory): void {
  mem.lastUpdated = Date.now();
  if (mem.decisions.length > 200) {
    mem.decisions = mem.decisions.slice(-200);
  }
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2));
}

function derivePriorityLabel(p: number): string {
  switch (p) {
    case 0: return "核心(绝不暂停)";
    case 1: return "关键(PhoneFarm)";
    case 2: return "重要(用户Web)";
    case 3: return "后台(可暂停)";
    default: return "未知";
  }
}

function formatProcessesForAI(procs: ProcessInfo[]): string {
  return procs
    .filter(p => p.pm2Managed)
    .map(p =>
      `  - ${p.name} (PID=${p.pid}, ${p.memoryMB}MB, CPU=${p.cpuPct}%, ${p.status}, 优先级=${derivePriorityLabel(p.priority)})`
    )
    .join("\n");
}

interface MemorySnapshot {
  timestamp: number;
  totalMB: number;
  usedMB: number;
  freeMB: number;
  usagePct: number;
  processes: ProcessInfo[];
}

interface ProcessInfo {
  name: string;
  pid: number;
  memoryMB: number;
  cpuPct: number;
  status: "online" | "stopped" | "errored";
  priority: 0 | 1 | 2 | 3;
  pm2Managed: boolean;
}

interface SchedulingDecision {
  timestamp: number;
  freeMB: number;
  usagePct: number;
  recommendation: "pause" | "resume" | "hold";
  targetProcesses: string[];
  reason: string;
  confidence: number;
  executed: boolean;
  result?: string;
}

interface DecisionMemory {
  decisions: SchedulingDecision[];
  patterns: Record<string, number>;
  totalDecisions: number;
  successfulPauses: number;
  failedPauses: number;
  avgFreeMemoryAfterAction: number;
  lastUpdated: number;
}

export class DeepSeekMemoryAdvisor {
  private memory: DecisionMemory;
  private client: DeepSeekAnthropicClient;

  constructor(client?: DeepSeekAnthropicClient) {
    this.client = client || getAnthropicClient();
    this.memory = loadMemory();
    console.log(`[AIMemory] Loaded ${this.memory.totalDecisions} past decisions, model=${this.client.model}`);
  }

  getMemory(): DecisionMemory {
    return this.memory;
  }

  async analyze(snapshot: MemorySnapshot): Promise<SchedulingDecision> {
    const hour = new Date(snapshot.timestamp).getHours();
    const isNighttime = hour >= 1 && hour <= 6;
    const isPeakTime = hour >= 9 && hour <= 22;

    const recentHistory = this.memory.decisions.slice(-10);
    const processList = formatProcessesForAI(snapshot.processes);

    const systemPrompt = `你是 PhoneFarm 群控平台的 AI 内存调度专家，请根据输入输出纯JSON格式的调度决策。

决策规则:
1. P0 进程(PostgreSQL, Redis, Caddy, Nginx) — 绝不操作
2. P1 进程(phonefarm-control, phonefarm-relay) — 除非濒临OOM，否则不操作
3. P2 进程(shengri-api, shengri-web) — 用户网站，空闲<15%时可暂停
4. P3 进程(shengri-admin, shengri-calendar) — 后台服务，空闲<20%时可暂停

时间策略:
- 凌晨1-6点: 用户少，可激进暂停P2/P3
- 白天9-22点: 用户多，谨慎操作
- 当前时间: ${hour}点，${isNighttime ? "凌晨时段" : isPeakTime ? "高峰时段" : "普通时段"}
- 服务器总内存 ${snapshot.totalMB}MB，当前使用 ${snapshot.usagePct}%

你必须输出以下 JSON 格式的决策:
EXAMPLE JSON OUTPUT:
{
  "recommendation": "pause",
  "targetProcesses": ["shengri-calendar"],
  "reason": "内存极度紧张(96%)，暂停低优先级后台服务释放内存",
  "confidence": 0.92
}`;

    const userContent = `当前内存状态:
  总内存: ${snapshot.totalMB}MB
  已用: ${snapshot.usedMB}MB (${snapshot.usagePct}%)
  空闲: ${snapshot.freeMB}MB
  当前时间: ${new Date(snapshot.timestamp).toISOString()} (${hour}点)

可管理的PM2进程:
${processList}

最近10条调度记录:
${recentHistory.length > 0 ? recentHistory.map(d => `  [${new Date(d.timestamp).toLocaleTimeString()}] ${d.recommendation} ${d.targetProcesses.join(",")} — ${d.reason} (执行:${d.executed})`).join("\n") : "  无历史记录"}

请分析并给出JSON决策。`;

    try {
      const parsed = await this.client.jsonPrompt({
        system: systemPrompt,
        userContent,
        max_tokens: 256,
      });

      const decision: SchedulingDecision = {
        timestamp: Date.now(),
        freeMB: snapshot.freeMB,
        usagePct: snapshot.usagePct,
        recommendation: typeof parsed.recommendation === "string" &&
          ["pause", "resume", "hold"].includes(parsed.recommendation)
          ? parsed.recommendation as "pause" | "resume" | "hold"
          : this.fallbackDecision(snapshot).recommendation,
        targetProcesses: Array.isArray(parsed.targetProcesses) ? parsed.targetProcesses : [],
        reason: typeof parsed.reason === "string" ? parsed.reason : "AI分析结果",
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
        executed: false,
      };

      console.log(`[AIMemory] AI决策: ${decision.recommendation} ${decision.targetProcesses.join(",")} — ${decision.reason}`);
      this.recordDecision(decision);
      return decision;

    } catch (err: any) {
      console.warn(`[AIMemory] API 调用失败，使用规则引擎回退: ${err.message}`);
      return this.fallbackDecision(snapshot);
    }
  }

  private fallbackDecision(snapshot: MemorySnapshot): SchedulingDecision {
    const procNames = snapshot.processes.filter(p => p.pm2Managed).map(p => p.name);
    const hour = new Date(snapshot.timestamp).getHours();
    const isNighttime = hour >= 1 && hour <= 6;

    if (snapshot.usagePct >= 95) {
      const toPause = procNames.filter(n =>
        n.startsWith("shengri-calendar") || n.startsWith("shengri-admin")
      );
      return {
        timestamp: Date.now(), freeMB: snapshot.freeMB, usagePct: snapshot.usagePct,
        recommendation: "pause", targetProcesses: toPause,
        reason: `内存极度紧张(${snapshot.usagePct}%)，暂停后台服务`, confidence: 0.9, executed: false,
      };
    }

    if (snapshot.usagePct >= 90) {
      const toPause = procNames.filter(n => n.startsWith("shengri-calendar"));
      return {
        timestamp: Date.now(), freeMB: snapshot.freeMB, usagePct: snapshot.usagePct,
        recommendation: "pause", targetProcesses: toPause,
        reason: `内存紧张(${snapshot.usagePct}%)，暂停低优先级服务`, confidence: 0.8, executed: false,
      };
    }

    if (snapshot.usagePct >= 85 && isNighttime) {
      const toPause = procNames.filter(n =>
        n.startsWith("shengri-calendar") || n.startsWith("shengri-admin")
      );
      return {
        timestamp: Date.now(), freeMB: snapshot.freeMB, usagePct: snapshot.usagePct,
        recommendation: "pause", targetProcesses: toPause,
        reason: `凌晨时段内存偏高(${snapshot.usagePct}%)，暂停非必要服务`, confidence: 0.7, executed: false,
      };
    }

    if (snapshot.usagePct < 70) {
      const stoppedProcs = snapshot.processes.filter(p => p.status === "stopped").map(p => p.name);
      if (stoppedProcs.length > 0) {
        return {
          timestamp: Date.now(), freeMB: snapshot.freeMB, usagePct: snapshot.usagePct,
          recommendation: "resume", targetProcesses: stoppedProcs,
          reason: `内存充足(${snapshot.usagePct}%)，恢复已暂停服务`, confidence: 0.85, executed: false,
        };
      }
    }

    return {
      timestamp: Date.now(), freeMB: snapshot.freeMB, usagePct: snapshot.usagePct,
      recommendation: "hold", targetProcesses: [],
      reason: `内存状态正常(${snapshot.usagePct}%)，无需操作`, confidence: 0.95, executed: false,
    };
  }

  recordDecision(decision: SchedulingDecision): void {
    this.memory.decisions.push(decision);
    this.memory.totalDecisions++;
    if (decision.executed) {
      if (decision.result === "success") {
        this.memory.successfulPauses++;
      } else {
        this.memory.failedPauses++;
      }
    }

    const key = `${decision.recommendation}:${decision.targetProcesses.sort().join(",")}`;
    this.memory.patterns[key] = (this.memory.patterns[key] || 0) + 1;

    if (this.memory.decisions.length % 10 === 0) {
      saveMemory(this.memory);
    }
  }

  markExecuted(decision: SchedulingDecision, success: boolean): void {
    decision.executed = true;
    decision.result = success ? "success" : "failed";
    if (success) {
      this.memory.successfulPauses++;
    } else {
      this.memory.failedPauses++;
    }
    saveMemory(this.memory);
  }

  getStats() {
    return {
      totalDecisions: this.memory.totalDecisions,
      successfulPauses: this.memory.successfulPauses,
      failedPauses: this.memory.failedPauses,
      topPatterns: Object.entries(this.memory.patterns)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([k, v]) => ({ pattern: k, count: v })),
      recentDecisions: this.memory.decisions.slice(-5),
      memoryFile: MEMORY_FILE,
    };
  }
}
