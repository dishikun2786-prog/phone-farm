/**
 * DecisionRouter — 双模型智能路由网关。
 *
 * 职责:
 *   1. 分析输入状态, 决定用文本模型 (DeepSeek) 还是视觉模型 (Qwen3-VL)
 *   2. 调用对应模型获取决策
 *   3. 路由决策记录 -> 优化后续路由准确性
 *   4. 会话生命周期管理
 *
 * 路由策略:
 *   文本路径 (DeepSeek V4 Flash) — 页面正常/类型明确/执行顺畅, ~90%
 *   视觉路径 (Qwen3-VL-Flash) — 异常/低置信度/未知页面/死循环, ~10%
 */
import { config } from "../config";
import { DeepSeekClient } from "./deepseek-client";
import { QwenVLClient } from "./qwen-vl-client";
import { PromptBuilder, type MemoryContext } from "./prompt-builder";
import { SafetyGuard } from "./safety-guard";
import type { DecisionInput, DecisionOutput, DeviceAction, TaskResult } from "./types";

// ── Types ──

type RouteReason =
  | "normal"
  | "anomaly_detected"
  | "low_confidence"
  | "unknown_page"
  | "stuck_loop"
  | "need_screenshot"
  | "force_text";

interface RouteDecision {
  model: "deepseek" | "qwen-vl";
  reason: RouteReason;
  includeScreenshot: boolean;
}

interface DecisionSession {
  deviceId: string;
  taskPrompt: string;
  maxSteps: number;
  platform: string;
  stepNumber: number;
  history: SessionStep[];
  consecutiveFailures: number;
  consecutiveLowConfidence: number;
  startedAt: number;
}

interface SessionStep {
  input: DecisionInput;
  decision: DecisionOutput;
  route: RouteDecision;
  timestamp: number;
  apiLatencyMs?: number;
}

// ── Memory Retriever Interface (避免循环依赖) ──

export interface MemoryRetrieverLike {
  retrieve(params: {
    platform: string;
    pageType: string;
    anomalyFlags: string[];
    textSignature: string;
  }): Promise<MemoryContext>;
}

// ── Router ──

export class DecisionRouter {
  private deepseek: DeepSeekClient;
  private qwenVL: QwenVLClient;
  private promptBuilder: PromptBuilder;
  private safetyGuard: SafetyGuard;
  private memoryRetriever: MemoryRetrieverLike;

  private sessions = new Map<string, DecisionSession>();
  private readonly SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes max session lifetime

  private routeStats = {
    deepseekCount: 0,
    qwenVLCount: 0,
    switchReasons: new Map<RouteReason, number>(),
  };

  onDecision: ((deviceId: string, decision: DecisionOutput, route: RouteDecision) => void) | null = null;
  onComplete: ((deviceId: string, result: TaskResult) => void) | null = null;

  constructor(deps: {
    deepseek: DeepSeekClient;
    qwenVL: QwenVLClient;
    promptBuilder: PromptBuilder;
    safetyGuard: SafetyGuard;
    memoryRetriever: MemoryRetrieverLike;
  }) {
    this.deepseek = deps.deepseek;
    this.qwenVL = deps.qwenVL;
    this.promptBuilder = deps.promptBuilder;
    this.safetyGuard = deps.safetyGuard;
    this.memoryRetriever = deps.memoryRetriever;
  }

  // ── Session Management ──

  startSession(deviceId: string, opts: { taskPrompt: string; maxSteps?: number; platform?: string }): void {
    this.sessions.set(deviceId, {
      deviceId,
      taskPrompt: opts.taskPrompt,
      maxSteps: opts.maxSteps || config.VLM_MAX_STEPS,
      platform: opts.platform || "unknown",
      stepNumber: 0,
      history: [],
      consecutiveFailures: 0,
      consecutiveLowConfidence: 0,
      startedAt: Date.now(),
    });
  }

  stopSession(deviceId: string, reason: string): void {
    const session = this.sessions.get(deviceId);
    if (!session) return;
    this.sessions.delete(deviceId);
    this.onComplete?.(deviceId, {
      deviceId,
      status: "stopped",
      message: reason,
      totalSteps: session.stepNumber,
      durationMs: Date.now() - session.startedAt,
    });
  }

  getSession(deviceId: string): DecisionSession | undefined {
    return this.sessions.get(deviceId);
  }

  hasSession(deviceId: string): boolean {
    return this.sessions.has(deviceId);
  }

  // ── Core: Smart Route -> Decide ──

