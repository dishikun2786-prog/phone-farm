/**
 * Server Health Monitor — Enhanced health checking for all PhoneFarm components.
 *
 * Monitors: PostgreSQL, Redis, NATS, MinIO, Ray, WebSocket hub.
 * Caches results for 5 seconds to avoid thundering herd on health endpoint.
 * Exposes Prometheus-compatible metrics.
 *
 * Configurable alert thresholds via environment variables:
 *   - HEALTH_PG_TIMEOUT_MS (default: 3000)
 *   - HEALTH_REDIS_TIMEOUT_MS (default: 3000)
 *   - HEALTH_NATS_TIMEOUT_MS (default: 3000)
 *   - HEALTH_MINIO_TIMEOUT_MS (default: 5000)
 *   - HEALTH_RAY_TIMEOUT_MS (default: 5000)
 *   - HEALTH_WS_TIMEOUT_MS (default: 1000)
 *   - HEALTH_CACHE_TTL_SEC (default: 5)
 */
import { db, pool } from "../db.js";
import { config } from "../config.js";
import { Redis } from "ioredis";
import { MinioClient } from "../storage/minio-client.js";
import { RayClient } from "../ray/ray-client.js";

// ── Types ──

export type HealthStatus = "healthy" | "degraded" | "unhealthy";
export type ComponentStatus = "up" | "down" | "degraded";

export interface ComponentHealth {
  status: ComponentStatus;
  latencyMs: number;
  message?: string;
  lastChecked: number;
  details?: Record<string, any>;
}

export interface FullHealthReport {
  overall: HealthStatus;
  components: Record<string, ComponentHealth>;
  timestamp: number;
  uptimeSeconds: number;
  version: string;
}

interface HealthCacheEntry {
  report: FullHealthReport;
  expiresAt: number;
}

// ── Constants ──

const DEFAULT_CACHE_TTL_SEC = 5;

function envInt(key: string, defaultVal: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) || defaultVal : defaultVal;
}

const PG_TIMEOUT_MS = envInt("HEALTH_PG_TIMEOUT_MS", 3000);
const REDIS_TIMEOUT_MS = envInt("HEALTH_REDIS_TIMEOUT_MS", 3000);
const NATS_TIMEOUT_MS = envInt("HEALTH_NATS_TIMEOUT_MS", 3000);
const MINIO_TIMEOUT_MS = envInt("HEALTH_MINIO_TIMEOUT_MS", 5000);
const RAY_TIMEOUT_MS = envInt("HEALTH_RAY_TIMEOUT_MS", 5000);
const WS_TIMEOUT_MS = envInt("HEALTH_WS_TIMEOUT_MS", 1000);
const CACHE_TTL_SEC = envInt("HEALTH_CACHE_TTL_SEC", DEFAULT_CACHE_TTL_SEC);

// ── Server Health Monitor Class ──

export class ServerHealthMonitor {
  private redisClient: Redis | null = null;
  private minioClient: MinioClient | null = null;
  private rayClient: RayClient | null = null;
  private wsHub: any = null;
  private cache: HealthCacheEntry | null = null;
  private startTime: number;

  constructor(opts?: {
    redis?: Redis;
    minio?: MinioClient;
    ray?: RayClient;
    wsHub?: any;
  }) {
    this.redisClient = opts?.redis ?? null;
    this.minioClient = opts?.minio ?? null;
    this.rayClient = opts?.ray ?? null;
    this.wsHub = opts?.wsHub ?? null;
    this.startTime = Date.now();
  }

  /**
   * Set the WebSocket hub reference (injected after construction).
   */
  setWsHub(hub: any): void {
    this.wsHub = hub;
  }

  /**
   * Set the Redis client reference.
   */
  setRedisClient(client: Redis): void {
    this.redisClient = client;
  }

  /**
   * Set the MinIO client reference.
   */
  setMinioClient(client: MinioClient): void {
    this.minioClient = client;
  }

  /**
   * Set the Ray client reference.
   */
  setRayClient(client: RayClient): void {
    this.rayClient = client;
  }

