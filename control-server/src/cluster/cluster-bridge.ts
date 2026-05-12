/**
 * PhoneFarm Cluster Bridge — Redis Pub/Sub 跨实例消息桥接（多实例架构预留）
 */
import type { FastifyInstance } from "fastify";

interface ClusterMessage {
  type: "ws_forward" | "config_sync" | "cache_invalidate" | "rate_limit";
  sourceNodeId: string;
  targetNodeId?: string;
  targetDeviceId?: string;
  targetFrontendId?: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export class ClusterBridge {
  private fastify: FastifyInstance;
  private nodeId: string;
  private enabled: boolean;
  private redisClient: any = null;
  private subChannel = "phonefarm:cluster";
  private pubChannel = "phonefarm:cluster";

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
    const { randomUUID } = require("crypto");
    this.nodeId = randomUUID().substring(0, 8);
    this.enabled = process.env.CLUSTER_MODE === "true";
  }

  /** 启动集群桥接（需 Redis Client） */
  async start(redisClient?: any): Promise<void> {
    if (!this.enabled) {
      this.fastify.log.info("[Cluster] Cluster mode disabled, running in standalone");
      return;
    }
    if (!redisClient) {
      this.fastify.log.warn("[Cluster] No Redis client provided, cluster bridge disabled");
      this.enabled = false;
      return;
    }
    this.redisClient = redisClient;
    // Subscribe to cluster channel
    await redisClient.subscribe(this.subChannel);
    redisClient.on("message", (channel: string, message: string) => {
      if (channel === this.subChannel) {
        this.handleMessage(JSON.parse(message));
      }
    });
    this.fastify.log.info(`[Cluster] Bridge started, nodeId=${this.nodeId}`);
  }

  /** 广播消息到所有节点 */
  async broadcast(type: ClusterMessage["type"], payload: Record<string, unknown>): Promise<void> {
    if (!this.enabled || !this.redisClient) return;
    const msg: ClusterMessage = {
      type, sourceNodeId: this.nodeId, payload, timestamp: Date.now(),
    };
    await this.redisClient.publish(this.pubChannel, JSON.stringify(msg));
  }

  /** 转发 WebSocket 消息到指定设备所在节点 */
  async forwardToDevice(deviceId: string, message: Record<string, unknown>): Promise<void> {
    await this.broadcast("ws_forward", { deviceId, message });
  }

  /** 处理来自其他节点的消息 */
  private handleMessage(msg: ClusterMessage): void {
    if (msg.sourceNodeId === this.nodeId) return; // Ignore self
    switch (msg.type) {
      case "ws_forward": {
        const wsHub = (this.fastify as any).wsHub;
        const deviceId = msg.payload.deviceId as string;
        const message = msg.payload.message as Record<string, unknown>;
        wsHub?.sendToDevice(deviceId, message).catch(() => {});
        break;
      }
      case "config_sync":
        this.fastify.log.info(`[Cluster] Config sync from node ${msg.sourceNodeId}`);
        break;
      case "cache_invalidate": {
        // Clear local caches — notify cache manager if available
        const cacheManager = (this.fastify as any).cacheManager;
        if (cacheManager?.invalidate) {
          cacheManager.invalidate(msg.payload.cacheKey as string).catch(() => {});
        }
        this.fastify.log.info(`[Cluster] Cache invalidation from node ${msg.sourceNodeId}: ${msg.payload.cacheKey}`);
        break;
      }
      case "rate_limit":
        // Merge rate limiter counts from other nodes for distributed rate limiting
        this.fastify.log.info(`[Cluster] Rate limit sync from node ${msg.sourceNodeId}`);
        break;
    }
  }

  /** 获取集群状态 */
  getStatus(): { nodeId: string; enabled: boolean } {
    return { nodeId: this.nodeId, enabled: this.enabled };
  }

  /** 停止集群桥接 */
  async stop(): Promise<void> {
    this.fastify.log.info("[Cluster] Bridge stopped");
  }
}