  async decide(input: DecisionInput): Promise<{ decision: DecisionOutput; route: RouteDecision }> {
    const session = this.sessions.get(input.deviceId);
    if (!session) throw new Error(`No active session for ${input.deviceId}`);

    // 0. Stale session check
    if (Date.now() - session.startedAt > this.SESSION_TTL_MS) {
      return this.terminate(input.deviceId, session, "session_timeout");
    }

    // 1. Max steps check
    if (session.stepNumber >= session.maxSteps) {
      return this.terminate(input.deviceId, session, "max_steps");
    }

    // 2. Retrieve cross-device memory
    let memory: MemoryContext = { memories: [] };
    try {
      memory = await this.memoryRetriever.retrieve({
        platform: session.platform,
        pageType: input.pageType,
        anomalyFlags: input.anomalyFlags,
        textSignature: input.textBlocks.map(b => b.text).join("|"),
      });
    } catch {
      // Memory retrieval is best-effort
    }

    // 3. Exact rule match -> skip AI, return directly
    if (memory.exactRule && memory.exactRule.confidence >= 0.95) {
      const decision = this.buildRuleDecision(memory.exactRule);
      session.stepNumber++;
      return { decision, route: { model: "deepseek", reason: "normal", includeScreenshot: false } };
    }

    // 4. Route decision: text vs vision
    const route = this.determineRoute(input, session);

    // 5. Build prompt
    const messages = route.includeScreenshot
      ? this.promptBuilder.buildVision(input, memory, session)
      : this.promptBuilder.buildText(input, memory, session);

    // 6. Call model
    const t0 = Date.now();
    let rawResponse;
    if (route.model === "deepseek") {
      rawResponse = await this.deepseek.decide(messages);
    } else {
      rawResponse = await this.qwenVL.decide(messages);
    }
    const apiLatencyMs = Date.now() - t0;

    // 7. Safety validation
    const screenSize = {
      screenWidth: input.screenshotWidth || 1080,
      screenHeight: input.screenshotHeight || 2400,
    };
    const action = this.safetyGuard.validate(rawResponse.action as DeviceAction, screenSize);

    // 8. Assemble decision
    const decision: DecisionOutput = {
      decisionId: `${route.model}-${Date.now()}-${session.stepNumber}`,
      thinking: rawResponse.thinking,
      action,
      confidence: rawResponse.confidence,
      finished: rawResponse.finished,
      needScreenshot: rawResponse.needScreenshot || false,
      nextStepHint: rawResponse.nextStepHint,
      modelUsed: route.model,
    };

    // 9. Update session state — strip screenshot from history to limit memory
    session.stepNumber++;
    const historyInput = { ...input, screenshotBase64: undefined };
    // Cap history at maxSteps to prevent unbounded growth
    if (session.history.length >= session.maxSteps) {
      session.history.shift();
    }
    session.history.push({ input: historyInput, decision, route, timestamp: Date.now(), apiLatencyMs });
    this.updateSessionStats(session, decision);

    // 10. Update route stats
    this.routeStats[route.model === "deepseek" ? "deepseekCount" : "qwenVLCount"]++;
    const reasonCount = this.routeStats.switchReasons.get(route.reason) || 0;
    this.routeStats.switchReasons.set(route.reason, reasonCount + 1);

    // 11. Callback
    this.onDecision?.(input.deviceId, decision, route);

    // 12. Termination check
    if (decision.finished) {
      this.sessions.delete(input.deviceId);
      this.onComplete?.(input.deviceId, {
        deviceId: input.deviceId,
        status: "completed",
        message: decision.nextStepHint,
        totalSteps: session.stepNumber,
        durationMs: Date.now() - session.startedAt,
      });
    }

    return { decision, route };
  }

  // ── Route Decision Logic ──

