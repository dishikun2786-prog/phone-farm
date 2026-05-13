/**
 * PhoneFarm Device Configuration Routes — 设备云端配置拉取 + 管理端配置推送
 */
import type { FastifyInstance } from "fastify";

export interface DeviceConfig {
  device: {
    name: string;
    runtime: string;
    heartbeatIntervalMs: number;
    screenshotMaxSize: number;
    screenshotQuality: number;
    screenshotFormat: string;
    quietHours?: { enabled: boolean; start: string; end: string; timezone: string };
  };
  ws: {
    serverUrl: string;
    reconnectBaseMs: number;
    reconnectMaxMs: number;
  };
  vlm: {
    routing: {
      mode: "auto" | "cloud" | "local";
      preferredLocalModel: string;
      fallbackToCloud: boolean;
      cloudTimeoutMs: number;
      maxLocalSteps: number;
      maxLocalStepDurationMs: number;
    };
    cloud: {
      enabled: boolean;
      provider: string;
      apiBase: string;
      apiKey: string;
      modelName: string;
      maxSteps: number;
      temperature: number;
      maxTokens: number;
      promptTemplateStyle: string;
      coordinateSystem: string;
    };
    local: {
      enabled: boolean;
      autoDownload: boolean;
      preferredBackend: string;
      maxConcurrentModels: number;
      keepModelLoaded: boolean;
      unloadOnBatteryLow: boolean;
      batteryLowThreshold: number;
      allowCellularDownload: boolean;
    };
    historyLength: number;
    traceEnabled: boolean;
  };
  scripts: {
    version: string;
    autoUpdate: boolean;
    preRelease: boolean;
  };
  logging: {
    level: string;
    maxLocalDays: number;
  };
}

const DEFAULT_CONFIG: DeviceConfig = {
  device: {
    name: "",
    runtime: "phonefarm-native",
    heartbeatIntervalMs: 5000,
    screenshotMaxSize: 720,
    screenshotQuality: 50,
    screenshotFormat: "jpeg",
  },
  ws: {
    serverUrl: "",
    reconnectBaseMs: 2000,
    reconnectMaxMs: 60000,
  },
  vlm: {
    routing: {
      mode: "auto",
      preferredLocalModel: "qwen2.5-vl-2b-q4",
      fallbackToCloud: true,
      cloudTimeoutMs: 5000,
      maxLocalSteps: 30,
      maxLocalStepDurationMs: 800,
    },
    cloud: {
      enabled: true,
      provider: "zhipu",
      apiBase: "https://open.bigmodel.cn/api/paas/v4",
      apiKey: "",
      modelName: "autoglm-phone-9b",
      maxSteps: 50,
      temperature: 0.1,
      maxTokens: 8192,
      promptTemplateStyle: "autoglm",
      coordinateSystem: "normalized_1000",
    },
    local: {
      enabled: true,
      autoDownload: true,
      preferredBackend: "auto",
      maxConcurrentModels: 1,
      keepModelLoaded: true,
      unloadOnBatteryLow: true,
      batteryLowThreshold: 20,
      allowCellularDownload: false,
    },
    historyLength: 5,
    traceEnabled: true,
  },
  scripts: {
    version: "0.0.0",
    autoUpdate: true,
    preRelease: false,
  },
  logging: {
    level: "info",
    maxLocalDays: 7,
  },
};

export async function deviceConfigRoutes(app: FastifyInstance): Promise<void> {
  // In-memory device config storage
  const deviceConfigs = new Map<string, Partial<DeviceConfig>>();

  /** Merge saved config with defaults */
  function getConfig(deviceId: string): DeviceConfig {
    const saved = deviceConfigs.get(deviceId) || {};
    return deepMerge(DEFAULT_CONFIG, saved) as DeviceConfig;
  }

  /** Deep merge two objects */
  function deepMerge(target: any, source: any): any {
    if (typeof target !== "object" || target === null) return source;
    if (typeof source !== "object" || source === null) return source;
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (key in result && typeof result[key] === "object" && result[key] !== null && !Array.isArray(result[key])) {
        result[key] = deepMerge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  // 设备拉取自己的云端配置
  app.get("/api/v1/device/config", async (req, reply) => {
    const { deviceId } = req.query as Record<string, string>;
    if (!deviceId) return reply.status(400).send({ error: "deviceId required" });
    return reply.send(getConfig(deviceId));
  });

  // 管理端：获取指定设备的配置
  app.get("/api/v1/devices/:deviceId/config", async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    return reply.send({ deviceId, config: getConfig(deviceId) });
  });

  // 管理端：更新设备配置（持久化并推送到设备）
  app.put("/api/v1/devices/:deviceId/config", async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const config = req.body as Partial<DeviceConfig>;

    // Save to in-memory store
    const existing = deviceConfigs.get(deviceId) || {};
    deviceConfigs.set(deviceId, deepMerge(existing, config));

    // Push to device via WebSocket
    const wsHub = (app as any).wsHub;
    if (wsHub) {
      wsHub.sendToDevice(deviceId, {
        type: "config_update",
        config,
        timestamp: Date.now(),
      });
    }
    app.log.info(`[Config] Updated config for device ${deviceId}`);
    return reply.send({ ok: true, deviceId, config: getConfig(deviceId) });
  });

  // 管理端：批量更新设备配置
  app.put("/api/v1/devices/config/batch", async (req, reply) => {
    const { deviceIds, config } = req.body as {
      deviceIds: string[];
      config: Partial<DeviceConfig>;
    };
    const wsHub = (app as any).wsHub;
    let pushed = 0;
    if (wsHub) {
      for (const deviceId of deviceIds) {
        if (wsHub.sendToDevice(deviceId, { type: "config_update", config, timestamp: Date.now() })) {
          pushed++;
        }
      }
    }
    return reply.send({ ok: true, total: deviceIds.length, pushed });
  });

  // 获取 VLM 路由配置（管理面板用）
  app.get("/api/v1/devices/:deviceId/vlm-routing", async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const config = getConfig(deviceId);
    return reply.send({ deviceId, routing: config.vlm.routing });
  });

  // 管理端：远程切换设备 VLM 推理模式
  app.put("/api/v1/devices/:deviceId/vlm-routing", async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const routing = req.body as Partial<DeviceConfig["vlm"]["routing"]>;

    // Persist the routing change
    const existing = deviceConfigs.get(deviceId) || {};
    const updated = deepMerge(existing, { vlm: { routing } });
    deviceConfigs.set(deviceId, updated);

    // Push to device
    const wsHub = (app as any).wsHub;
    if (wsHub) {
      wsHub.sendToDevice(deviceId, {
        type: "vlm_routing_update",
        routing,
        timestamp: Date.now(),
      });
    }
    return reply.send({ ok: true, deviceId, routing: getConfig(deviceId).vlm.routing });
  });
}