  /**
   * Get the full health report for all components.
   * Results are cached for CACHE_TTL_SEC seconds to prevent thundering herd.
   */
  async getFullHealth(): Promise<FullHealthReport> {
    // Check cache
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.report;
    }

    const results = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkNats(),
      this.checkMinio(),
      this.checkRay(),
      this.checkWebSocket(),
    ]);

    const [
      postgresHealth,
      redisHealth,
      natsHealth,
      minioHealth,
      rayHealth,
      wsHealth,
    ] = results;

    const components: Record<string, ComponentHealth> = {
      postgresql: postgresHealth,
      redis: redisHealth,
      nats: natsHealth,
      minio: minioHealth,
      ray: rayHealth,
      websocket: wsHealth,
    };

    // Determine overall health
    const overall = this.computeOverallHealth(components);

    const report: FullHealthReport = {
      overall,
      components,
      timestamp: Date.now(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      version: "1.0.0",
    };

    // Cache result
    this.cache = {
      report,
      expiresAt: Date.now() + CACHE_TTL_SEC * 1000,
    };

    return report;
  }

  /**
   * Compute overall health based on component states.
   * - healthy: all components up
   * - degraded: at least one component degraded, none down
   * - unhealthy: at least one critical component down
   */
  private computeOverallHealth(
    components: Record<string, ComponentHealth>
  ): HealthStatus {
    const criticalComponents = ["postgresql", "redis"];
    let hasDegraded = false;
    let hasDown = false;

    for (const [name, health] of Object.entries(components)) {
      if (health.status === "down") {
        if (criticalComponents.includes(name)) {
          return "unhealthy";
        }
        hasDown = true;
      } else if (health.status === "degraded") {
        hasDegraded = true;
      }
    }

    if (hasDown) return "degraded";
    if (hasDegraded) return "degraded";
    return "healthy";
  }

  // ── Individual Health Checks ──

  /**
   * Check PostgreSQL connectivity and responsiveness.
   * Performs a simple SELECT 1 query.
   */
  async checkPostgres(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("PostgreSQL query timeout")), PG_TIMEOUT_MS)
      );

      const queryPromise = db.execute("SELECT 1 AS health_check");
      await Promise.race([queryPromise, timeoutPromise]);

      const latencyMs = Date.now() - startTime;

      // Get connection pool stats
      const poolStats = {
        totalCount: (pool as any).totalCount ?? 0,
        idleCount: (pool as any).idleCount ?? 0,
        waitingCount: (pool as any).waitingCount ?? 0,
      };

      return {
        status: "up",
        latencyMs,
        lastChecked: Date.now(),
        details: {
          pool: poolStats,
          host: config.DATABASE_URL.split("@")[1]?.split("/")[0] ?? "unknown",
        },
      };
    } catch (err: any) {
      console.error(`[health] PostgreSQL check failed:`, err.message);
      return {
        status: "down",
        latencyMs: Date.now() - startTime,
        message: err.message,
        lastChecked: Date.now(),
      };
    }
  }

  /**
   * Check Redis connectivity and responsiveness.
   * Performs a PING command.
   */
  async checkRedis(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      if (!this.redisClient) {
        // Try to create a temporary connection for health check
        const tempRedis = new Redis(config.REDIS_URL, {
          lazyConnect: true,
          connectTimeout: REDIS_TIMEOUT_MS,
          maxRetriesPerRequest: null,
        });

        try {
          await Promise.race([
            tempRedis.connect(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Redis connection timeout")), REDIS_TIMEOUT_MS)
            ),
          ]);

          const pong = await Promise.race([
            tempRedis.ping(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Redis PING timeout")), REDIS_TIMEOUT_MS)
            ),
          ]);

          if (pong !== "PONG") {
            throw new Error(`Unexpected Redis PING response: ${pong}`);
          }

          const latencyMs = Date.now() - startTime;

          // Get Redis info
          let memoryUsed: string | undefined;
          let connectedClients: string | undefined;
          try {
            const info = await tempRedis.info("memory");
            const memMatch = /used_memory_human:(.+)/.exec(info);
            if (memMatch) memoryUsed = memMatch[1]!.trim();

            const clientInfo = await tempRedis.info("clients");
            const clientMatch = /connected_clients:(.+)/.exec(clientInfo);
            if (clientMatch) connectedClients = clientMatch[1]!.trim();
          } catch {
            // Info retrieval is optional
          }

          return {
            status: "up",
            latencyMs,
            lastChecked: Date.now(),
            details: {
              memoryUsed,
              connectedClients,
              url: config.REDIS_URL.replace(/\/\/.*@/, "//***@"),
            },
          };
        } finally {
          await tempRedis.quit().catch(() => {});
        }
      } else {
        // Use existing connection
        const pong = await Promise.race([
          this.redisClient.ping(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Redis PING timeout")), REDIS_TIMEOUT_MS)
          ),
        ]);

        if (pong !== "PONG") {
          throw new Error(`Unexpected Redis PING response: ${pong}`);
        }

        const latencyMs = Date.now() - startTime;
        return {
          status: "up",
          latencyMs,
          lastChecked: Date.now(),
        };
      }
    } catch (err: any) {
      console.error(`[health] Redis check failed:`, err.message);
      return {
        status: "down",
        latencyMs: Date.now() - startTime,
        message: err.message,
        lastChecked: Date.now(),
      };
    }
  }

  /**
   * Check NATS connectivity and responsiveness.
   * Attempts to connect and query server info.
   */
  async checkNats(): Promise<ComponentHealth> {
    const startTime = Date.now();

    if (!config.NATS_ENABLED) {
      return {
        status: "degraded",
        latencyMs: 0,
        message: "NATS is disabled (NATS_ENABLED=false)",
        lastChecked: Date.now(),
      };
    }

    try {
      // Use NATS monitoring endpoint (HTTP)
      const monitorUrl = config.NATS_URL
        .replace("nats://", "http://")
        .replace(":4222", ":8222");

      const response = await Promise.race([
        fetch(`${monitorUrl}/healthz`, {
          signal: AbortSignal.timeout(NATS_TIMEOUT_MS),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("NATS healthz timeout")), NATS_TIMEOUT_MS)
        ),
      ]);

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        let serverInfo: any = {};
        try {
          const infoResponse = await fetch(`${monitorUrl}/varz`, {
            signal: AbortSignal.timeout(2000),
          });
          if (infoResponse.ok) {
            const info = await infoResponse.json() as any;
            serverInfo = {
              version: info.version,
              uptime: info.uptime,
              connections: info.connections,
              jetstreamEnabled: info.jetstream?.config != null,
            };
          }
        } catch {
          // Varz info is non-critical
        }

        return {
          status: "up",
          latencyMs,
          lastChecked: Date.now(),
          details: serverInfo,
        };
      }

      return {
        status: "degraded",
        latencyMs,
        message: `NATS healthz returned ${response.status}`,
        lastChecked: Date.now(),
      };
    } catch (err: any) {
      console.error(`[health] NATS check failed:`, err.message);
      return {
        status: "down",
        latencyMs: Date.now() - startTime,
        message: err.message,
        lastChecked: Date.now(),
      };
    }
  }

  /**
   * Check MinIO connectivity and bucket accessibility.
   */
  async checkMinio(): Promise<ComponentHealth> {
    const startTime = Date.now();

    if (!config.MINIO_ENABLED) {
      return {
        status: "degraded",
        latencyMs: 0,
        message: "MinIO is disabled (MINIO_ENABLED=false)",
        lastChecked: Date.now(),
      };
    }

    try {
      const client = this.minioClient ?? new MinioClient();

      const healthy = await Promise.race([
        client.healthCheck(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error("MinIO health check timeout")), MINIO_TIMEOUT_MS)
        ),
      ]);

      const latencyMs = Date.now() - startTime;

      return {
        status: healthy ? "up" : "down",
        latencyMs,
        lastChecked: Date.now(),
        details: {
          endpoint: config.MINIO_ENDPOINT,
          bucket: config.MINIO_BUCKET,
          ssl: config.MINIO_USE_SSL,
        },
      };
    } catch (err: any) {
      console.error(`[health] MinIO check failed:`, err.message);
      return {
        status: "down",
        latencyMs: Date.now() - startTime,
        message: err.message,
        lastChecked: Date.now(),
      };
    }
  }

  /**
   * Check Ray cluster connectivity and resource availability.
   */
  async checkRay(): Promise<ComponentHealth> {
    const startTime = Date.now();

    if (!config.RAY_ENABLED) {
      return {
        status: "degraded",
        latencyMs: 0,
        message: "Ray is disabled (RAY_ENABLED=false)",
        lastChecked: Date.now(),
      };
    }

    try {
      const client = this.rayClient ?? new RayClient();

      const healthy = await Promise.race([
        client.healthCheck(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error("Ray health check timeout")), RAY_TIMEOUT_MS)
        ),
      ]);

      const latencyMs = Date.now() - startTime;

      let clusterDetails: any = {};
      if (healthy) {
        try {
          const clusterStatus = await client.getClusterStatus();
          clusterDetails = {
            aliveNodes: clusterStatus.aliveNodes,
            totalNodes: clusterStatus.totalNodes,
            availableCpus: clusterStatus.availableCpus,
            availableGpus: clusterStatus.availableGpus,
            totalCpus: clusterStatus.totalCpus,
            totalGpus: clusterStatus.totalGpus,
          };
        } catch {
          // Cluster status detail is non-critical
        }
      }

      return {
        status: healthy ? "up" : "down",
        latencyMs,
        lastChecked: Date.now(),
        details: {
          address: config.RAY_ADDRESS,
          ...clusterDetails,
        },
      };
    } catch (err: any) {
      console.error(`[health] Ray check failed:`, err.message);
      return {
        status: "down",
        latencyMs: Date.now() - startTime,
        message: err.message,
        lastChecked: Date.now(),
      };
    }
  }

  /**
   * Check WebSocket hub connectivity and connected client counts.
   */
  checkWebSocket(): ComponentHealth {
    const startTime = Date.now();

    try {
      if (!this.wsHub) {
        return {
          status: "degraded",
          latencyMs: 0,
          message: "WebSocket hub not initialized",
          lastChecked: Date.now(),
        };
      }

      const onlineDevices = this.wsHub.getOnlineDevices?.() ?? [];
      const frontendCount = this.wsHub.getFrontendCount?.() ?? 0;
      const deviceCount = Array.isArray(onlineDevices) ? onlineDevices.length : 0;

      const latencyMs = Date.now() - startTime;

      return {
        status: "up",
        latencyMs,
        lastChecked: Date.now(),
        details: {
          devicesConnected: deviceCount,
          frontendsConnected: frontendCount,
          totalConnections: deviceCount + frontendCount,
        },
      };
    } catch (err: any) {
      console.error(`[health] WebSocket check failed:`, err.message);
      return {
        status: "down",
        latencyMs: Date.now() - startTime,
        message: err.message,
        lastChecked: Date.now(),
      };
    }
  }

  /**
   * Invalidate the health cache, forcing a fresh check on next call.
   */
  invalidateCache(): void {
    this.cache = null;
  }

  /**
   * Get Prometheus-compatible metrics string for the health status.
   */
  getPrometheusMetrics(): string {
    const cached = this.cache?.report;
    if (!cached) return "";

    const lines: string[] = [
      "# HELP phonefarm_component_status Component health status (1=up, 0.5=degraded, 0=down)",
      "# TYPE phonefarm_component_status gauge",
    ];

    const statusValue: Record<ComponentStatus, number> = {
      up: 1,
      degraded: 0.5,
      down: 0,
    };

    for (const [name, health] of Object.entries(cached.components)) {
      lines.push(
        `phonefarm_component_status{component="${name}"} ${statusValue[health.status]}`
      );
      lines.push(
        `phonefarm_component_latency_ms{component="${name}"} ${health.latencyMs}`
      );
    }

    lines.push(
      `phonefarm_overall_health{status="${cached.overall}"} ${cached.overall === "healthy" ? 1 : cached.overall === "degraded" ? 0.5 : 0}`
    );
    lines.push(
      `phonefarm_uptime_seconds ${cached.uptimeSeconds}`
    );

    return lines.join("\n") + "\n";
  }
}
