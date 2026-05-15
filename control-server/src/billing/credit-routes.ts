/**
 * Credit Routes — user-facing credit balance and transaction API.
 *
 * Endpoints:
 *   GET  /api/v1/credits/balance       — get user credit balance
 *   GET  /api/v1/credits/transactions  — get user transaction history
 *   POST /api/v1/credits/check         — check if user has enough credits
 */
import type { FastifyInstance } from "fastify";
import { creditService } from "./credit-service.js";

export async function creditRoutes(app: FastifyInstance): Promise<void> {

  app.get("/api/v1/credits/balance", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const balance = await creditService.getBalance(userId);
    return reply.send(balance);
  });

  app.get("/api/v1/credits/transactions", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const { limit, offset } = req.query as Record<string, string>;
    const transactions = await creditService.getTransactions(
      userId,
      Number(limit) || 50,
      Number(offset) || 0,
    );
    return reply.send({ transactions, total: transactions.length });
  });

  app.post("/api/v1/credits/check", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const { minRequired } = req.body as { minRequired: number };
    if (minRequired == null) {
      return reply.status(400).send({ error: "minRequired is required" });
    }

    const enough = await creditService.hasEnoughCredits(userId, minRequired);
    const balance = await creditService.getBalance(userId);
    return reply.send({ enough, balance: balance.balance, minRequired });
  });
}
