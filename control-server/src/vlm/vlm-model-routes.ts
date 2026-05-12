/**
 * VLM Model Configuration Routes — CRUD management for VLM model configs,
 * connection testing, and A/B comparison.
 *
 * Endpoints (all under /api/v1/vlm/models):
 *   GET    /models          List all model configs (apiKey masked)
 *   GET    /models/ab-test  List A/B test history
 *   POST   /models/ab-test  Run an A/B comparison
 *   GET    /models/:id      Get single model config
 *   POST   /models          Create a model config
 *   PUT    /models/:id      Update a model config
 *   DELETE /models/:id      Delete a model config
 *   POST   /models/:id/test Test connectivity to model's API
 */
import { type FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { runABTest, type ModelUnderTest } from './model-ab';
import type { ModelType } from './vlm-client';
import { EpisodeRecorder } from './episode-recorder';

export interface VlmModelConfig {
  id: string;
  name: string;
  modelName: string;
  modelType: ModelType;
  apiUrl: string;
  apiKey?: string;
  maxTokens: number;
  temperature: number;
  pricing: {
    inputPer1kTokens: number;
    outputPer1kTokens: number;
    perImage?: number;
  };
  isDefault: boolean;
  isEnabled: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ABTestRun {
  id: string;
  modelAId: string;
  modelAName: string;
  modelBId: string;
  modelBName: string;
  episodeId: string;
  result: any;
  createdAt: string;
}

function maskApiKey(key?: string): string | undefined {
  if (!key) return undefined;
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

export const DEFAULT_MODEL_SEEDS: Omit<VlmModelConfig, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'AutoGLM-Phone-9B',
    modelName: 'autoglm-phone-9b',
    modelType: 'autoglm',
    apiUrl: 'http://localhost:5000/api/vlm/execute',
    maxTokens: 1024,
    temperature: 0.1,
    pricing: { inputPer1kTokens: 0.0005, outputPer1kTokens: 0.0015, perImage: 0.001 },
    isDefault: true,
    isEnabled: true,
    description: '清华 AutoGLM 手机操作模型，9B 参数',
  },
  {
    name: 'AutoGLM-Phone-72B',
    modelName: 'autoglm-phone-72b',
    modelType: 'autoglm',
    apiUrl: 'http://localhost:5000/api/vlm/execute',
    maxTokens: 1024,
    temperature: 0.1,
    pricing: { inputPer1kTokens: 0.002, outputPer1kTokens: 0.006, perImage: 0.003 },
    isDefault: false,
    isEnabled: false,
    description: 'AutoGLM 大参数版本，72B',
  },
  {
    name: 'Qwen-VL-Max',
    modelName: 'qwen-vl-max',
    modelType: 'qwenvl',
    apiUrl: 'http://localhost:5000/api/vlm/execute',
    maxTokens: 1024,
    temperature: 0.1,
    pricing: { inputPer1kTokens: 0.003, outputPer1kTokens: 0.009 },
    isDefault: false,
    isEnabled: true,
    description: '通义千问视觉大模型',
  },
  {
    name: 'UI-TARS-72B',
    modelName: 'ui-tars-72b',
    modelType: 'uitars',
    apiUrl: 'http://localhost:5000/api/vlm/execute',
    maxTokens: 1024,
    temperature: 0.1,
    pricing: { inputPer1kTokens: 0.002, outputPer1kTokens: 0.006 },
    isDefault: false,
    isEnabled: false,
    description: '字节跳动 UI-TARS GUI 操作模型',
  },
  {
    name: 'MAI-UI-7B',
    modelName: 'maiui-7b',
    modelType: 'maiui',
    apiUrl: 'http://localhost:5000/api/vlm/execute',
    maxTokens: 1024,
    temperature: 0.1,
    pricing: { inputPer1kTokens: 0.0003, outputPer1kTokens: 0.0009, perImage: 0.0005 },
    isDefault: false,
    isEnabled: false,
    description: '轻量级 UI 理解模型，成本极低',
  },
  {
    name: 'GUI-Owl',
    modelName: 'gui-owl',
    modelType: 'guiowl',
    apiUrl: 'http://localhost:5000/api/vlm/execute',
    maxTokens: 1024,
    temperature: 0.1,
    pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.003 },
    isDefault: false,
    isEnabled: false,
    description: 'GUI-Owl 视觉语言模型',
  },
];

