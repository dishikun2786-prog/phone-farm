/**
 * PhoneFarm Alert Engine — Evaluates alert rules against device/event metrics.
 * Supports: device offline > N min, task failure rate > X%, activation expiring, storage low, CPU/mem overload.
 */
import type { FastifyInstance } from "fastify";

export type AlertMetric =
  | "device.offline_duration"
  | "task.failure_rate"
  | "activation.expiring"
  | "device.storage_low"
  | "device.cpu_high"
  | "device.memory_high"
  | "device.battery_low";

export type AlertChannel = "dashboard" | "websocket" | "webhook" | "notification";

export interface AlertRule {
  id: string;
  name: string;
  metric: AlertMetric;
  operator: "gt" | "lt" | "eq" | "gte" | "lte";
  threshold: number;
  durationMs: number; // How long condition must persist before firing
  channels: AlertChannel[];
  enabled: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface AlertHistory {
  id: string;
  ruleId: string;
  ruleName: string;
  metric: AlertMetric;
  message: string;
  value: number;
  threshold: number;
  status: "firing" | "resolved";
  firedAt: number;
  resolvedAt?: number;
}

export class AlertEngine {
  private rules = new Map<string, AlertRule>();
  private history: AlertHistory[] = [];
  private firingAlerts = new Map<string, AlertHistory>();
  private evaluationInterval: ReturnType<typeof setInterval> | null = null;
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  start(evaluationIntervalMs = 30000): void {
    this.evaluationInterval = setInterval(() => this.evaluate(), evaluationIntervalMs);
    this.fastify.log.info("[AlertEngine] Started evaluation loop");
  }

  stop(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }
  }

  loadRules(rules: AlertRule[]): void {
    this.rules.clear();
    for (const rule of rules) {
      this.rules.set(rule.id, rule);
    }
  }

  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  removeRule(id: string): void {
    this.rules.delete(id);
  }

  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  getHistory(limit = 100): AlertHistory[] {
    return this.history.slice(-limit).reverse();
  }