  private determineRoute(input: DecisionInput, session: DecisionSession): RouteDecision {
    const hasScreenshot = !!input.screenshotBase64;

    // Condition 1: Anomaly flags -> VLM
    if (input.anomalyFlags.length > 0) {
      if (!hasScreenshot) {
        return { model: "deepseek", reason: "anomaly_detected", includeScreenshot: false };
      }
      return { model: "qwen-vl", reason: "anomaly_detected", includeScreenshot: true };
    }

    // Condition 2: Consecutive failures >= 3 -> VLM
    if (session.consecutiveFailures >= config.ROUTER_MAX_CONSECUTIVE_FAILURES) {
      if (!hasScreenshot) {
        return { model: "deepseek", reason: "stuck_loop", includeScreenshot: false };
      }
      return { model: "qwen-vl", reason: "stuck_loop", includeScreenshot: true };
    }

    // Condition 3: Consecutive low confidence >= 3 -> VLM
    if (session.consecutiveLowConfidence >= config.ROUTER_MAX_LOW_CONFIDENCE) {
      if (!hasScreenshot) {
        return { model: "deepseek", reason: "low_confidence", includeScreenshot: false };
      }
      return { model: "qwen-vl", reason: "low_confidence", includeScreenshot: true };
    }

    // Condition 4: Unknown page type -> VLM
    if (input.pageType === "PAGE_UNKNOWN") {
      if (!hasScreenshot) {
        return { model: "deepseek", reason: "unknown_page", includeScreenshot: false };
      }
      return { model: "qwen-vl", reason: "unknown_page", includeScreenshot: true };
    }

    // Condition 5: Last step requested screenshot -> VLM
    const lastStep = session.history[session.history.length - 1];
    if (lastStep?.decision?.needScreenshot && hasScreenshot) {
      return { model: "qwen-vl", reason: "need_screenshot", includeScreenshot: true };
    }

    // Condition 6: No screenshot -> force text
    if (!hasScreenshot) {
      return { model: "deepseek", reason: "force_text", includeScreenshot: false };
    }

    // Condition 7: Default -> text (DeepSeek)
    return { model: "deepseek", reason: "normal", includeScreenshot: false };
  }

  // ── Stats Tracking ──

  private updateSessionStats(session: DecisionSession, decision: DecisionOutput): void {
    if (decision.confidence < config.ROUTER_CONFIDENCE_THRESHOLD) {
      session.consecutiveLowConfidence++;
    } else {
      session.consecutiveLowConfidence = 0;
    }
  }

  recordStepFailure(deviceId: string): void {
    const session = this.sessions.get(deviceId);
    if (session) session.consecutiveFailures++;
  }

  recordStepSuccess(deviceId: string): void {
    const session = this.sessions.get(deviceId);
    if (session) session.consecutiveFailures = 0;
  }

  getRouteStats() {
    return {
      deepseekCount: this.routeStats.deepseekCount,
      qwenVLCount: this.routeStats.qwenVLCount,
      switchReasons: Object.fromEntries(this.routeStats.switchReasons),
      activeSessions: this.sessions.size,
    };
  }

  /** Remove sessions that have exceeded the TTL (zombie cleanup). */
  cleanupStaleSessions(): number {
    const now = Date.now();
    let removed = 0;
    for (const [deviceId, session] of this.sessions) {
      if (now - session.startedAt > this.SESSION_TTL_MS) {
        this.sessions.delete(deviceId);
        this.onComplete?.(deviceId, {
          deviceId,
          status: "timeout",
          message: "Session timed out (stale cleanup)",
          totalSteps: session.stepNumber,
          durationMs: now - session.startedAt,
        });
        removed++;
      }
    }
    return removed;
  }

  /** Release all resources: clear sessions, route stats, and expire any pending timers. */
  dispose(): void {
    for (const [deviceId, session] of this.sessions) {
      this.onComplete?.(deviceId, {
        deviceId,
        status: "cancelled",
        message: "Server shutting down",
        totalSteps: session.stepNumber,
        durationMs: Date.now() - session.startedAt,
      });
    }
    this.sessions.clear();
    this.routeStats.clear();
  }

  // ── Internal ──

  private buildRuleDecision(rule: NonNullable<MemoryContext["exactRule"]>): DecisionOutput {
    return {
      decisionId: `rule-${Date.now()}`,
      thinking: `自动规则匹配: ${rule.scenario}`,
      action: rule.auto_action as DeviceAction,
      confidence: rule.confidence,
      finished: false,
      needScreenshot: false,
      nextStepHint: `规则匹配: ${rule.scenario}`,
      modelUsed: "rule",
    };
  }

  private terminate(deviceId: string, session: DecisionSession, reason: string) {
    const decision: DecisionOutput = {
      decisionId: `term-${Date.now()}`,
      thinking: `达到限制: ${reason}`,
      action: { type: "terminate", message: reason },
      confidence: 1.0,
      finished: true,
      needScreenshot: false,
      nextStepHint: reason,
      modelUsed: "none",
    };
    this.sessions.delete(deviceId);
    return { decision, route: { model: "deepseek" as const, reason: "normal" as const, includeScreenshot: false } };
  }
}
