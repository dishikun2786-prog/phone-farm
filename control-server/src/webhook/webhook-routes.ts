/**
 * PhoneFarm Webhook Routes — Webhook 配置 CRUD + 投递日志查询 + 手动测试
 */
import type { FastifyInstance } from "fastify";
import type { WebhookEvent } from "./webhook-engine";
import { WebhookEngine } from "./webhook-engine";

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  const engine = new WebhookEngine(app);

  // 创建 Webhook 配置
  app.post("/api/v1/webhooks", async (req, reply) => {
    const { url, events, secret } = req.body as {
      url: string; events: WebhookEvent[]; secret: string;
    };
    const { randomUUID } = await import("crypto");
    const config = {
      id: randomUUID(),
      url, events: events, secret,
      enabled: true, retryCount: 0, maxRetries: 3, createdAt: Date.now(),
    };
    engine.register(config);
    return reply.status(201).send(config);
  });

  // 列出所有 Webhook 配置
  app.get("/api/v1/webhooks", async (_req, reply) => {
    const webhooks = engine.listConfigs();
    return reply.send({ webhooks });
  });

  // 获取单个 Webhook 配置
  app.get("/api/v1/webhooks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const config = engine.getConfig(id);
    if (!config) return reply.status(404).send({ error: "Webhook not found" });
    return reply.send(config);
  });

  // 更新 Webhook 配置
  app.patch("/api/v1/webhooks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const updates = req.body as Partial<{ url: string; events: WebhookEvent[]; secret: string; enabled: boolean; maxRetries: number }>;
    const updated = engine.updateConfig(id, updates);
    if (!updated) return reply.status(404).send({ error: "Webhook not found" });
    return reply.send(updated);
  });

  // 删除 Webhook 配置
  app.delete("/api/v1/webhooks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    engine.unregister(id);
    return reply.send({ ok: true });
  });

  // 手动测试 Webhook（发送一条测试事件）
  app.post("/api/v1/webhooks/:id/test", async (req, reply) => {
    const { id } = req.params as { id: string };
    const payload = { test: true, timestamp: Date.now(), message: "Webhook test from PhoneFarm" };
    await engine.fire("device.online", payload);
    return reply.send({ ok: true, message: "Test event fired" });
  });

  // 投递日志查询
  app.get("/api/v1/webhooks/:id/logs", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { limit } = req.query as Record<string, string>;
    const logs = engine.getDeliveryLogs(id, Number(limit) || 100);
    return reply.send({ logs });
  });

  // 所有 Webhook 投递日志
  app.get("/api/v1/webhook-logs", async (req, reply) => {
    const { limit } = req.query as Record<string, string>;
    const logs = engine.getDeliveryLogs(undefined, Number(limit) || 100);
    return reply.send({ logs });
  });
}
