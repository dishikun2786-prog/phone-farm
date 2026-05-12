/**
 * PhoneFarm Cron Store — persistent storage for scheduled cron job records.
 */
import type { FastifyInstance } from "fastify";

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
  private jobs = new Map<string, CronJobRecord>();

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  async getAll(): Promise<CronJobRecord[]> {
    return Array.from(this.jobs.values());
  }

  async getEnabled(): Promise<CronJobRecord[]> {
    return Array.from(this.jobs.values()).filter((j) => j.enabled);
  }

  async getById(id: string): Promise<CronJobRecord | undefined> {
    return this.jobs.get(id);
  }

  async upsert(job: CronJobRecord): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async updateLastRun(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      job.lastRunAt = Date.now();
    }
  }

  async remove(id: string): Promise<void> {
    this.jobs.delete(id);
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      job.enabled = enabled;
    }
  }
}
