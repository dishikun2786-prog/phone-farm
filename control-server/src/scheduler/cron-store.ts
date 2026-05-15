/**
 * PhoneFarm Cron Store — DB-backed persistent storage for scheduled cron job records.
 */
import { eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { cronJobs } from "../schema.js";

export interface CronJobRecord {
  id: string;
  taskId: string;
  cronExpr: string;
  deviceIds: string[];
  enabled: boolean;
  lastRunAt?: number;
  nextRunAt?: number;
  createdAt: number;
}

export class CronStore {
  private fastify: FastifyInstance;
  private cache = new Map<string, CronJobRecord>();
  private initialized = false;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const rows = await db.select().from(cronJobs);
    for (const row of rows) {
      this.cache.set(row.id, {
        id: row.id,
        taskId: row.taskId ?? '',
        cronExpr: row.cronExpr,
        deviceIds: (row.deviceIds as string[]) ?? [],
        enabled: row.enabled ?? false,
        lastRunAt: row.lastRunAt ? new Date(row.lastRunAt as unknown as string).getTime() : undefined,
        nextRunAt: row.nextRunAt ? new Date(row.nextRunAt as unknown as string).getTime() : undefined,
        createdAt: row.createdAt ? new Date(row.createdAt as unknown as string).getTime() : Date.now(),
      });
    }
    this.initialized = true;
    this.fastify.log.info(`[CronStore] Loaded ${rows.length} cron jobs from DB`);
  }

  async getAll(): Promise<CronJobRecord[]> {
    if (!this.initialized) await this.initialize();
    return Array.from(this.cache.values());
  }

  async getEnabled(): Promise<CronJobRecord[]> {
    if (!this.initialized) await this.initialize();
    return Array.from(this.cache.values()).filter((j) => j.enabled);
  }

  async getById(id: string): Promise<CronJobRecord | undefined> {
    if (!this.initialized) await this.initialize();
    return this.cache.get(id);
  }

  async upsert(job: CronJobRecord): Promise<void> {
    const existing = await db.select().from(cronJobs).where(eq(cronJobs.id, job.id)).limit(1);
    if (existing.length > 0) {
      await db.update(cronJobs)
        .set({
          cronExpr: job.cronExpr,
          deviceIds: job.deviceIds,
          enabled: job.enabled,
          lastRunAt: job.lastRunAt ? new Date(job.lastRunAt) : null,
          nextRunAt: job.nextRunAt ? new Date(job.nextRunAt) : null,
        })
        .where(eq(cronJobs.id, job.id));
    } else {
      await db.insert(cronJobs).values({
        id: job.id,
        taskId: job.taskId,
        cronExpr: job.cronExpr,
        deviceIds: job.deviceIds as any,
        enabled: job.enabled,
        lastRunAt: job.lastRunAt ? new Date(job.lastRunAt) : null,
        nextRunAt: job.nextRunAt ? new Date(job.nextRunAt) : null,
      });
    }
    this.cache.set(job.id, job);
  }

  async updateLastRun(id: string): Promise<void> {
    const now = new Date();
    await db.update(cronJobs).set({ lastRunAt: now }).where(eq(cronJobs.id, id));
    const job = this.cache.get(id);
    if (job) job.lastRunAt = Date.now();
  }

  async remove(id: string): Promise<void> {
    await db.delete(cronJobs).where(eq(cronJobs.id, id));
    this.cache.delete(id);
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await db.update(cronJobs).set({ enabled }).where(eq(cronJobs.id, id));
    const job = this.cache.get(id);
    if (job) job.enabled = enabled;
  }
}
