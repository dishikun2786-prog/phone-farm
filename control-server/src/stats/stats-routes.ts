/**
 * PhoneFarm Stats Routes — VLM usage, device usage, task success rate, bandwidth stats.
 */
import type { FastifyInstance } from "fastify";
import { StatsCalculator } from "./stats-calculator.js";

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  const calculator = new StatsCalculator(app);

  // VLM usage stats
  app.get("/api/v1/stats/vlm-usage", async (req, reply) => {
    const query = req.query as Record<string, string>;
    const from = query.from ? Number(query.from) : Date.now() - 30 * 24 * 3600 * 1000;
    const to = query.to ? Number(query.to) : Date.now();

    try {
      const stats = await calculator.calcVlmUsage(from, to);
      return reply.send(stats);
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to compute VLM stats: ${err.message}` });
    }
  });

  // Device usage stats
  app.get("/api/v1/stats/device-usage", async (req, reply) => {
    const query = req.query as Record<string, string>;
    const from = query.from ? Number(query.from) : Date.now() - 30 * 24 * 3600 * 1000;
    const to = query.to ? Number(query.to) : Date.now();

    try {
      const stats = await calculator.calcDeviceUsage({
        deviceId: query.deviceId,
        from,
        to,
      });
      return reply.send(stats);
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to compute device stats: ${err.message}` });
    }
  });

  // Task success rate
  app.get("/api/v1/stats/task-success-rate", async (req, reply) => {
    const query = req.query as Record<string, string>;
    const from = query.from ? Number(query.from) : Date.now() - 30 * 24 * 3600 * 1000;
    const to = query.to ? Number(query.to) : Date.now();

    try {
      const stats = await calculator.calcTaskSuccessRate({
        from,
        to,
        platform: query.platform,
      });
      return reply.send(stats);
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to compute task success rate: ${err.message}` });
    }
  });

  // Bandwidth usage
  app.get("/api/v1/stats/bandwidth-usage", async (req, reply) => {
    const query = req.query as Record<string, string>;
    const from = query.from ? Number(query.from) : Date.now() - 30 * 24 * 3600 * 1000;
    const to = query.to ? Number(query.to) : Date.now();

    try {
      const stats = await calculator.calcBandwidthUsage({
        deviceId: query.deviceId,
        from,
        to,
      });
      return reply.send(stats);
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to compute bandwidth stats: ${err.message}` });
    }
  });

  // Platform account stats
  app.get("/api/v1/stats/platform-accounts", async (_req, reply) => {
    try {
      const stats = await calculator.calcPlatformAccountStats();
      return reply.send(stats);
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to compute platform account stats: ${err.message}` });
    }
  });

  // Server health
  app.get("/api/v1/stats/server-health", async (_req, reply) => {
    try {
      const health = await calculator.calcServerHealth();
      return reply.send(health);
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to compute server health: ${err.message}` });
    }
  });

  // Combined dashboard summary
  app.get("/api/v1/stats/summary", async (req, reply) => {
    const query = req.query as Record<string, string>;
    const from = query.from ? Number(query.from) : Date.now() - 24 * 3600 * 1000;
    const to = query.to ? Number(query.to) : Date.now();

    try {
      const [vlm, device, taskRate, health, accountStats] = await Promise.all([
        calculator.calcVlmUsage(from, to),
        calculator.calcDeviceUsage({ from, to }),
        calculator.calcTaskSuccessRate({ from, to }),
        calculator.calcServerHealth(),
        calculator.calcPlatformAccountStats(),
      ]);

      return reply.send({
        period: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
        vlm: {
          totalCalls: vlm.totalCalls,
          totalTokens: vlm.totalTokens,
          totalCostUsd: vlm.totalCostUsd,
        },
        tasks: {
          total: device.totalTasks,
          successRate: taskRate.overall,
          avgResponseTimeMs: device.avgResponseTimeMs,
        },
        platformAccounts: accountStats.byPlatform,
        health,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to compute summary: ${err.message}` });
    }
  });
}
