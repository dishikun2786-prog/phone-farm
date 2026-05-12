/**
 * decision-routes.ts — 决策引擎 REST API + WebSocket 集成。
 *
 * 端点:
 *   POST /api/v1/decision/start
 *   POST /api/v1/decision/stop
 *   GET  /api/v1/decision/status/:deviceId
 *   GET  /api/v1/decision/stats
 */
import type { FastifyInstance } from "fastify";
import type { DecisionEngine } from "./decision-engine";
import type { DecisionRouter } from "./decision-router";

export function registerDecisionRoutes(app: FastifyInstance, engine: DecisionEngine): void {
  const router = engine.getRouter();

  // Start AI decision task
  app.post("/api/v1/decision/start", async (req, reply) => {
    const { deviceId, taskPrompt, maxSteps, platform } = req.body as {
      deviceId: string;
      taskPrompt: string;
      maxSteps?: number;
      platform?: string;
    };

    if (!deviceId || !taskPrompt) {
      return reply.status(400).send({ error: "deviceId and taskPrompt are required" });
    }

    engine.startTask(deviceId, taskPrompt, maxSteps, platform);
    return { status: "started", deviceId };
  });

  // Stop AI decision task
  app.post("/api/v1/decision/stop", async (req, reply) => {
    const { deviceId, reason } = req.body as { deviceId: string; reason?: string };

    if (!deviceId) {
      return reply.status(400).send({ error: "deviceId is required" });
    }

    engine.stopTask(deviceId, reason || "user_requested");
    return { status: "stopped", deviceId };
  });

  // Query decision status
  app.get("/api/v1/decision/status/:deviceId", async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const session = router.getSession(deviceId);

    if (!session) {
      return { deviceId, active: false };
    }

    return {
      deviceId,
      active: true,
      taskPrompt: session.taskPrompt,
      platform: session.platform,
      stepNumber: session.stepNumber,
      maxSteps: session.maxSteps,
      consecutiveFailures: session.consecutiveFailures,
      consecutiveLowConfidence: session.consecutiveLowConfidence,
      startedAt: new Date(session.startedAt).toISOString(),
      lastStep: session.history[session.history.length - 1]?.decision ?? null,
    };
  });

  // Route statistics
  app.get("/api/v1/decision/stats", async () => {
    return router.getRouteStats();
  });
}

/**
 * WebSocket 消息处理 — 在 ws-hub.ts 中调用。
 */
export function handleDecisionWsMessage(
  engine: DecisionEngine,
  msg: { type: string; payload: any; deviceId?: string },
): void {
  switch (msg.type) {
    case "edge_state": {
      const input = msg.payload as any;
      if (input?.deviceId) {
        engine.handleEdgeState(input);
      }
      break;
    }

    case "step_result": {
      const { deviceId, outcome } = msg.payload || {};
      if (deviceId && outcome) {
        engine.handleStepResult(deviceId, outcome);
      }
      break;
    }
  }
}
