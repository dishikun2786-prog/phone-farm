/**
 * PhoneFarm Remote Command Routes — 远程设备命令 REST API
 */
import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import { RemoteCommandHandler, type RemoteCommand } from "./remote-command-handler";

export async function remoteCommandRoutes(app: FastifyInstance): Promise<void> {
  const handler = new RemoteCommandHandler(app);

  // 发送远程命令到指定设备
  app.post("/api/v1/devices/:deviceId/command", async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const body = req.body as Record<string, unknown>;
    const command = (body.command || body.action) as RemoteCommand;
    const params = (body.params || {}) as Record<string, unknown>;
    const timeoutMs = body.timeoutMs as number | undefined;
    if (!command) {
      return reply.status(400).send({ error: "command (or action) is required" });
    }

    const requestId = crypto.randomUUID();

    try {
      const result = await handler.execute({
        requestId, command, params, deviceId, timeoutMs,
      });
      await handler.auditLog(command, deviceId, (req as any).user?.userId ?? "system", result);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({
        requestId,
        success: false,
        error: err.message ?? "Command execution failed",
        durationMs: 0,
      });
    }
  });

  // 批量发送命令到多台设备
  app.post("/api/v1/devices/command/batch", async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const deviceIds = body.deviceIds as string[];
    const command = (body.command || body.action) as RemoteCommand;
    const params = (body.params || {}) as Record<string, unknown>;
    const timeoutMs = body.timeoutMs as number | undefined;
    if (!command) {
      return reply.status(400).send({ error: "command (or action) is required" });
    }

    const results = await Promise.allSettled(
      deviceIds.map((deviceId) =>
        handler.execute({
          requestId: crypto.randomUUID(),
          command, params, deviceId, timeoutMs,
        })
      )
    );
    const summary = {
      total: results.length,
      succeeded: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
      results: results.map((r, i) => ({
        deviceId: deviceIds[i],
        success: r.status === "fulfilled",
        data: r.status === "fulfilled" ? r.value : undefined,
        error: r.status === "rejected" ? String(r.reason) : undefined,
      })),
    };
    return reply.send(summary);
  });

  // 获取待处理命令数量
  app.get("/api/v1/devices/commands/pending", async (_req, reply) => {
    return reply.send({ pendingCount: handler.getPendingCount() });
  });

  // 取消指定设备的正在执行的命令
  app.delete("/api/v1/devices/:deviceId/command/:requestId", async (req, reply) => {
    const { requestId } = req.params as { requestId: string };
    handler.cancel(requestId);
    return reply.send({ ok: true });
  });
}
