/**
 * stream-routes.ts — 按需推流 REST API。
 *
 * 端点:
 *   POST /api/v1/stream/start
 *   POST /api/v1/stream/stop
 *   GET  /api/v1/stream/status/:deviceId
 *   GET  /api/v1/stream/stats
 */
import type { FastifyInstance } from "fastify";
import type { StreamManager } from "./stream-manager";

export function registerStreamRoutes(
  app: FastifyInstance,
  streamManager: StreamManager,
): void {
  app.post("/api/v1/stream/start", async (req, reply) => {
    const { deviceId, subscriberId, maxSize, bitRate, maxFps, audio } =
      req.body as {
        deviceId: string;
        subscriberId: string;
        maxSize?: number;
        bitRate?: number;
        maxFps?: number;
        audio?: boolean;
        maxDurationMs?: number;
      };

    if (!deviceId || !subscriberId) {
      return reply.status(400).send({ error: "deviceId and subscriberId are required" });
    }

    streamManager.startStream(deviceId, subscriberId, {
      maxSize,
      bitRate,
      maxFps,
      audio,
    });

    return { status: "started", deviceId, subscriberId };
  });

  app.post("/api/v1/stream/stop", async (req, reply) => {
    const { deviceId, reason } = req.body as {
      deviceId: string;
      reason?: string;
    };

    if (!deviceId) {
      return reply.status(400).send({ error: "deviceId is required" });
    }

    streamManager.stopStream(deviceId, reason || "user_requested");
    return { status: "stopped", deviceId };
  });

  app.get("/api/v1/stream/status/:deviceId", async (req) => {
    const { deviceId } = req.params as { deviceId: string };
    return streamManager.getStreamStatus(deviceId);
  });

  app.get("/api/v1/stream/stats", async () => {
    return streamManager.getGlobalStats();
  });
}
