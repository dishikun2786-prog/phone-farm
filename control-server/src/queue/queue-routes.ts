/**
 * PhoneFarm Queue Routes — 任务队列监控 API
 */
import type { FastifyInstance } from "fastify";
import { TaskQueueManager } from "./task-queue";

export async function queueRoutes(app: FastifyInstance): Promise<void> {
  const manager = new TaskQueueManager(app);

  // 队列统计概览
  app.get("/api/v1/queue/stats", async (_req, reply) => {
    const stats = await manager.getStats();
    return reply.send(stats);
  });

  // 获取等待中的任务列表
  app.get("/api/v1/queue/waiting", async (req, reply) => {
    const { limit, offset } = req.query as Record<string, string>;
    const jobs = await manager.getWaitingJobs(
      Number(limit) || 50,
      Number(offset) || 0
    );
    return reply.send({ jobs });
  });

  // 获取活跃任务列表
  app.get("/api/v1/queue/active", async (_req, reply) => {
    const jobs = await manager.getActiveJobs();
    return reply.send({ jobs });
  });

  // 获取失败任务列表（死信队列）
  app.get("/api/v1/queue/failed", async (req, reply) => {
    const { limit } = req.query as Record<string, string>;
    const jobs = await manager.getFailedJobs(Number(limit) || 50);
    return reply.send({ jobs });
  });

  // 重试失败任务
  app.post("/api/v1/queue/jobs/:jobId/retry", async (req, reply) => {
    const { jobId } = req.params as { jobId: string };
    await manager.retryJob(jobId);
    return reply.send({ ok: true });
  });

  // 删除任务（从队列移除）
  app.delete("/api/v1/queue/jobs/:jobId", async (req, reply) => {
    const { jobId } = req.params as { jobId: string };
    await manager.removeJob(jobId);
    return reply.send({ ok: true });
  });

  // 清空等待队列
  app.post("/api/v1/queue/drain-waiting", async (_req, reply) => {
    await manager.drainWaiting();
    return reply.send({ ok: true });
  });

  // 清空失败队列
  app.post("/api/v1/queue/drain-failed", async (_req, reply) => {
    await manager.drainFailed();
    return reply.send({ ok: true });
  });

  // 按设备查询任务
  app.get("/api/v1/queue/jobs/by-device/:deviceId", async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const jobs = await manager.getJobsByDevice(deviceId);
    return reply.send({ jobs });
  });
}
