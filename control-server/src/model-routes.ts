/**
 * PhoneFarm Model Routes — 本地 VLM 模型管理 API
 */
import type { FastifyInstance } from "fastify";
import crypto from "crypto";

export interface LocalModelManifest {
  id: string;
  displayName: string;
  version: string;
  fileSizeBytes: number;
  quantization: string;
  minRamMb: number;
  recommendedBackend: string;
  architecture: string;
  minAndroidVersion: number;
  downloadUrl?: string;
  changelog?: string;
  createdAt: number;
}

export interface ModelStatus {
  deviceId: string;
  modelId: string;
  status: "not_downloaded" | "downloading" | "ready" | "loaded" | "error";
  progress: number;
  errorMessage?: string;
  updatedAt: number;
}

class ModelStore {
  private models: Map<string, LocalModelManifest> = new Map();
  private deviceStatuses: Map<string, ModelStatus> = new Map(); // key = `${deviceId}:${modelId}`
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
    this.seedDefaults();
  }

  private seedDefaults(): void {
    const defaults: Omit<LocalModelManifest, "id" | "createdAt">[] = [
      {
        displayName: "Qwen2.5-VL 2B (Q4_K_M)",
        version: "1.0.0",
        fileSizeBytes: 1_300_000_000,
        quantization: "Q4_K_M",
        minRamMb: 2500,
        recommendedBackend: "vulkan",
        architecture: "arm64-v8a",
        minAndroidVersion: 26,
        downloadUrl: "https://huggingface.co/models/qwen2.5-vl-2b-q4",
        changelog: "Initial release with Q4_K_M quantization for mobile inference",
      },
      {
        displayName: "MobileVLM 1.7B (Q3_K_M)",
        version: "1.0.0",
        fileSizeBytes: 900_000_000,
        quantization: "Q3_K_M",
        minRamMb: 1800,
        recommendedBackend: "npu",
        architecture: "arm64-v8a",
        minAndroidVersion: 26,
        downloadUrl: "https://huggingface.co/models/mobilevlm-1.7b-q3",
        changelog: "Lightweight VLM optimized for NPU inference on mobile devices",
      },
      {
        displayName: "Qwen2.5-VL 7B (Q4_K_M)",
        version: "1.0.0",
        fileSizeBytes: 4_200_000_000,
        quantization: "Q4_K_M",
        minRamMb: 6000,
        recommendedBackend: "vulkan",
        architecture: "arm64-v8a",
        minAndroidVersion: 28,
        downloadUrl: "https://huggingface.co/models/qwen2.5-vl-7b-q4",
        changelog: "Higher accuracy 7B model for flagship devices with abundant RAM",
      },
    ];

    for (const m of defaults) {
      const id = m.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "") + "-q4";
      const manifest: LocalModelManifest = {
        ...(m as Omit<LocalModelManifest, "id" | "createdAt">),
        id,
        createdAt: Date.now(),
      };
      this.models.set(manifest.id, manifest);
    }
  }

  /** List all models */
  listAll(): LocalModelManifest[] {
    return Array.from(this.models.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Get a single model */
  get(id: string): LocalModelManifest | undefined {
    return this.models.get(id);
  }

  /** Upload/register a new model */
  create(data: Omit<LocalModelManifest, "id" | "createdAt"> & { id?: string }): LocalModelManifest {
    const model: LocalModelManifest = {
      ...data,
      id: data.id ?? crypto.randomUUID(),
      createdAt: Date.now(),
    };
    this.models.set(model.id, model);
    this.fastify.log.info(`[Model] Uploaded model: ${model.displayName} (${model.id})`);
    return model;
  }

  /** Publish a model version */
  publish(id: string, version: string): boolean {
    const model = this.models.get(id);
    if (!model) return false;
    model.version = version;
    return true;
  }

  /** Get device model status */
  getDeviceStatus(deviceId: string, modelId: string): ModelStatus {
    const key = `${deviceId}:${modelId}`;
    return (
      this.deviceStatuses.get(key) || {
        deviceId,
        modelId,
        status: "not_downloaded",
        progress: 0,
        updatedAt: Date.now(),
      }
    );
  }

  /** Update device model status */
  updateDeviceStatus(status: ModelStatus): void {
    const key = `${status.deviceId}:${status.modelId}`;
    status.updatedAt = Date.now();
    this.deviceStatuses.set(key, status);
    this.fastify.log.info(
      `[Model] ${status.deviceId} -> ${status.modelId}: ${status.status} (${Math.round(status.progress * 100)}%)`,
    );
  }

  /** Get all model statuses for a device */
  getDeviceStatuses(deviceId: string): ModelStatus[] {
    const results: ModelStatus[] = [];
    for (const status of this.deviceStatuses.values()) {
      if (status.deviceId === deviceId) results.push(status);
    }
    return results;
  }

  /** Get usage stats per model */
  getUsageStats(): Array<{ modelId: string; downloadCount: number; loadCount: number; errorCount: number }> {
    const stats: Record<
      string,
      { modelId: string; downloadCount: number; loadCount: number; errorCount: number }
    > = {};
    for (const status of this.deviceStatuses.values()) {
      if (!stats[status.modelId]) {
        stats[status.modelId] = { modelId: status.modelId, downloadCount: 0, loadCount: 0, errorCount: 0 };
      }
      if (status.status === "ready" || status.status === "downloading") stats[status.modelId]!.downloadCount++;
      if (status.status === "loaded") stats[status.modelId]!.loadCount++;
      if (status.status === "error") stats[status.modelId]!.errorCount++;
    }
    return Object.values(stats);
  }
}

export async function modelRoutes(app: FastifyInstance): Promise<void> {
  const store = new ModelStore(app);

  // 获取可用模型清单
  app.get("/api/v1/models/manifest", async (_req, reply) => {
    return reply.send({ models: store.listAll() });
  });

  // 获取模型详细信息
  app.get("/api/v1/models/:id/info", async (req, reply) => {
    const { id } = req.params as { id: string };
    const model = store.get(id);
    if (!model) return reply.status(404).send({ error: "Model not found" });
    return reply.send(model);
  });

  // 上传新模型（管理员）
  app.post("/api/v1/models/upload", async (req, reply) => {
    const data = req.body as any;
    if (!data.displayName) {
      return reply.status(400).send({ error: "displayName required" });
    }
    const model = store.create(data);
    return reply.status(201).send(model);
  });

  // 发布模型版本
  app.post("/api/v1/models/:id/publish", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { version } = req.body as { version: string };
    if (!version) return reply.status(400).send({ error: "version required" });
    const ok = store.publish(id, version);
    if (!ok) return reply.status(404).send({ error: "Model not found" });
    return reply.send({ ok: true, published: id, version });
  });

  // 查询设备模型状态
  app.get("/api/v1/models/:id/status/:deviceId", async (req, reply) => {
    const { id, deviceId } = req.params as { id: string; deviceId: string };
    const status = store.getDeviceStatus(deviceId, id);
    return reply.send(status);
  });

  // 根据设备能力推荐最佳模型
  app.post("/api/v1/models/recommend", async (req, reply) => {
    const { ramMb, gpuModel, npuAvailable } = req.body as {
      ramMb: number; gpuModel?: string; npuAvailable?: boolean;
    };

    const models = store.listAll();
    // Filter models that can run on this device
    const candidates = models.filter((m) => m.minRamMb <= ramMb);

    if (candidates.length === 0) {
      return reply.status(400).send({ error: "No compatible model found for this device" });
    }

    // Sort by accuracy (larger file size = generally better) then by compatibility
    candidates.sort((a, b) => {
      // Prefer NPU backend if available
      if (npuAvailable) {
        if (a.recommendedBackend === "npu" && b.recommendedBackend !== "npu") return -1;
        if (a.recommendedBackend !== "npu" && b.recommendedBackend === "npu") return 1;
      }
      // Fallback: prefer larger model (more accurate)
      return b.fileSizeBytes - a.fileSizeBytes;
    });

    const best = candidates[0]!;
    const recommendation = {
      modelId: best.id,
      displayName: best.displayName,
      reason: npuAvailable
        ? `Best NPU-compatible model for ${ramMb}MB RAM: ${best.displayName}`
        : `Best model for ${ramMb}MB RAM: ${best.displayName} (${best.quantization})`,
    };

    return reply.send(recommendation);
  });

  // 获取设备模型使用统计
  app.get("/api/v1/models/usage/stats", async (_req, reply) => {
    const usage = store.getUsageStats();
    return reply.send({ usage });
  });

  // 上报模型状态变更
  app.post("/api/v1/models/status/report", async (req, reply) => {
    const { deviceId, modelId, status, progress, errorMessage } = req.body as {
      deviceId: string; modelId: string; status: "not_downloaded" | "downloading" | "ready" | "loaded" | "error";
      progress: number; errorMessage?: string;
    };
    if (!deviceId || !modelId || !status) {
      return reply.status(400).send({ error: "deviceId, modelId, and status are required" });
    }
    store.updateDeviceStatus({
      deviceId,
      modelId,
      status,
      progress: progress ?? 0,
      errorMessage,
      updatedAt: Date.now(),
    });
    return reply.send({ ok: true });
  });
}
