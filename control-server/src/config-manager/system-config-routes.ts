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
    const user = (req as any).user as AuthUser | null;
    if (!user || !hasPermission(user.role, "config", "read")) {
      return reply.status(user ? 403 : 401).send({ error: user ? "Permission denied" : "Authentication required" });
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
    const user = (req as any).user as AuthUser | null;
    if (!user || !hasPermission(user.role, "config", "read")) {
      return reply.status(user ? 403 : 401).send({ error: user ? "Permission denied" : "Authentication required" });
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

    // NATS — check actual connection; instance always exists (NATS_ENABLED defaults true)
    try {
      const nats = (app as any).nats;
      const isConnected = nats?.isConnected?.() ?? false;
      status["nats"] = {
        connected: isConnected,
        info: { enabled: true, connected: isConnected },
      };
    } catch {
      status["nats"] = { connected: false, info: { enabled: false, error: "Not initialized" } };
    }

    // MinIO — check actual health; instance always exists (MINIO_ENABLED defaults true)
    try {
      const minio = (app as any).minio;
      const healthy = minio ? await minio.healthCheck().catch(() => false) : false;
      status["minio"] = {
        connected: healthy,
        info: { enabled: true, ready: minio?.isReady ?? false },
      };
    } catch {
      status["minio"] = { connected: false, info: { enabled: false, error: "Not initialized" } };
    }

    // Ray — check actual health; instance always exists (RAY_ENABLED defaults true)
    try {
      const ray = (app as any).ray;
      const rayHealthy = ray ? await ray.healthCheck().catch(() => false) : false;
      status["ray"] = {
        connected: rayHealthy,
        info: { enabled: true, ready: ray?.isReady ?? false },
      };
    } catch {
      status["ray"] = { connected: false, info: { enabled: false, error: "Not initialized" } };
    }

    // WebRTC — signaling relay is always active on control server
    try {
      const rc = getRC();
      const stunServer = rc.get("infra.webrtc.stun_server");
      status["webrtc"] = {
        connected: true,
        info: { enabled: true, signaling: "active", stun_server: stunServer || "(not set)" },
      };
    } catch {
      status["webrtc"] = { connected: true, info: { enabled: true, signaling: "active" } };
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
