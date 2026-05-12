/**
 * memory-routes.ts — 跨设备记忆系统 REST API。
 *
 * 端点:
 *   GET /api/v1/memory/stats
 *   POST /api/v1/memory/rules/sync
 */
import type { FastifyInstance } from "fastify";
import type { MemoryStore } from "./memory-store";
import type { ExperienceCompiler } from "./experience-compiler";

export function registerMemoryRoutes(
  app: FastifyInstance,
  memoryStore: MemoryStore,
  compiler: ExperienceCompiler,
): void {
  app.get("/api/v1/memory/stats", async () => {
    return memoryStore.getStats();
  });

  app.post("/api/v1/memory/rules/sync", async () => {
    await compiler.compile();
    return { status: "synced" };
  });
}
