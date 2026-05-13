/**
 * AI Memory Advisor Routes — 智能内存调度 REST API
 *
 * Endpoints:
 *   GET  /api/v1/ai-memory/status       调度器状态 + 内存快照
 *   GET  /api/v1/ai-memory/history       最近的调度历史
 *   GET  /api/v1/ai-memory/stats         AI决策统计 + 模式记忆
 *   POST /api/v1/ai-memory/check         手动触发一次检查
 */
import type { FastifyInstance } from "fastify";
import type { MemoryScheduler } from "./memory-scheduler.js";

export function registerAiMemoryRoutes(
  app: FastifyInstance,
  scheduler: MemoryScheduler,
): void {

  app.get("/api/v1/ai-memory/status", async (_req, reply) => {
    const state = scheduler.getState();
    const advisor = scheduler.getAdvisor();
    return reply.send({
      running: state.running,
      lastCheck: state.lastCheck ? new Date(state.lastCheck).toISOString() : null,
      lastAction: state.lastAction ? new Date(state.lastAction).toISOString() : null,
      pausedProcesses: state.pausedProcesses,
      currentSnapshot: state.currentSnapshot,
      lastDecision: state.lastDecision,
      stats: state.stats,
      memory: advisor.getMemory(),
    });
  });

  app.get("/api/v1/ai-memory/history", async (_req, reply) => {
    const state = scheduler.getState();
    return reply.send({
      history: state.history.slice(-50),
      pausedProcesses: state.pausedProcesses,
    });
  });

  app.get("/api/v1/ai-memory/stats", async (_req, reply) => {
    const advisor = scheduler.getAdvisor();
    return reply.send(advisor.getStats());
  });

  app.post("/api/v1/ai-memory/check", async (_req, reply) => {
    const result = await scheduler.forceCheck();
    return reply.send(result);
  });
}
