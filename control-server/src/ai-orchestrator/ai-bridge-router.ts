/**
 * AiBridgeRouter — AI Agent 消息路由器。
 *
 * 挂载在 BridgeServer 内部，负责：
 *   1. 管理 AI Worker 连接 (DeepSeek agent 通过 /ws/ai/worker 接入)
 *   2. 将 Claude Code 的 task 消息路由到 DeepSeek worker
 *   3. 将 DeepSeek 的 progress/result 消息路由回 Claude Code (通过 control 隧道)
 *   4. 文件同步请求中转
 *
 * 对应 Autogen 架构中的 "GRPC Host" — 中心消息交换枢纽。
 */

import { WebSocket } from "ws";
import { randomUUID } from "crypto";
import type { AiMessage, AgentIdentity, AiTaskStatus } from "./types";

// ── Types ──

interface WorkerConn {
  ws: WebSocket;
  identity: AgentIdentity;
  connectedAt: Date;
  lastActivity: Date;
  currentTaskId?: string;
}

interface PendingTask {
  taskId: string;
  msg: AiMessage;
  createdAt: Date;
  /** 回调：当 worker 发回 progress 时调用，发送到 control 隧道 */
  onProgress: (msg: AiMessage) => void;
  onComplete: (msg: AiMessage) => void;
}

interface AiBridgeStats {
  workersConnected: number;
  pendingTasks: number;
  totalTasksProcessed: number;
}

// ── Constants ──

const AUTH_TIMEOUT_MS = 10_000;
const TASK_TIMEOUT_MS = 30 * 60_000; // 30 min max per task
const SWEEP_INTERVAL_MS = 30_000;

// ── AiBridgeRouter ──

export class AiBridgeRouter {
  #workers = new Map<string, WorkerConn>();
  #pendingTasks = new Map<string, PendingTask>();
  #authToken: string;
  #sweepTimer: ReturnType<typeof setInterval> | null = null;
  #totalTasksProcessed = 0;

  /**
   * 外部注入：当需要向 control 隧道发送消息时调用。
   * BridgeServer 在构造时注入此回调。
   */
  sendToControl: ((msg: AiMessage) => void) | null = null;

  /**
   * 外部注入：当需要向特定 worker 发送消息时调用。
   * 通常 = workerConn.ws.send(JSON.stringify(msg))
   */
  sendToWorker: ((workerId: string, msg: AiMessage) => void) | null = null;

  constructor(authToken: string) {
    this.#authToken = authToken;
    this.#sweepTimer = setInterval(() => this.#sweep(), SWEEP_INTERVAL_MS);
  }

  // ── Worker Connection Handler ──

