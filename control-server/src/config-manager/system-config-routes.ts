/**
 * System Config Routes — merged config, feature flags, infrastructure status.
 *
 * Endpoints:
 *   GET    /api/v1/system/config
 *   GET    /api/v1/system/config/:key
 *   PUT    /api/v1/system/config/:key
 *   POST   /api/v1/system/config/reload
 *   GET    /api/v1/system/feature-flags
 *   PUT    /api/v1/system/feature-flags/:key
 *   GET    /api/v1/system/infrastructure/status
 */
import type { FastifyInstance } from "fastify";
import type { AuthUser } from "../auth/auth-middleware.js";
import type { RuntimeConfig } from "./runtime-config.js";
import { hasPermission } from "../auth/rbac.js";

export async function systemConfigRoutes(app: FastifyInstance): Promise<void> {
  const getRC = (): RuntimeConfig => (app as any).runtimeConfig;

  // ── Merged Config ──

  app.get("/api/v1/system/config", async (req, reply) => {
    const user = (req as any).user as AuthUser;
    if (!hasPermission(user.role, "config", "read")) {
      return reply.status(403).send({ error: "Permission denied" });
    }

    const rc = getRC();
    const entries = await rc.getAll();

    // Group by category
    const grouped: Record<string, typeof entries> = {};
    for (const e of entries) {
      const cat = e.categoryKey || "uncategorized";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(e);
    }

    return reply.send({ entries, grouped });
  });

  app.get("/api/v1/system/config/:key", async (req, reply) => {
    const user = (req as any).user as AuthUser;
    if (!hasPermission(user.role, "config", "read")) {
      return reply.status(403).send({ error: "Permission denied" });
    }

    const { key } = req.params as { key: string };
    const rc = getRC();
    const entries = await rc.getAll();
    const entry = entries.find((e) => e.key === key);

    if (!entry) {
      return reply.status(404).send({ error: `Config key not found: ${key}` });
    }

    return reply.send(entry);
  });

  // ── Update Config ──

  app.put("/api/v1/system/config/:key", async (req, reply) => {
    const user = (req as any).user as AuthUser;
    if (!hasPermission(user.role, "config", "write")) {
      return reply.status(403).send({ error: "Permission denied" });
    }

    const { key } = req.params as { key: string };
    const { value, changeReason } = req.body as { value: string; changeReason?: string };

    if (value === undefined) {
      return reply.status(400).send({ error: "value is required" });
    }

    const rc = getRC();
    const ipAddress = (req as any).ip || (req as any).socket?.remoteAddress;

    try {
      await rc.set(key, value, {
        userId: user.userId,
        changeReason: changeReason ?? "Updated via system config API",
        ipAddress: typeof ipAddress === "string" ? ipAddress : undefined,
      });

      return reply.send({ ok: true, key, value });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Hot Reload ──

  app.post("/api/v1/system/config/reload", async (req, reply) => {
    const user = (req as any).user as AuthUser;
    if (!hasPermission(user.role, "config", "manage")) {
      return reply.status(403).send({ error: "Permission denied — manage required" });
    }

    const rc = getRC();
    await rc.invalidate();

    return reply.send({ ok: true, message: "Config reloaded from database" });
  });

  // ── Feature Flags ──

  app.get("/api/v1/system/feature-flags", async (req, reply) => {
    const user = (req as any).user as AuthUser;
    if (!hasPermission(user.role, "config", "read")) {
      return reply.status(403).send({ error: "Permission denied" });
    }

    const rc = getRC();
    const flags = await rc.getFeatureFlags();

    return reply.send({ flags });
  });

  app.put("/api/v1/system/feature-flags/:key", async (req, reply) => {
    const user = (req as any).user as AuthUser;
    if (!hasPermission(user.role, "config", "write")) {
      return reply.status(403).send({ error: "Permission denied" });
    }

    const { key } = req.params as { key: string };
    const { value } = req.body as { value: string };

    if (!key.startsWith("ff.")) {
      return reply.status(400).send({ error: "Not a feature flag key" });
    }

    const rc = getRC();
    const ipAddress = (req as any).ip || (req as any).socket?.remoteAddress;

    try {
      await rc.set(key, value, {
        userId: user.userId,
        changeReason: `Feature flag ${value === "true" ? "enabled" : "disabled"} via dashboard`,
        ipAddress: typeof ipAddress === "string" ? ipAddress : undefined,
      });

      return reply.send({ ok: true, key, enabled: value === "true" });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Infrastructure Status ──

  app.get("/api/v1/system/infrastructure/status", async (req, reply) => {
    const user = (req as any).user as AuthUser;
    if (!hasPermission(user.role, "config", "read")) {
      return reply.status(403).send({ error: "Permission denied" });
    }

    const status: Record<string, { connected: boolean; info: Record<string, any> }> = {};

    // Control Server
    status["control_server"] = { connected: true, info: { uptime: process.uptime(), version: "1.0.0" } };

    // PostgreSQL
    try {
      const { pool } = await import("../db.js");
      const start = Date.now();
      await pool.query("SELECT 1");
      status["postgresql"] = { connected: true, info: { latency_ms: Date.now() - start } };
    } catch {
      status["postgresql"] = { connected: false, info: { error: "Connection failed" } };
    }

    // Redis — check via getRedisClient()
    try {
      const { getRedisClient } = await import("../queue/redis-client.js");
      const redis = getRedisClient();
      const redisStatus = redis?.status === "ready" || redis?.status === "connect";
      status["redis"] = { connected: redisStatus, info: { status: redis?.status ?? "unknown" } };
    } catch {
      status["redis"] = { connected: false, info: { error: "Not initialized" } };
    }

    // NATS — read from app singleton
    try {
      const nats = (app as any).nats;
      status["nats"] = {
        connected: nats?.isConnected?.() ?? false,
        info: { connected: nats?.isConnected?.() ?? false },
      };
    } catch {
      status["nats"] = { connected: false, info: { error: "Not initialized" } };
    }

    // MinIO — read from app singleton
    try {
      const minio = (app as any).minio;
      const healthy = minio ? await minio.healthCheck().catch(() => false) : false;
      status["minio"] = { connected: healthy, info: { bucket: minio?.isReady ? "ready" : "not ready" } };
    } catch {
      status["minio"] = { connected: false, info: { error: "Not initialized" } };
    }

    // Ray — read from app singleton
    try {
      const ray = (app as any).ray;
      const rayHealthy = ray ? await ray.healthCheck().catch(() => false) : false;
      status["ray"] = { connected: rayHealthy, info: { ready: ray?.isReady ?? false } };
    } catch {
      status["ray"] = { connected: false, info: { error: "Not initialized" } };
    }

    // WebRTC — check if signaling is available
    try {
      const rc = getRC();
      const webrtcEnabled = rc.getBoolean("system.webrtc.enabled", false);
      status["webrtc"] = {
        connected: webrtcEnabled,
        info: { enabled: webrtcEnabled, stun_server: rc.get("system.webrtc.stun_server") },
      };
    } catch {
      status["webrtc"] = { connected: false, info: { error: "Not configured" } };
    }

    // WebSocket Hub
    try {
      const hub = (app as any).wsHub;
      status["websocket"] = {
        connected: !!hub,
        info: { devices_online: hub?.getOnlineDevices?.().length ?? 0 },
      };
    } catch {
      status["websocket"] = { connected: false, info: { error: "Not initialized" } };
    }

    return reply.send({ status, timestamp: Date.now() });
  });
}
