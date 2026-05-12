/**
 * PhoneFarm VLM Prompt Template Routes — Prompt 模板管理 + A/B 测试 API
 */
import type { FastifyInstance } from "fastify";

export interface PromptTemplate {
  id: string;
  modelType: string;
  version: string;
  templateText: string;
  language: "cn" | "en";
  isActive: boolean;
  abTestGroup?: string;
  successRate?: number;
  totalExecutions?: number;
  createdAt: number;
  updatedAt: number;
}

export class PromptTemplateStore {
  private fastify: FastifyInstance;
  private templates: PromptTemplate[] = [];

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /** 获取指定模型类型的活跃 Prompt 模板 */
  getActiveTemplate(modelType: string, deviceId?: string): PromptTemplate | null {
    const candidates = this.templates.filter(
      (t) => t.modelType === modelType && t.isActive
    );
    if (candidates.length === 0) return null;

    // A/B 测试：按 deviceId hash 分配
    if (candidates.length > 1 && deviceId) {
      const hash = deviceId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      return candidates[hash % candidates.length];
    }
    return candidates[0];
  }

  /** 列出所有模板 */
  list(modelType?: string): PromptTemplate[] {
    if (modelType) return this.templates.filter((t) => t.modelType === modelType);
    return this.templates;
  }

  /** 创建模板 */
  create(data: Omit<PromptTemplate, "id" | "createdAt" | "updatedAt">): PromptTemplate {
    const { randomUUID } = require("crypto");
    const t: PromptTemplate = {
      ...data,
      id: randomUUID(),
      successRate: 0,
      totalExecutions: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.templates.push(t);
    return t;
  }

  /** 更新模板 */
  update(id: string, updates: Partial<PromptTemplate>): PromptTemplate | null {
    const t = this.templates.find((t) => t.id === id);
    if (!t) return null;
    Object.assign(t, updates, { updatedAt: Date.now() });
    return t;
  }

  /** 删除模板 */
  delete(id: string): boolean {
    const idx = this.templates.findIndex((t) => t.id === id);
    if (idx < 0) return false;
    this.templates.splice(idx, 1);
    return true;
  }

  /** 上报执行结果（更新成功率和执行次数） */
  reportExecution(templateId: string, success: boolean): void {
    const t = this.templates.find((t) => t.id === templateId);
    if (!t) return;
    t.totalExecutions = (t.totalExecutions ?? 0) + 1;
    if (t.totalExecutions > 0) {
      const successes = (t.successRate ?? 0) * (t.totalExecutions - 1) / 100 + (success ? 1 : 0);
      t.successRate = Math.round((successes / t.totalExecutions) * 10000) / 100;
    }
  }

  /** 获取 A/B 测试统计 */
  getABTestStats(modelType: string): Array<{
    templateId: string;
    version: string;
    successRate: number;
    totalExecutions: number;
    isActive: boolean;
  }> {
    return this.templates
      .filter((t) => t.modelType === modelType)
      .map((t) => ({
        templateId: t.id,
        version: t.version,
        successRate: t.successRate ?? 0,
        totalExecutions: t.totalExecutions ?? 0,
        isActive: t.isActive,
      }));
  }
}

export async function promptTemplateRoutes(app: FastifyInstance): Promise<void> {
  const store = new PromptTemplateStore(app);

  // 列出所有 Prompt 模板
  app.get("/api/v1/vlm/prompt-templates", async (req, reply) => {
    const { modelType } = req.query as Record<string, string>;
    const templates = store.list(modelType);
    return reply.send({ templates });
  });

  // 创建 Prompt 模板
  app.post("/api/v1/vlm/prompt-templates", async (req, reply) => {
    const template = store.create(req.body as any);
    return reply.status(201).send(template);
  });

  // 获取单个模板
  app.get("/api/v1/vlm/prompt-templates/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const templates = store.list();
    const t = templates.find((t) => t.id === id);
    if (!t) return reply.status(404).send({ error: "Template not found" });
    return reply.send(t);
  });

  // 更新模板
  app.patch("/api/v1/vlm/prompt-templates/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = store.update(id, req.body as any);
    if (!updated) return reply.status(404).send({ error: "Template not found" });
    return reply.send(updated);
  });

  // 删除模板
  app.delete("/api/v1/vlm/prompt-templates/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = store.delete(id);
    if (!deleted) return reply.status(404).send({ error: "Template not found" });
    return reply.send({ ok: true });
  });

  // 获取 A/B 测试统计
  app.get("/api/v1/vlm/prompt-templates/ab-stats/:modelType", async (req, reply) => {
    const { modelType } = req.params as { modelType: string };
    const stats = store.getABTestStats(modelType);
    return reply.send({ modelType, stats });
  });

  // 全量切换某模板为活跃（结束 A/B 测试）
  app.post("/api/v1/vlm/prompt-templates/:id/activate", async (req, reply) => {
    const { id } = req.params as { id: string };
    const t = store.list().find((t) => t.id === id);
    if (!t) return reply.status(404).send({ error: "Template not found" });
    // Deactivate all other templates of same model
    store.list(t.modelType).forEach((other) => {
      if (other.id !== id) store.update(other.id, { isActive: false });
    });
    store.update(id, { isActive: true, abTestGroup: undefined });
    return reply.send({ ok: true, activated: id });
  });
}
