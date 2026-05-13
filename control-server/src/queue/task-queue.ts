/**
 * PhoneFarm Task Queue — BullMQ (ioredis) based priority task queue.
 * Supports P0-P3 priority, delayed jobs, retry with exponential backoff, dead letter queue.
 */
import { Queue, Worker, type Job } from "bullmq";
import type { FastifyInstance } from "fastify";
import { getRedisClient } from "./redis-client.js";

export type TaskPriority = 0 | 1 | 2 | 3; // P0=urgent P1=high P2=medium P3=low

export interface TaskJob {
  taskId: string;
  deviceId: string;
  scriptName: string;
  config: Record<string, unknown>;
  priority: TaskPriority;
  retryCount: number;
  maxRetries: number;
}

const QUEUE_NAME = "phonefarm-tasks";
const MAX_RETRIES = 3;

export class TaskQueueManager {
  private queue: Queue;
  private worker: Worker;
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
    const connection = getRedisClient();

    this.queue = new Queue(QUEUE_NAME, { connection });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        return this.processJob(job.data as TaskJob);
      },
      {
        connection,
        concurrency: 10,
        limiter: { max: 100, duration: 60000 },
      },
    );

    this.worker.on("completed", (job: Job) => {
      this.fastify.log.info(`[TaskQueue] Job ${job.id} completed: ${(job.data as TaskJob).taskId}`);
    });

    this.worker.on("failed", (job: Job | undefined, err: Error) => {
      this.fastify.log.error(`[TaskQueue] Job ${job?.id} failed: ${err.message}`);
    });
  }

  /** Enqueue a task with priority */
  async enqueue(job: TaskJob): Promise<string> {
    const queued = await this.queue.add(job.scriptName, job, {
      priority: job.priority,
      delay: 0,
      attempts: job.maxRetries || MAX_RETRIES,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    this.fastify.log.info(`[TaskQueue] Enqueued ${job.taskId} (priority=${job.priority}) as ${queued.id}`);
    return queued.id ?? "";
  }

  /** Enqueue multiple tasks in bulk */
  async enqueueBulk(jobs: TaskJob[]): Promise<void> {
    const items = jobs.map((j) => ({
      name: j.scriptName,
      data: j,
      opts: {
        priority: j.priority,
        attempts: j.maxRetries || MAX_RETRIES,
        backoff: { type: "exponential" as const, delay: 5000 },
      },
    }));
    await this.queue.addBulk(items);
  }

  /** Get queue statistics */
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  }

  /** Get waiting jobs with pagination */
  async getWaitingJobs(limit = 50, offset = 0): Promise<Array<{ id: string; data: TaskJob }>> {
    const jobs = await this.queue.getWaiting(offset, offset + limit - 1);
    return jobs.map((j) => ({ id: j.id ?? "", data: j.data as TaskJob }));
  }

  /** Get active (currently processing) jobs */
  async getActiveJobs(): Promise<Array<{ id: string; data: TaskJob }>> {
    const jobs = await this.queue.getActive();
    return jobs.map((j) => ({ id: j.id ?? "", data: j.data as TaskJob }));
  }

  /** Get failed jobs (dead letter queue) */
  async getFailedJobs(limit = 50): Promise<Array<{ id: string; data: TaskJob; failedReason: string }>> {
    const jobs = await this.queue.getFailed(0, limit - 1);
    return jobs.map((j) => ({
      id: j.id ?? "",
      data: j.data as TaskJob,
      failedReason: j.failedReason ?? "",
    }));
  }

  /** Retry a failed job */
  async retryJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.retry();
    }
  }

  /** Remove a job from the queue */
  async removeJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  }

  /** Drain all waiting jobs */
  async drainWaiting(): Promise<void> {
    await this.queue.drain();
  }

  /** Drain all failed jobs */
  async drainFailed(): Promise<void> {
    await this.queue.clean(0, 0, "failed");
  }

  /** Get jobs associated with a specific device */
  async getJobsByDevice(deviceId: string): Promise<Array<{ id: string; data: TaskJob; status: string }>> {
    // Scan across all job states for the given deviceId
    const results: Array<{ id: string; data: TaskJob; status: string }> = [];
    const states: Array<"waiting" | "active" | "completed" | "failed" | "delayed"> = [
      "waiting", "active", "completed", "failed", "delayed",
    ];
    for (const state of states) {
      let jobs: Job[] = [];
      switch (state) {
        case "waiting": jobs = await this.queue.getWaiting(); break;
        case "active": jobs = await this.queue.getActive(); break;
        case "completed": jobs = await this.queue.getCompleted(); break;
        case "failed": jobs = await this.queue.getFailed(); break;
        case "delayed": jobs = await this.queue.getDelayed(); break;
      }
      for (const j of jobs) {
        const data = j.data as TaskJob;
        if (data.deviceId === deviceId) {
          results.push({ id: j.id ?? "", data, status: state });
        }
      }
    }
    return results;
  }

  private async processJob(data: TaskJob): Promise<void> {
    // Send start_task via WebSocket to the target device
    const hub = (this.fastify as any).wsHub;
    if (hub) {
      await hub.sendToDevice(data.deviceId, {
        type: "start_task",
        taskId: data.taskId,
        scriptName: data.scriptName,
        config: data.config,
      });
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}
