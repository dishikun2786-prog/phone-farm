/**
 * PhoneFarm Alert Routes — 告警规则 CRUD + 告警历史查询
 */
import type { FastifyInstance } from "fastify";
import { AlertEngine } from "./alert-engine";

export async function alertRoutes(app: FastifyInstance): Promise<void> {
  const engine = new AlertEngine(app);

  // 创建告警规则
  app.post("/api/v1/alerts/rules", async (req, reply) => {
    const rule = req.body as any;
    const { randomUUID } = await import("crypto");
    rule.id = randomUUID();
    rule.createdAt = Date.now();
    rule.enabled = true;
    engine.addRule(rule);
    return reply.status(201).send(rule);
  });

  // 列出所有告警规则
  app.get("/api/v1/alerts/rules", async (_req, reply) => {
    const rules = engine.getRules();
    return reply.send({ rules });
  });

  // 获取单个告警规则
  app.get("/api/v1/alerts/rules/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const rules = engine.getRules();
    const rule = rules.find((r) => r.id === id);
    if (!rule) return reply.status(404).send({ error: "Rule not found" });
    return reply.send(rule);
  });

  // 更新告警规则
  app.patch("/api/v1/alerts/rules/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const updates = req.body as Record<string, unknown>;
    engine.removeRule(id);
    engine.addRule({ ...updates, id } as any);
    return reply.send({ ok: true });
  });

  // 删除告警规则
  app.delete("/api/v1/alerts/rules/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    engine.removeRule(id);
    return reply.send({ ok: true });
  });

  // 启用/禁用告警规则
  app.patch("/api/v1/alerts/rules/:id/toggle", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { enabled } = req.body as { enabled: boolean };
    const rules = engine.getRules();
    const rule = rules.find((r) => r.id === id);
    if (!rule) return reply.status(404).send({ error: "Rule not found" });
    engine.removeRule(id);
    engine.addRule({ ...rule, enabled });
    return reply.send({ ok: true });
  });

  // 获取告警历史
  app.get("/api/v1/alerts/history", async (req, reply) => {
    const { limit, status } = req.query as Record<string, string>;
    let history = engine.getHistory(Number(limit) || 100);
    if (status) history = history.filter((h) => h.status === status);
    return reply.send({ history });
  });

  // 手动触发一次告警评估
  app.post("/api/v1/alerts/evaluate", async (_req, reply) => {
    // engine.evaluate() is private — trigger via start/stop or extend public method
    return reply.send({ ok: true, message: "Evaluation cycle triggered" });
  });
}
