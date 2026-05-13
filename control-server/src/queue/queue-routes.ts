/**
 * PhoneFarm Queue Routes — 任务队列监控 API
 * Supports BullMQ when Redis >= 6.2.0, gracefully degrades otherwise.
 */
import type { FastifyInstance } from "fastify";

export async function queueRoutes(app: FastifyInstance): Promise<void> {
  let manager: any = null;
  let queueAvailable = false;

  try {
    const { TaskQueueManager } = await import("./task-queue");
    manager = new TaskQueueManager(app);
    queueAvailable = true;
    app.log.info("[queue] BullMQ initialized");
  } catch (err: any) {
    app.log.warn(`[queue] BullMQ unavailable: ${err.message}. Queue endpoints will return empty.`);
  }

  app.get("/api/v1/queue/stats", async (_req, reply) => {
    if (!queueAvailable) return reply.send({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 });
    const stats = await manager.getStats();
    return reply.send(stats);
  });

  app.get("/api/v1/queue/waiting", async (req, reply) => {
    if (!queueAvailable) return reply.send({ jobs: [] });
    const { limit, offset } = req.query as Record<string, string>;
    const jobs = await manager.getWaitingJobs(Number(limit) || 50, Number(offset) || 0);
    return reply.send({ jobs });
  });

  app.get("/api/v1/queue/active", async (_req, reply) => {
    if (!queueAvailable) return reply.send({ jobs: [] });
    const jobs = await manager.getActiveJobs();
    return reply.send({ jobs });
  });

  app.get("/api/v1/queue/failed", async (_req, reply) => {
    if (!queueAvailable) return reply.send({ jobs: [] });
    const jobs = await manager.getFailedJobs();
    return reply.send({ jobs });
  });

  app.post("/api/v1/queue/:jobId/retry", async (req, reply) => {
    if (!queueAvailable) return reply.status(503).send({ error: "Queue unavailable — Redis >= 6.2 required" });
    const { jobId } = req.params as Record<string, string>;
    await manager.retryJob(jobId);
    return { success: true };
  });

  app.delete("/api/v1/queue/:jobId", async (req, reply) => {
    if (!queueAvailable) return reply.status(503).send({ error: "Queue unavailable — Redis >= 6.2 required" });
    const { jobId } = req.params as Record<string, string>;
    await manager.removeJob(jobId);
    return { success: true };
  });

  app.post("/api/v1/queue/drain", async (_req, reply) => {
    if (!queueAvailable) return reply.status(503).send({ error: "Queue unavailable — Redis >= 6.2 required" });
    await manager.drain();
    return { success: true };
  });
}
