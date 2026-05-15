/**
 * PhoneFarm Webhook Engine — Event-driven HTTP callbacks.
 * Listens for system events, matches webhook subscriptions, delivers with HMAC-SHA256 signing.
 */
import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { webhookConfigs } from "../schema.js";
import { eq } from "drizzle-orm";

export type WebhookEvent =
  | "device.online"
  | "device.offline"
  | "task.completed"
  | "task.failed"
  | "task.timeout"
  | "activation.created"
  | "activation.used"
  | "activation.expired"
  | "alert.triggered"
  | "alert.resolved"
  | "plugin.installed"
  | "plugin.update_available"
  | "model.downloaded"
  | "model.loaded"
  | "crash.reported"
  | "security.alert";

export interface WebhookConfig {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  enabled: boolean;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
}

interface DeliveryLog {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  url: string;
  statusCode: number | null;
  success: boolean;
  error?: string;
  durationMs: number;
  timestamp: number;
}

const MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE = 2000; // 2s base
const REQUEST_TIMEOUT_MS = 10000;

export class WebhookEngine {
  private configs = new Map<string, WebhookConfig>();
  private deliveryLogs: DeliveryLog[] = [];
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /** Load webhook configs from database */
  async loadConfigs(): Promise<void> {
    try {
      const rows = await db.select().from(webhookConfigs);
      for (const row of rows) {
        this.configs.set(row.id, {
          id: row.id,
          url: row.url,
          events: row.events as WebhookEvent[],
          secret: row.secret ?? "",
          enabled: row.enabled,
          retryCount: row.retryCount ?? 0,
          maxRetries: row.maxRetries ?? 3,
          createdAt: row.createdAt ? new Date(row.createdAt).getTime() : Date.now(),
        });
      }
      this.fastify.log.info(`[Webhook] Loaded ${rows.length} webhook configs from DB`);
    } catch (err: any) {
      this.fastify.log.warn(`[Webhook] Failed to load configs from DB: ${err.message}`);
    }
  }

  /** Register a webhook — persists to DB */
  register(config: WebhookConfig): void {
    this.configs.set(config.id, config);
    db.insert(webhookConfigs).values({
      id: config.id,
      url: config.url,
      events: config.events,
      secret: config.secret,
      enabled: config.enabled,
      retryCount: config.retryCount,
      maxRetries: config.maxRetries,
      createdAt: new Date(config.createdAt),
    }).execute().catch((err) => this.fastify.log.warn(`[Webhook] DB insert failed: ${err.message}`));
  }

  /** Unregister a webhook — deletes from DB */
  unregister(id: string): void {
    this.configs.delete(id);
    db.delete(webhookConfigs).where(eq(webhookConfigs.id, id))
      .execute().catch((err) => this.fastify.log.warn(`[Webhook] DB delete failed: ${err.message}`));
  }

  /** Get a single webhook config */
  getConfig(id: string): WebhookConfig | undefined {
    return this.configs.get(id);
  }

  /** List all webhook configs */
  listConfigs(): WebhookConfig[] {
    return Array.from(this.configs.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Update a webhook config — persists to DB */
  updateConfig(id: string, updates: Partial<Omit<WebhookConfig, "id" | "createdAt">>): WebhookConfig | null {
    const config = this.configs.get(id);
    if (!config) return null;
    if (updates.url !== undefined) config.url = updates.url;
    if (updates.events !== undefined) config.events = updates.events;
    if (updates.secret !== undefined) config.secret = updates.secret;
    if (updates.enabled !== undefined) config.enabled = updates.enabled;
    if (updates.maxRetries !== undefined) config.maxRetries = updates.maxRetries;
    if (updates.retryCount !== undefined) config.retryCount = updates.retryCount;
    // Persist to DB (best-effort)
    db.update(webhookConfigs)
      .set({
        url: config.url,
        events: config.events,
        secret: config.secret,
        enabled: config.enabled,
        retryCount: config.retryCount,
        maxRetries: config.maxRetries,
      })
      .where(eq(webhookConfigs.id, id))
      .execute().catch((err) => this.fastify.log.warn(`[Webhook] DB update failed: ${err.message}`));
    return config;
  }

  /** Fire an event — matches webhooks and delivers */
  async fire(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
    const matches = Array.from(this.configs.values()).filter(
      (c) => c.enabled && c.events.includes(event)
    );

    const results = await Promise.allSettled(
      matches.map((c) => this.deliver(c, event, payload))
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "rejected") {
        this.fastify.log.error(`[Webhook] Delivery failed for ${matches[i].id}: ${result.reason}`);
      }
    }
  }

  /** Deliver a single webhook with retry */
  private async deliver(
    config: WebhookConfig,
    event: WebhookEvent,
    payload: Record<string, unknown>
  ): Promise<void> {
    const body = JSON.stringify({
      event,
      timestamp: Date.now(),
      data: payload,
    });

    const signature = this.sign(body, config.secret);

    let lastError: Error | null = null;
    config.retryCount = 0;
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      config.retryCount = attempt;
      const start = Date.now();
      try {
        const response = await fetch(config.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-PhoneFarm-Signature": signature,
            "X-PhoneFarm-Event": event,
            "X-PhoneFarm-Delivery": crypto.randomUUID(),
          },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        this.logDelivery(config.id, event, config.url, response.status, true, Date.now() - start);

        if (response.ok) return;

        lastError = new Error(`HTTP ${response.status}: ${await response.text().catch(() => "")}`);
      } catch (err) {
        lastError = err as Error;
      }

      if (attempt < config.maxRetries) {
        const delay = RETRY_BACKOFF_BASE * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    this.logDelivery(config.id, event, config.url, null, false, 0, lastError?.message);
    throw lastError ?? new Error("Webhook delivery failed after retries");
  }

  /** Create HMAC-SHA256 signature */
  sign(body: string, secret: string): string {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(body);
    return `sha256=${hmac.digest("hex")}`;
  }

  private logDelivery(
    webhookId: string, event: WebhookEvent, url: string,
    statusCode: number | null, success: boolean,
    durationMs: number, error?: string
  ): void {
    this.deliveryLogs.push({
      id: crypto.randomUUID(),
      webhookId, event, url, statusCode, success, error, durationMs,
      timestamp: Date.now(),
    });
    // Keep last 10000 logs in memory
    if (this.deliveryLogs.length > 10000) {
      this.deliveryLogs = this.deliveryLogs.slice(-5000);
    }
  }

  /** Query delivery logs */
  getDeliveryLogs(webhookId?: string, limit = 100): DeliveryLog[] {
    let logs = this.deliveryLogs;
    if (webhookId) logs = logs.filter((l) => l.webhookId === webhookId);
    return logs.slice(-limit).reverse();
  }

  /** Release all resources. */
  dispose(): void {
    this.configs.clear();
    this.deliveryLogs = [];
  }
}
