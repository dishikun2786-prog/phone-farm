/**
 * Admin Credit Routes — credit/pricing management for administrators.
 *
 * Endpoints:
 *   POST /api/v1/admin/credits/grant        — grant credits to a user
 *   GET  /api/v1/admin/credits/transactions — all transactions (with username)
 *   GET  /api/v1/admin/credits/overview     — aggregate credit stats
 *   GET  /api/v1/admin/credits/pricing      — get active token pricing
 *   PUT  /api/v1/admin/credits/pricing      — update token pricing
 */
import type { FastifyInstance } from "fastify";
import { creditService } from "./credit-service.js";
import type { AuthService } from "../auth/auth-middleware.js";
import { requireAuth, requirePermission } from "../auth/auth-middleware.js";

export async function adminCreditRoutes(app: FastifyInstance, authService: AuthService): Promise<void> {

  app.post("/api/v1/admin/credits/grant",
    { preHandler: [requireAuth(authService), requirePermission("billing", "write")] },
    async (req, reply) => {
      const adminUserId = (req as any).user?.userId;
      if (!adminUserId) return reply.status(401).send({ error: "Unauthorized" });

      const { userId, amount, note } = req.body as {
        userId: string; amount: number; note?: string;
      };
      if (!userId || amount == null || amount <= 0) {
        return reply.status(400).send({ error: "userId and positive amount are required" });
      }

      const balance = await creditService.grantCredits(userId, amount, adminUserId, note);
      return reply.send(balance);
    },
  );

  app.get("/api/v1/admin/credits/transactions",
    { preHandler: [requireAuth(authService), requirePermission("billing", "read")] },
    async (req, reply) => {
      const { limit, offset } = req.query as Record<string, string>;
      const { transactions, total } = await creditService.getAllTransactions(
        Number(limit) || 100,
        Number(offset) || 0,
      );
      return reply.send({ transactions, total });
    },
  );

  app.post("/api/v1/admin/credits/balances",
    { preHandler: [requireAuth(authService), requirePermission("billing", "read")] },
    async (req, reply) => {
      const { userIds } = req.body as { userIds: string[] };
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return reply.status(400).send({ error: "userIds array is required" });
      }
      if (userIds.length > 200) {
        return reply.status(400).send({ error: "max 200 userIds per request" });
      }
      const balances = await creditService.getBalances(userIds);
      const result: Record<string, { balance: number; totalEarned: number; totalSpent: number }> = {};
      for (const [uid, info] of balances) {
        result[uid] = { balance: info.balance, totalEarned: info.totalEarned, totalSpent: info.totalSpent };
      }
      return reply.send({ balances: result });
    },
  );

  app.get("/api/v1/admin/credits/overview",
    { preHandler: [requireAuth(authService), requirePermission("billing", "read")] },
    async (_req, reply) => {
      const overview = await creditService.getOverview();
      return reply.send(overview);
    },
  );

  app.get("/api/v1/admin/credits/pricing",
    { preHandler: [requireAuth(authService), requirePermission("billing", "read")] },
    async (_req, reply) => {
      const pricing = await creditService.getActivePricing();
      return reply.send({ pricing });
    },
  );

  app.put("/api/v1/admin/credits/pricing",
    { preHandler: [requireAuth(authService), requirePermission("billing", "write")] },
    async (req, reply) => {
      const { modelName, inputTokensPerCredit, outputTokensPerCredit } = req.body as {
        modelName: string; inputTokensPerCredit: number; outputTokensPerCredit: number;
      };
      if (!modelName || inputTokensPerCredit == null || outputTokensPerCredit == null) {
        return reply.status(400).send({ error: "modelName, inputTokensPerCredit, and outputTokensPerCredit are required" });
      }

      await creditService.updatePricing(modelName, inputTokensPerCredit, outputTokensPerCredit);
      return reply.send({ ok: true, modelName, inputTokensPerCredit, outputTokensPerCredit });
    },
  );
}
