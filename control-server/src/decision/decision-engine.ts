/**
 * DecisionEngine — 决策主循环 (替代 VlmOrchestrator)。
 *
 * 监听设备 EdgeState 上报, 循环调用 DecisionRouter.decide(),
 * 通过 WebSocket 下发决策到设备, 处理 step_result 反馈。
 */
import type { DecisionInput, DecisionOutput } from "./types";
import type { DecisionRouter } from "./decision-router";

export interface DecisionEngineCallbacks {
  /** 向设备下发执行决策 */
  sendToDevice(deviceId: string, decision: DecisionOutput): void;
  /** 决策会话完成/终止 */
  onTaskComplete(deviceId: string, result: { status: string; totalSteps: number; durationMs: number }): void;
}

export class DecisionEngine {
  private router: DecisionRouter;
  private callbacks: DecisionEngineCallbacks;

  constructor(router: DecisionRouter, callbacks: DecisionEngineCallbacks) {
    this.router = router;
    this.callbacks = callbacks;

    // Wire router callbacks
    this.router.onDecision = (deviceId, decision) => {
      this.callbacks.sendToDevice(deviceId, decision);
    };

    this.router.onComplete = (deviceId, result) => {
      this.callbacks.onTaskComplete(deviceId, result);
    };
  }

  /** 启动设备 AI 决策任务 */
  startTask(deviceId: string, taskPrompt: string, maxSteps?: number, platform?: string): void {
    this.router.startSession(deviceId, { taskPrompt, maxSteps, platform });
  }

  /** 停止设备 AI 决策任务 */
  stopTask(deviceId: string, reason = "user_requested"): void {
    this.router.stopSession(deviceId, reason);
  }

  /** 处理设备上报的 EdgeState */
  async handleEdgeState(input: DecisionInput): Promise<{ decision: DecisionOutput } | null> {
    if (!this.router.hasSession(input.deviceId)) return null;

    try {
      const result = await this.router.decide(input);
      return { decision: result.decision };
    } catch (err: any) {
      // Route error -> stop session
      this.router.stopSession(input.deviceId, `decision_error: ${err.message}`);
      return null;
    }
  }

  /** 设备回报步骤执行结果 */
  handleStepResult(deviceId: string, outcome: "success" | "fail"): void {
    if (outcome === "fail") {
      this.router.recordStepFailure(deviceId);
    } else {
      this.router.recordStepSuccess(deviceId);
    }
  }

  getRouter(): DecisionRouter {
    return this.router;
  }
}
