/**
 * PhoneFarm Stats Routes — VLM usage, device usage, task success rate, bandwidth stats.
 */
import type { FastifyInstance } from "fastify";
import { StatsCalculator } from "./stats-calculator.js";
import { pool } from "../db.js";

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

  // Assistant usage stats
  app.get("/api/v1/stats/assistant-usage", async (req, reply) => {
    const query = req.query as Record<string, string>;
    const from = query.from ? Number(query.from) : Date.now() - 7 * 24 * 3600 * 1000;
    const to = query.to ? Number(query.to) : Date.now();

    try {
      const fromDate = new Date(from).toISOString();
      const toDate = new Date(to).toISOString();

      const [
        sessionResult,
        creditResult,
        modelResult,
        deviceResult,
        dailyResult,
        errorResult,
      ] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) as total, COALESCE(SUM(total_steps),0) as steps, COALESCE(SUM(total_tokens),0) as tokens, COALESCE(SUM(credits_spent),0) as credits FROM assistant_sessions WHERE created_at >= $1 AND created_at <= $2`,
          [fromDate, toDate]
        ),
        pool.query(
          `SELECT COALESCE(SUM(CASE WHEN type = 'spend' THEN amount ELSE 0 END),0) as spent FROM credit_transactions WHERE scene = 'assistant_chat' AND created_at >= $1 AND created_at <= $2`,
          [fromDate, toDate]
        ),
        pool.query(
          `SELECT model_name as model, COUNT(*) as calls, COALESCE(SUM(input_tokens),0) + COALESCE(SUM(output_tokens),0) as tokens, COALESCE(SUM(credits_consumed),0) as credits FROM (SELECT id FROM assistant_sessions WHERE created_at >= $1 AND created_at <= $2) s LEFT JOIN (SELECT DISTINCT session_id, '' as model_name, 0 as input_tokens, 0 as output_tokens, 0 as credits_consumed FROM credit_transactions WHERE scene = 'assistant_chat') ct ON ct.session_id = s.id GROUP BY model_name`,
          [fromDate, toDate]
        ),
        pool.query(
          `SELECT device_id, COUNT(*) as sessions, COALESCE(SUM(total_steps),0) as steps, COALESCE(SUM(credits_spent),0) as credits FROM assistant_sessions WHERE created_at >= $1 AND created_at <= $2 GROUP BY device_id ORDER BY sessions DESC LIMIT 20`,
          [fromDate, toDate]
        ),
        pool.query(
          `SELECT DATE(created_at) as day, COUNT(*) as sessions, COALESCE(SUM(total_steps),0) as steps, COALESCE(SUM(credits_spent),0) as credits FROM assistant_sessions WHERE created_at >= $1 AND created_at <= $2 GROUP BY DATE(created_at) ORDER BY day`,
          [fromDate, toDate]
        ),
        pool.query(
          `SELECT id as session_id, device_id, 'error' as error, created_at as at FROM assistant_sessions WHERE status = 'error' AND created_at >= $1 AND created_at <= $2 ORDER BY created_at DESC LIMIT 10`,
          [fromDate, toDate]
        ),
      ]);

      const s = sessionResult.rows[0] || {};
      const totalSessions = parseInt(s.total ?? '0');
      const totalSteps = parseInt(s.steps ?? '0');
      const totalTokens = parseInt(s.tokens ?? '0');

      const modelMap: Record<string, { calls: number; tokens: number; creditsConsumed: number }> = {};
      for (const r of modelResult.rows) {
        const m = r.model || 'unknown';
        if (!modelMap[m]) modelMap[m] = { calls: 0, tokens: 0, creditsConsumed: 0 };
        modelMap[m].calls += parseInt(r.calls ?? '0');
        modelMap[m].tokens += parseInt(r.tokens ?? '0');
        modelMap[m].creditsConsumed += parseInt(r.credits ?? '0');
      }
      if (Object.keys(modelMap).length === 0 && totalSessions > 0) {
        modelMap['assistant'] = { calls: totalSessions, tokens: totalTokens, creditsConsumed: parseInt(s.credits ?? '0') };
      }

      const deviceMap: Record<string, { sessions: number; steps: number; creditsConsumed: number }> = {};
      for (const r of deviceResult.rows) {
        deviceMap[r.device_id || 'unknown'] = {
          sessions: parseInt(r.sessions ?? '0'),
          steps: parseInt(r.steps ?? '0'),
          creditsConsumed: parseInt(r.credits ?? '0'),
        };
      }

      const dayMap: Record<string, { sessions: number; steps: number; creditsConsumed: number }> = {};
      for (const r of dailyResult.rows) {
        dayMap[r.day] = {
          sessions: parseInt(r.sessions ?? '0'),
          steps: parseInt(r.steps ?? '0'),
          creditsConsumed: parseInt(r.credits ?? '0'),
        };
      }

      return reply.send({
        totalSessions,
        totalSteps,
        totalBrainCalls: totalSessions,
        totalVisionCalls: 0,
        totalInputTokens: totalTokens,
        totalOutputTokens: 0,
        totalCreditsConsumed: parseInt(creditResult.rows[0]?.spent ?? s.credits ?? '0'),
        avgStepsPerSession: totalSessions > 0 ? totalSteps / totalSessions : 0,
        avgDurationMs: 0,
        successRate: totalSessions > 0 ? (totalSessions - (errorResult.rows.length)) / totalSessions : 1,
        byModel: modelMap,
        byDevice: deviceMap,
        byDay: dayMap,
        recentErrors: errorResult.rows.map((r: any) => ({
          sessionId: r.session_id,
          deviceId: r.device_id,
          error: r.error || 'Unknown error',
          at: r.at,
        })),
      });
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to compute assistant stats: ${err.message}` });
    }
  });
}