export function registerVlmModelRoutes(
  app: FastifyInstance,
  getStore: () => VlmModelConfig[],
  setStore: (models: VlmModelConfig[]) => void,
): void {
  const abTestHistory: ABTestRun[] = [];

  function sanitize(m: VlmModelConfig): VlmModelConfig {
    return { ...m, apiKey: maskApiKey(m.apiKey) };
  }

  // ── GET /models — list all ──
  app.get('/api/v1/vlm/models', async () => {
    return getStore()
      .map(sanitize)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  // ── GET /models/ab-test — A/B test history ──
  // MUST be registered before /models/:id
  app.get('/api/v1/vlm/models/ab-test', async () => {
    return abTestHistory.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  // ── POST /models/ab-test — run A/B comparison ──
  // MUST be registered before /models/:id
  app.post('/api/v1/vlm/models/ab-test', async (req, reply) => {
    const { modelAId, modelBId, episodeId } = req.body as {
      modelAId: string;
      modelBId: string;
      episodeId: string;
    };

    if (!modelAId || !modelBId || !episodeId) {
      return reply.status(400).send({ error: 'modelAId, modelBId, and episodeId are required' });
    }

    const models = getStore();
    const modelA = models.find(m => m.id === modelAId);
    const modelB = models.find(m => m.id === modelBId);

    if (!modelA || !modelB) {
      return reply.status(404).send({ error: 'Model not found' });
    }

    // Load episode from filesystem
    const episode = EpisodeRecorder.loadEpisode(episodeId);
    if (!episode) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const modelUnderTestA: ModelUnderTest = {
      modelName: modelA.modelName,
      modelType: modelA.modelType,
      pricing: {
        inputPer1kTokens: modelA.pricing.inputPer1kTokens,
        outputPer1kTokens: modelA.pricing.outputPer1kTokens,
        perImage: modelA.pricing.perImage,
        avgTokensPerStep: 800,
        avgOutputTokensPerStep: 200,
        currency: 'USD',
      },
      episode,
    };

    const modelUnderTestB: ModelUnderTest = {
      modelName: modelB.modelName,
      modelType: modelB.modelType,
      pricing: {
        inputPer1kTokens: modelB.pricing.inputPer1kTokens,
        outputPer1kTokens: modelB.pricing.outputPer1kTokens,
        perImage: modelB.pricing.perImage,
        avgTokensPerStep: 800,
        avgOutputTokensPerStep: 200,
        currency: 'USD',
      },
      episode,
    };

    const result = runABTest(
      `AB: ${modelA.name} vs ${modelB.name}`,
      [modelUnderTestA, modelUnderTestB],
    );

    const run: ABTestRun = {
      id: randomUUID(),
      modelAId,
      modelAName: modelA.name,
      modelBId,
      modelBName: modelB.name,
      episodeId,
      result,
      createdAt: new Date().toISOString(),
    };

    abTestHistory.push(run);
    return run;
  });

  // ── GET /models/:id ──
  app.get('/api/v1/vlm/models/:id', async (req, reply) => {
    const m = getStore().find(m => m.id === (req.params as Record<string, string>).id);
    if (!m) return reply.status(404).send({ error: 'Model not found' });
    return sanitize(m);
  });

  // ── POST /models — create ──
  app.post('/api/v1/vlm/models', async (req, reply) => {
    const body = req.body as any;

    if (!body.name || !body.modelName || !body.apiUrl || !body.modelType) {
      return reply.status(400).send({ error: 'name, modelName, apiUrl, and modelType are required' });
    }

    const now = new Date().toISOString();
    const model: VlmModelConfig = {
      id: randomUUID(),
      name: body.name,
      modelName: body.modelName,
      modelType: body.modelType,
      apiUrl: body.apiUrl,
      apiKey: body.apiKey,
      maxTokens: Number(body.maxTokens) || 1024,
      temperature: Number(body.temperature) || 0.1,
      pricing: {
        inputPer1kTokens: Number(body.pricing?.inputPer1kTokens) || 0.001,
        outputPer1kTokens: Number(body.pricing?.outputPer1kTokens) || 0.003,
        perImage: body.pricing?.perImage != null ? Number(body.pricing.perImage) : undefined,
      },
      isDefault: Boolean(body.isDefault),
      isEnabled: body.isEnabled !== false,
      description: body.description,
      createdAt: now,
      updatedAt: now,
    };

    const models = getStore();

    // If this is default, clear others
    if (model.isDefault) {
      for (const m of models) m.isDefault = false;
    }
    // If first model, make it default
    if (models.length === 0) {
      model.isDefault = true;
    }

    models.push(model);
    setStore(models);

    return reply.status(201).send(sanitize(model));
  });

  // ── PUT /models/:id — update ──
  app.put('/api/v1/vlm/models/:id', async (req, reply) => {
    const models = getStore();
    const idx = models.findIndex(m => m.id === (req.params as Record<string, string>).id);
    if (idx === -1) return reply.status(404).send({ error: 'Model not found' });

    const body = req.body as any;

    if (body.isDefault) {
      for (const m of models) m.isDefault = false;
    }

    const existing = models[idx];
    const updated: VlmModelConfig = {
      ...existing,
      name: body.name ?? existing.name,
      modelName: body.modelName ?? existing.modelName,
      modelType: body.modelType ?? existing.modelType,
      apiUrl: body.apiUrl ?? existing.apiUrl,
      apiKey: body.apiKey !== undefined ? body.apiKey : existing.apiKey,
      maxTokens: body.maxTokens != null ? Number(body.maxTokens) : existing.maxTokens,
      temperature: body.temperature != null ? Number(body.temperature) : existing.temperature,
      pricing: {
        inputPer1kTokens: body.pricing?.inputPer1kTokens != null
          ? Number(body.pricing.inputPer1kTokens) : existing.pricing.inputPer1kTokens,
        outputPer1kTokens: body.pricing?.outputPer1kTokens != null
          ? Number(body.pricing.outputPer1kTokens) : existing.pricing.outputPer1kTokens,
        perImage: body.pricing?.perImage !== undefined
          ? (body.pricing.perImage != null ? Number(body.pricing.perImage) : undefined)
          : existing.pricing.perImage,
      },
      isDefault: body.isDefault !== undefined ? Boolean(body.isDefault) : existing.isDefault,
      isEnabled: body.isEnabled !== undefined ? Boolean(body.isEnabled) : existing.isEnabled,
      description: body.description !== undefined ? body.description : existing.description,
      updatedAt: new Date().toISOString(),
    };

    models[idx] = updated;
    setStore(models);

    return sanitize(updated);
  });

  // ── DELETE /models/:id ──
  app.delete('/api/v1/vlm/models/:id', async (req, reply) => {
    const models = getStore();
    const target = models.find(m => m.id === (req.params as Record<string, string>).id);
    if (!target) return reply.status(404).send({ error: 'Model not found' });

    // If deleting the default and other models exist, reject
    if (target.isDefault && models.length > 1) {
      return reply.status(400).send({ error: '请先将其他模型设为默认后再删除' });
    }

    const filtered = models.filter(m => m.id !== target.id);
    setStore(filtered);
    return { success: true };
  });

  // ── POST /models/:id/test — connectivity check ──
  app.post('/api/v1/vlm/models/:id/test', async (req, reply) => {
    const m = getStore().find(m => m.id === (req.params as Record<string, string>).id);
    if (!m) return reply.status(404).send({ error: 'Model not found' });

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(m.apiUrl.replace('/api/vlm/execute', '/health'), {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const latencyMs = Date.now() - start;
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        return {
          success: true,
          latencyMs,
          modelName: body.model || m.modelName,
          message: `连接成功 (${latencyMs}ms)`,
        };
      }
      return {
        success: false,
        latencyMs,
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      if (err.name === 'AbortError') {
        return { success: false, latencyMs, error: '连接超时 (5s)' };
      }
      return { success: false, latencyMs, error: err.message || '连接失败' };
    }
  });
}