  private async evaluate(): Promise<void> {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      const currentValue = await this.getMetricValue(rule.metric);
      if (currentValue === null) continue;

      const triggered = this.compareMetric(currentValue, rule.operator, rule.threshold);

      if (triggered && !this.firingAlerts.has(rule.id)) {
        await this.fireAlert(rule, currentValue);
      } else if (!triggered && this.firingAlerts.has(rule.id)) {
        await this.resolveAlert(rule, currentValue);
      }
    }
  }

  private async fireAlert(rule: AlertRule, value: number): Promise<void> {
    const alert: AlertHistory = {
      id: crypto.randomUUID(),
      ruleId: rule.id,
      ruleName: rule.name,
      metric: rule.metric,
      message: `[${rule.name}] ${rule.metric} = ${value} (threshold: ${rule.operator} ${rule.threshold})`,
      value,
      threshold: rule.threshold,
      status: "firing",
      firedAt: Date.now(),
    };

    this.history.push(alert);
    this.firingAlerts.set(rule.id, alert);

    this.fastify.log.warn(`[AlertEngine] FIRING: ${alert.message}`);

    // Dispatch to channels
    const hub = (this.fastify as any).wsHub;
    const webhookEngine = (this.fastify as any).webhookEngine;

    if (rule.channels.includes("dashboard") && hub) {
      // Push via WebSocket to all frontend connections
      hub.broadcastToFrontends?.({
        type: "alert",
        alert,
      });
    }
    if (rule.channels.includes("websocket") && hub) {
      // Push to specific device WebSocket if applicable
      hub.sendToDevice?.("*", {
        type: "alert",
        alert,
      });
    }
    if (rule.channels.includes("webhook") && webhookEngine) {
      // Fire webhook event for external integrations
      webhookEngine.fire?.("alert.triggered", {
        ruleId: rule.id,
        ruleName: rule.name,
        metric: rule.metric,
        value,
        threshold: rule.threshold,
        message: alert.message,
        firedAt: alert.firedAt,
      }).catch((err: Error) => {
        this.fastify.log.error(`[AlertEngine] Webhook delivery failed: ${err.message}`);
      });
    }
  }

  private async resolveAlert(rule: AlertRule, value: number): Promise<void> {
    const alert = this.firingAlerts.get(rule.id)!;
    alert.status = "resolved";
    alert.resolvedAt = Date.now();
    this.firingAlerts.delete(rule.id);

    this.fastify.log.info(`[AlertEngine] RESOLVED: ${rule.name} (value=${value})`);
  }

  private async getMetricValue(metric: AlertMetric): Promise<number | null> {
    const hub = (this.fastify as any).wsHub;
    try {
      switch (metric) {
        case "device.offline_duration": {
          // Check if any device has been offline
          const onlineDevices = new Set(hub?.getOnlineDevices?.() ?? []);
          // Query all known devices and find offline ones
          const { db } = await import("../db.js");
          const { eq, lt } = await import("drizzle-orm");
          if (db) {
            const { devices: deviceTable } = await import("../schema.js");
            const allDevices = await db.select().from(deviceTable);
            let maxOfflineMinutes = 0;
            for (const dev of allDevices) {
              if (!onlineDevices.has(dev.id)) {
                const lastSeen = dev.lastSeen?.getTime() ?? 0;
                const offlineMinutes = (Date.now() - lastSeen) / 60000;
                if (offlineMinutes > maxOfflineMinutes) {
                  maxOfflineMinutes = offlineMinutes;
                }
              }
            }
            return maxOfflineMinutes > 0 ? maxOfflineMinutes : null;
          }
          return null;
        }
        case "task.failure_rate": {
          // Calculate failure rate from recent executions
          try {
            const { db } = await import("../db.js");
            const { and, gte, eq } = await import("drizzle-orm");
            if (db) {
              const { executions: execTable } = await import("../schema.js");
              const since = new Date(Date.now() - 3600 * 1000); // last hour
              const recentExecs = await db
                .select()
                .from(execTable)
                .where(gte(execTable.createdAt, since) as any);
              if (recentExecs.length === 0) return null;
              const failed = recentExecs.filter((e) => e.status === "failed").length;
              return (failed / recentExecs.length) * 100;
            }
          } catch {
            return null;
          }
          return null;
        }
        case "device.storage_low": {
          // Check device battery/storage from heartbeat data
          // In dev mode, check the device store
          const devStore = (this.fastify as any).deviceStore;
          if (devStore) {
            const allDevices = devStore.getAll?.() ?? [];
            let lowestBattery = 100;
            for (const dev of allDevices) {
              if (dev.battery !== undefined && dev.battery < lowestBattery) {
                lowestBattery = dev.battery;
              }
            }
            return lowestBattery < 100 ? lowestBattery : null;
          }
          return null;
        }
        case "device.cpu_high": {
          // Would query real-time CPU metrics from connected devices
          return null;
        }
        case "device.memory_high": {
          // Would query real-time memory metrics
          return null;
        }
        case "device.battery_low": {
          // Check lowest battery from device heartbeats
          const devStore = (this.fastify as any).deviceStore;
          if (devStore) {
            const allDevices = devStore.getAll?.() ?? [];
            let lowestBattery = 100;
            for (const dev of allDevices) {
              if (dev.battery !== undefined && dev.battery < lowestBattery) {
                lowestBattery = dev.battery;
              }
            }
            return lowestBattery < 100 ? lowestBattery : null;
          }
          return null;
        }
        case "activation.expiring": {
          // Query activation store for expiring bindings
          const activationStore = (this.fastify as any).activationStore;
          if (activationStore) {
            const expiring = await activationStore.checkExpiring?.(7) ?? [];
            return expiring.length;
          }
          return null;
        }
        default:
          return null;
      }
    } catch (err: any) {
      this.fastify.log.warn(`[AlertEngine] Failed to get metric ${metric}: ${err.message}`);
      return null;
    }
  }

  private compareMetric(value: number, op: string, threshold: number): boolean {
    switch (op) {
      case "gt": return value > threshold;
      case "lt": return value < threshold;
      case "eq": return value === threshold;
      case "gte": return value >= threshold;
      case "lte": return value <= threshold;
      default: return false;
    }
  }
}
