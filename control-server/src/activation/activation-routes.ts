/**
 * PhoneFarm Activation Routes — 卡密系统 REST API
 */
import type { FastifyInstance } from "fastify";
import { ActivationStore } from "./activation-store";

export async function activationRoutes(app: FastifyInstance): Promise<void> {
  const store = new ActivationStore(app);

  // 卡密验证 + 设备绑定
  app.post("/api/v1/activation/verify", async (req, reply) => {
    const { code, deviceId, deviceName } = req.body as {
      code: string; deviceId: string; deviceName: string;
    };
    const result = await store.consume(code, deviceId, deviceName);
    if (!result.success) return reply.status(400).send({ error: result.error });
    return reply.send(result);
  });

  // Android alias: POST /api/v1/activation/bind uses different field names
  app.post("/api/v1/activation/bind", async (req, reply) => {
    const { activationCode, code, deviceId, deviceName } = req.body as {
      activationCode?: string; code?: string; deviceId: string; deviceName?: string;
    };
    const actualCode = activationCode ?? code ?? "";
    const result = await store.consume(actualCode, deviceId, deviceName ?? deviceId);
    if (!result.success) return reply.status(400).send({ error: result.error });
    return reply.send(result);
  });

  // 查询设备激活状态
  app.get("/api/v1/activation/status/:deviceId", async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const status = await store.getStatus(deviceId);
    return reply.send(status);
  });

  // 设备解绑
  app.delete("/api/v1/activation/unbind/:deviceId", async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const result = await store.unbind(deviceId);
    if (!result.success) return reply.status(400).send({ error: result.error });
    return reply.send(result);
  });

  // 批量生成卡密（管理员）
  app.post("/api/v1/activation/generate", async (req, reply) => {
    const { count, days, maxDevices, prefix, note, expiresAt } = req.body as {
      count: number; days: number; maxDevices: number;
      prefix?: string; note?: string; expiresAt?: number;
    };
    const keys = await store.batchGenerate({
      count: Math.min(count ?? 1, 500),
      days: days ?? 365,
      maxDevices: maxDevices ?? 1,
      prefix, note, expiresAt,
      createdBy: (req as any).userId ?? "system",
    });
    return reply.send({ count: keys.length, keys });
  });

  // 查询卡密列表（管理员）
  app.get("/api/v1/activation/list", async (req, reply) => {
    const { status, createdBy, limit, offset } = req.query as Record<string, string>;
    const result = await store.list({
      status: status as any,
      createdBy,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
    return reply.send(result);
  });

  // 批量禁用卡密
  app.post("/api/v1/activation/disable", async (req, reply) => {
    const { ids } = req.body as { ids: string[] };
    const result = await store.batchDisable(ids);
    return reply.send({ disabled: result.disabled });
  });
}
