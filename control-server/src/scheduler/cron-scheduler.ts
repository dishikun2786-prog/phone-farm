/**
 * PhoneFarm Cron Scheduler — node-cron based task scheduling engine.
 * Scans enabled tasks table, matches cron expressions, enqueues to Redis.
 */
import { schedule, validate } from "node-cron";
import type { ScheduledTask } from "node-cron";
import type { FastifyInstance } from "fastify";

interface CronJobRecord {
  id: string;
  taskId: string;
  cronExpr: string;
  deviceIds: string[];
  enabled: boolean;
  lastRunAt?: number;
  nextRunAt?: number;
}

export class CronScheduler {
  private jobs = new Map<string, ScheduledTask>();
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /** Load all enabled cron jobs from DB and schedule them */
  async loadAndStart(): Promise<void> {
    const records = await this.fetchEnabledJobs();
    for (const record of records) {
      this.scheduleJob(record);
    }
    this.fastify.log.info(`[CronScheduler] Loaded ${records.length} cron jobs`);
  }

  /** Schedule a single cron job */
  scheduleJob(record: CronJobRecord): void {
    if (!validate(record.cronExpr)) {
      this.fastify.log.warn(`[CronScheduler] Invalid cron expr: ${record.cronExpr} for task ${record.taskId}`);
      return;
    }

    const task = schedule(record.cronExpr, async () => {
      this.fastify.log.info(`[CronScheduler] Triggered: ${record.taskId} (${record.cronExpr})`);
      try {
        await this.enqueueTask(record);
        await this.updateLastRun(record.taskId);
      } catch (err) {
        this.fastify.log.error(`[CronScheduler] Failed to enqueue ${record.taskId}: ${err}`);
      }
    }, { timezone: "Asia/Shanghai" });

    this.jobs.set(record.taskId, task);
  }

  /** Stop and remove a single cron job */
  unscheduleJob(taskId: string): void {
    const task = this.jobs.get(taskId);
    if (task) {
      task.stop();
      this.jobs.delete(taskId);
    }
  }

  /** Reload all jobs (called after DB changes) */
  async reload(): Promise<void> {
    this.stopAll();
    await this.loadAndStart();
  }

  /** Stop all scheduled jobs */
  stopAll(): void {
    for (const [id, task] of this.jobs) {
      task.stop();
    }
    this.jobs.clear();
  }

  private async fetchEnabledJobs(): Promise<CronJobRecord[]> {
    try {
      // Try loading from CronStore (in-memory, used by dev-server)
      const cronStore = (this.fastify as any).cronStore;
      if (cronStore?.getEnabled) {
        return await cronStore.getEnabled();
      }
    } catch { /* fall through to DB */ }

    try {
      // Try loading from DB (production mode)
      const { db } = await import("../db.js");
      const { tasks: tasksTable } = await import("../schema.js");
      const { and, isNotNull, eq, ne } = await import("drizzle-orm");
      if (db) {
        const rows = await db
          .select()
          .from(tasksTable)
          .where(
            and(
              isNotNull(tasksTable.cronExpr),
              ne(tasksTable.cronExpr, ""),
              eq(tasksTable.enabled, true),
            ),
          );
        return rows.map((row) => ({
          id: row.id,
          taskId: row.id,
          cronExpr: row.cronExpr!,
          deviceIds: row.deviceId ? [row.deviceId] : [],
          enabled: row.enabled ?? true,
        }));
      }
    } catch {
      // DB not available — no jobs
    }
    return [];
  }

  private async enqueueTask(record: CronJobRecord): Promise<void> {
    // Push to task queue (Redis BullMQ in production)
    try {
      const taskQueue = (this.fastify as any).taskQueue;
      if (taskQueue?.add) {
        for (const deviceId of record.deviceIds) {
          await taskQueue.add(record.taskId, {
            taskId: record.taskId,
            deviceId,
            triggeredBy: "cron",
            cronExpr: record.cronExpr,
          });
        }
        return;
      }
    } catch { /* TaskQueue not available */ }

    // Fallback: notify devices directly via WebSocket hub
    try {
      const hub = (this.fastify as any).wsHub;
      if (hub?.sendToDevice) {
        for (const deviceId of record.deviceIds) {
          hub.sendToDevice(deviceId, {
            type: "start_task",
            taskId: record.taskId,
            scriptName: "cron_task",
            config: {},
            priority: 0,
          });
        }
      }
    } catch { /* WebSocket hub not available */ }
  }

  private async updateLastRun(taskId: string): Promise<void> {
    try {
      // Update CronStore
      const cronStore = (this.fastify as any).cronStore;
      if (cronStore?.updateLastRun) {
        await cronStore.updateLastRun(taskId);
        return;
      }
    } catch { /* fall through to DB */ }

    try {
      // Update DB task last_run_at
      const { db } = await import("../db.js");
      const { tasks: tasksTable } = await import("../schema.js");
      const { eq } = await import("drizzle-orm");
      if (db) {
        await db
          .update(tasksTable)
          .set({ updatedAt: new Date() })
          .where(eq(tasksTable.id, taskId));
      }
    } catch {
      // DB not available — skip
    }
  }
}

let instance: CronScheduler | null = null;

export function getCronScheduler(fastify?: FastifyInstance): CronScheduler {
  if (!instance && fastify) {
    instance = new CronScheduler(fastify);
  }
  if (!instance) throw new Error("CronScheduler not initialized");
  return instance;
}
