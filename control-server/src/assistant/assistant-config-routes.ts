/**
 * Assistant Config Routes — session management and configuration for AI Assistant.
 *
 * Endpoints:
 *   GET  /api/v1/assistant/config           — get assistant configuration for mobile client
 *   POST /api/v1/assistant/sessions         — create a new assistant session
 *   PUT  /api/v1/assistant/sessions/:id     — update session (tokens, steps, complete)
 *   GET  /api/v1/assistant/sessions         — list user's sessions
 *   GET  /api/v1/assistant/sessions/:id     — get session detail
 */
import type { FastifyInstance } from "fastify";
import { creditService } from "../billing/credit-service.js";
import { db, pool } from "../db.js";
import { eq, desc, and } from "drizzle-orm";

export async function assistantConfigRoutes(app: FastifyInstance): Promise<void> {

  /** GET /assistant/config — configuration for mobile client */
  app.get("/api/v1/assistant/config", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const [balance, pricing] = await Promise.all([
      creditService.getBalance(userId),
      creditService.getActivePricing(),
    ]);

    return reply.send({
      models: {
        brain: pricing.filter((p: any) => p.modelType === "brain").map((p: any) => ({
          modelName: p.modelName,
          inputTokensPerCredit: p.inputTokensPerCredit,
          outputTokensPerCredit: p.outputTokensPerCredit,
        })),
        vision: pricing.filter((p: any) => p.modelType === "vision").map((p: any) => ({
          modelName: p.modelName,
          inputTokensPerCredit: p.inputTokensPerCredit,
          outputTokensPerCredit: p.outputTokensPerCredit,
        })),
      },
      credits: {
        userId: balance.userId,
        balance: balance.balance,
        totalEarned: balance.totalEarned,
        totalSpent: balance.totalSpent,
      },
      limits: {
        minCreditsForChat: 1,
        minCreditsForVision: 2,
        maxStepsPerSession: 50,
        stepTimeoutMs: 30000,
      },
    });
  });

  /** POST /assistant/sessions — create a new session */
  app.post("/api/v1/assistant/sessions", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const { deviceId, title } = req.body as {
      deviceId?: string; title?: string;
    };

    const sessionId = await creditService.createSession(userId, deviceId || "unknown", title);
    return reply.status(201).send({ sessionId });
  });

  /** PUT /assistant/sessions/:id — update session tokens/steps/status */
  app.put("/api/v1/assistant/sessions/:id", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const { id } = req.params as { id: string };
    const { tokens, steps, status } = req.body as {
      tokens?: number; steps?: number; status?: string;
    };

    if (tokens != null && steps != null) {
      await creditService.updateSessionTokens(id, tokens, steps);
    }
    if (status) {
      await creditService.completeSession(id, status);
    }

    return reply.send({ ok: true });
  });

  /** GET /assistant/sessions — list user's sessions */
  app.get("/api/v1/assistant/sessions", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const { limit, offset } = req.query as Record<string, string>;
    const result = await pool.query(
      `SELECT * FROM assistant_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, Number(limit) || 20, Number(offset) || 0],
    );
    return reply.send({ sessions: result.rows, total: result.rows.length });
  });

  /** GET /assistant/sessions/:id — get session detail */
  app.get("/api/v1/assistant/sessions/:id", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const { id } = req.params as { id: string };
    const result = await pool.query(
      `SELECT * FROM assistant_sessions WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: "Session not found" });
    }
    return reply.send(result.rows[0]);
  });
}
