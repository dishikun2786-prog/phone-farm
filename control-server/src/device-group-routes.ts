/**
 * PhoneFarm Device Group Routes — 设备分组 CRUD + 批量操作 API
 */
import type { FastifyInstance } from "fastify";

interface DeviceGroup {
  id: string;
  name: string;
  description: string;
  deviceIds: string[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export class DeviceGroupStore {
  private fastify: FastifyInstance;
  private groups: DeviceGroup[] = [];

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  create(name: string, description: string, deviceIds: string[], tags: string[]): DeviceGroup {
    const { randomUUID } = require("crypto");
    const group: DeviceGroup = {
      id: randomUUID(),
      name, description, deviceIds, tags,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.groups.push(group);
    this.fastify.log.info(`[DeviceGroup] Created group "${name}" with ${deviceIds.length} devices`);
    return group;
  }

  list(): DeviceGroup[] { return this.groups; }

  get(id: string): DeviceGroup | undefined { return this.groups.find((g) => g.id === id); }

  update(id: string, updates: Partial<DeviceGroup>): DeviceGroup | null {
    const group = this.groups.find((g) => g.id === id);
    if (!group) return null;
    Object.assign(group, updates, { updatedAt: Date.now() });
    return group;
  }

  delete(id: string): boolean {
    const idx = this.groups.findIndex((g) => g.id === id);
    if (idx < 0) return false;
    this.groups.splice(idx, 1);
    return true;
  }
}

export async function deviceGroupRoutes(app: FastifyInstance): Promise<void> {
  const store = new DeviceGroupStore(app);

  // 创建设备分组
  app.post("/api/v1/device-groups", async (req, reply) => {
    const { name, description, deviceIds, tags } = req.body as {
      name: string; description?: string; deviceIds?: string[]; tags?: string[];
    };
    const group = store.create(name, description ?? "", deviceIds ?? [], tags ?? []);
    return reply.status(201).send(group);
  });

  // 列出所有分组
  app.get("/api/v1/device-groups", async (_req, reply) => {
    const groups = store.list();
    return reply.send({ groups, total: groups.length });
  });

  // 获取单个分组
  app.get("/api/v1/device-groups/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const group = store.get(id);
    if (!group) return reply.status(404).send({ error: "Group not found" });
    return reply.send(group);
  });

  // 更新分组
  app.patch("/api/v1/device-groups/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = store.update(id, req.body as Partial<DeviceGroup>);
    if (!updated) return reply.status(404).send({ error: "Group not found" });
    return reply.send(updated);
  });

  // 删除分组
  app.delete("/api/v1/device-groups/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = store.delete(id);
    if (!deleted) return reply.status(404).send({ error: "Group not found" });
    return reply.send({ ok: true });
  });

  // 给分组添加设备
  app.post("/api/v1/device-groups/:id/devices", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { deviceIds } = req.body as { deviceIds: string[] };
    const group = store.get(id);
    if (!group) return reply.status(404).send({ error: "Group not found" });
    const existing = new Set(group.deviceIds);
    for (const d of deviceIds) existing.add(d);
    group.deviceIds = Array.from(existing);
    group.updatedAt = Date.now();
    return reply.send({ added: deviceIds.length, total: group.deviceIds.length });
  });

  // 从分组移除设备
  app.delete("/api/v1/device-groups/:id/devices", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { deviceIds } = req.body as { deviceIds: string[] };
    const group = store.get(id);
    if (!group) return reply.status(404).send({ error: "Group not found" });
    const removeSet = new Set(deviceIds);
    group.deviceIds = group.deviceIds.filter((d) => !removeSet.has(d));
    group.updatedAt = Date.now();
    return reply.send({ removed: deviceIds.length, total: group.deviceIds.length });
  });
}