  /**
   * 处理来自 /ws/ai/worker 的新连接。
   * BridgeServer 在 handleAiWorker 中调用此方法。
   */
  handleWorkerConnection(ws: WebSocket, remoteAddress: string): void {
    let authed = false;
    let workerId = "";
    let authTimeout: ReturnType<typeof setTimeout> | undefined;

    const failAuth = (reason: string) => {
      try {
        ws.send(JSON.stringify({ type: "ai_handshake_ack", success: false, error: reason }));
      } catch { /* */ }
      ws.close();
    };

    ws.on("message", (raw) => {
      try {
        // ---- First message must be handshake ----
        if (!authed) {
          const m = JSON.parse(raw.toString());
          if (m.type !== "ai_handshake" || !m.payload?.agent || !m.payload?.token) {
            return failAuth("Handshake required: { type: 'ai_handshake', payload: { agent, token } }");
          }
          if (m.payload.token !== this.#authToken) {
            return failAuth("Invalid AI auth token");
          }

          authed = true;
          workerId = m.payload.agent.instanceId;
          clearTimeout(authTimeout);

          const conn: WorkerConn = {
            ws,
            identity: m.payload.agent,
            connectedAt: new Date(),
            lastActivity: new Date(),
          };

          // Replace previous connection for same worker
          const prev = this.#workers.get(workerId);
          if (prev) {
            try { prev.ws.close(); } catch { /* */ }
          }
          this.#workers.set(workerId, conn);

          ws.send(JSON.stringify({
            type: "ai_handshake_ack",
            msgId: randomUUID(),
            ts: new Date().toISOString(),
            payload: { success: true, workerId },
          }));

          // Notify control (Claude Code) that worker is online
          this.#notifyControl({
            type: "ai_task_progress",
            msgId: randomUUID(),
            taskId: "__system__",
            from: conn.identity,
            ts: new Date().toISOString(),
            payload: {
              status: "accepted" as AiTaskStatus,
              currentStep: `Worker ${workerId} (${conn.identity.label}) connected from ${remoteAddress}`,
            },
          });

          console.log(`[AiBridge] Worker connected: ${workerId} (${conn.identity.label})`);
          return;
        }

        // ---- Authenticated — route message ----
        const conn = this.#workers.get(workerId);
        if (!conn) return;
        conn.lastActivity = new Date();

        const msg: AiMessage = JSON.parse(raw.toString());
        this.#routeFromWorker(workerId, msg);
      } catch {
        // Malformed message — ignore
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimeout);
      if (authed && workerId) {
        const conn = this.#workers.get(workerId);
        this.#workers.delete(workerId);
        this.#notifyControl({
          type: "ai_task_progress",
          msgId: randomUUID(),
          taskId: "__system__",
          from: conn?.identity ?? { role: "deepseek-worker", instanceId: workerId, capabilities: [] },
          ts: new Date().toISOString(),
          payload: { status: "failed" as AiTaskStatus, currentStep: `Worker ${workerId} disconnected` },
        });
        console.log(`[AiBridge] Worker disconnected: ${workerId}`);
      }
    });

    ws.on("error", () => {
      // Handled by close
    });

    authTimeout = setTimeout(() => {
      if (!authed) failAuth("Handshake timeout");
    }, AUTH_TIMEOUT_MS);
  }

  // ── Control → Worker (Claude Code 发来任务) ──

  /**
   * 从 control 隧道收到消息，路由到目标 worker。
   * BridgeServer 在 handleControl 中遇到 ai_* 消息时调用此方法。
   */
  routeFromControl(msg: AiMessage): void {
    switch (msg.type) {
      case "ai_task_assign": {
        // Find an available worker with matching capability
        const worker = this.#findWorker(msg);
        if (!worker) {
          this.#notifyControl({
            type: "ai_task_failed",
            msgId: randomUUID(),
            taskId: msg.taskId,
            from: { role: "deepseek-worker", instanceId: "router", capabilities: [] },
            ts: new Date().toISOString(),
            payload: {
              success: false,
              summary: "No available worker with required capabilities",
            },
          });
          return;
        }

        // Track pending task
        this.#pendingTasks.set(msg.taskId!, {
          taskId: msg.taskId!,
          msg,
          createdAt: new Date(),
          onProgress: (m) => this.#notifyControl(m),
          onComplete: (m) => {
            this.#notifyControl(m);
            this.#pendingTasks.delete(msg.taskId!);
            this.#totalTasksProcessed++;
          },
        });

        // Assign task to worker
        worker.currentTaskId = msg.taskId;
        try {
          worker.ws.send(JSON.stringify(msg));
        } catch {
          this.#pendingTasks.delete(msg.taskId!);
          this.#notifyControl({
            type: "ai_task_failed",
            msgId: randomUUID(),
            taskId: msg.taskId,
            from: { role: "deepseek-worker", instanceId: "router", capabilities: [] },
            ts: new Date().toISOString(),
            payload: { success: false, summary: "Failed to send task to worker" },
          });
        }
        break;
      }

      case "ai_approval_res": {
        // Forward approval response to the worker handling this task
        const task = this.#pendingTasks.get(msg.taskId!);
        if (task) {
          // Find worker handling this task
          for (const [, w] of this.#workers) {
            if (w.currentTaskId === msg.taskId) {
              try { w.ws.send(JSON.stringify(msg)); } catch { /* */ }
              break;
            }
          }
        }
        break;
      }

      case "ai_ping": {
        // Respond with pong + worker info
        const workers = Array.from(this.#workers.values()).map(w => ({
          identity: w.identity,
          online: w.ws.readyState === WebSocket.OPEN,
          currentTask: w.currentTaskId,
          connectedAt: w.connectedAt.toISOString(),
        }));
        this.#notifyControl({
          type: "ai_pong",
          msgId: randomUUID(),
          taskId: msg.taskId,
          from: { role: "deepseek-worker", instanceId: "router", capabilities: [] },
          ts: new Date().toISOString(),
          payload: { workers },
        });
        break;
      }
    }
  }

  // ── Worker → Control (DeepSeek 发回结果) ──

  #routeFromWorker(workerId: string, msg: AiMessage): void {
    switch (msg.type) {
      case "ai_task_accept":
      case "ai_task_reject":
      case "ai_task_progress":
      case "ai_stream_chunk":
      case "ai_stream_end":
      case "ai_task_complete":
      case "ai_task_failed":
      case "ai_approval_req": {
        // Forward to control (Claude Code)
        this.#notifyControl(msg);

        // Update pending task tracking
        const task = this.#pendingTasks.get(msg.taskId!);
        if (task) {
          if (msg.type === "ai_task_complete" || msg.type === "ai_task_failed") {
            task.onComplete(msg);
          } else {
            task.onProgress(msg);
          }
        }

        // Clear worker current task
        if (msg.type === "ai_task_complete" || msg.type === "ai_task_failed") {
          const worker = this.#workers.get(workerId);
          if (worker) worker.currentTaskId = undefined;
        }
        break;
      }

      case "ai_file_req": {
        // File request from worker → forward to control
        this.#notifyControl(msg);
        break;
      }

      case "ai_pong": {
        this.#notifyControl(msg);
        break;
      }
    }
  }

  // ── Stats ──

  getStats(): AiBridgeStats {
    return {
      workersConnected: this.#workers.size,
      pendingTasks: this.#pendingTasks.size,
      totalTasksProcessed: this.#totalTasksProcessed,
    };
  }

  /** 获取当前在线 worker 列表 */
  getWorkers(): AgentIdentity[] {
    return Array.from(this.#workers.values()).map(w => w.identity);
  }

  // ── Cleanup ──

  destroy(): void {
    if (this.#sweepTimer) {
      clearInterval(this.#sweepTimer);
      this.#sweepTimer = null;
    }
    for (const [, conn] of this.#workers) {
      try { conn.ws.close(); } catch { /* */ }
    }
    this.#workers.clear();
    this.#pendingTasks.clear();
  }

  // ── Internal ──

  #notifyControl(msg: AiMessage): void {
    this.sendToControl?.(msg);
  }

  #findWorker(msg: AiMessage): WorkerConn | undefined {
    // Prefer worker with no current task
    for (const [, w] of this.#workers) {
      if (!w.currentTaskId && w.ws.readyState === WebSocket.OPEN) {
        return w;
      }
    }
    // Fallback: any connected worker
    for (const [, w] of this.#workers) {
      if (w.ws.readyState === WebSocket.OPEN) {
        return w;
      }
    }
    return undefined;
  }

  #sweep(): void {
    const now = Date.now();
    // Remove stale pending tasks
    for (const [id, task] of this.#pendingTasks) {
      if (now - task.createdAt.getTime() > TASK_TIMEOUT_MS) {
        this.#notifyControl({
          type: "ai_task_failed",
          msgId: randomUUID(),
          taskId: id,
          from: { role: "deepseek-worker", instanceId: "router", capabilities: [] },
          ts: new Date().toISOString(),
          payload: { success: false, summary: "Task timed out" },
        });
        this.#pendingTasks.delete(id);
      }
    }
  }
}
