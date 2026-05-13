/**
 * PhoneFarm Config Manager Routes — centralized configuration management API.
 *
 * Endpoints:
 *   GET    /api/v1/config/categories
 *   GET    /api/v1/config/definitions
 *   GET    /api/v1/config/resolve            — resolve config for a context
 *   GET    /api/v1/config/resolve/:deviceId  — resolve config for a device
 *   GET    /api/v1/config/values              — list all scoped values
 *   GET    /api/v1/config/values/:scope/:scopeId
 *   PUT    /api/v1/config/values              — upsert a config value
 *   DELETE /api/v1/config/values/:id
 *   GET    /api/v1/config/templates
 *   POST   /api/v1/config/templates
 *   PUT    /api/v1/config/templates/:id
 *   DELETE /api/v1/config/templates/:id
 *   POST   /api/v1/config/templates/:id/apply
 *   GET    /api/v1/config/audit-log
 *   POST   /api/v1/config/seed                — seed default definitions
 *   POST   /api/v1/config/export
 *   POST   /api/v1/config/import
 */
import type { FastifyInstance } from "fastify";
import type { AuthUser } from "../auth/auth-middleware.js";
import { hasPermission } from "../auth/rbac.js";
import { db } from "../db.js";
import {
  configCategories,
  configDefinitions,
  configValues,
  configTemplates,
  configChangeLog,
} from "./config-schema.js";
import { CATEGORIES, DEFINITIONS } from "./config-definitions.js";
import { ConfigResolver } from "./config-resolver.js";
import { eq, desc, and, sql } from "drizzle-orm";

const resolver = new ConfigResolver();

/** Device-facing config resolve — no JWT auth (devices use DEVICE_AUTH_TOKEN via WebSocket) */
export async function deviceConfigResolveRoute(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/config/resolve/:deviceId", async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const configs = await resolver.resolve({ deviceId });

    const flat: Record<string, string> = {};
    for (const c of configs) {
      if (!c.isSecret) flat[c.key] = c.value;
    }

    return reply.send({ deviceId, config: flat, configs });
  });
}

export async function configRoutes(app: FastifyInstance): Promise<void> {

  function getUser(req: any): AuthUser {
    return (req as any).user as AuthUser;
  }

  function checkPerm(req: any, reply: any, action: "read" | "write" | "delete" | "manage"): boolean {
    const user = getUser(req);
    if (!user || !hasPermission(user.role, "config", action)) {
      reply.status(403).send({ error: `Permission denied — ${action} on config requires higher role` });
      return false;
    }
    return true;
  }

  // ── Categories ──

  app.get("/api/v1/config/categories", async (req, reply) => {
    if (!checkPerm(req, reply, "read")) return;
    const cats = await db
      .select()
      .from(configCategories)
      .orderBy(configCategories.sortOrder);
    return reply.send({ categories: cats });
  });

  // ── Definitions ──

  app.get("/api/v1/config/definitions", async (req, reply) => {
    if (!checkPerm(req, reply, "read")) return;
    const { category } = req.query as Record<string, string>;
    let query = db.select().from(configDefinitions).$dynamic();
    if (category) {
      const [cat] = await db
        .select()
        .from(configCategories)
        .where(eq(configCategories.key, category))
        .limit(1);
      if (cat) {
        query = query.where(eq(configDefinitions.categoryId, cat.id));
      }
    }
    const defs = await query.orderBy(configDefinitions.sortOrder);
    return reply.send({ definitions: defs });
  });

  app.get("/api/v1/config/definitions/:key", async (req, reply) => {
    if (!checkPerm(req, reply, "read")) return;
    const { key } = req.params as { key: string };
    const [def] = await db
      .select()
      .from(configDefinitions)
      .where(eq(configDefinitions.key, key))
      .limit(1);
    if (!def) return reply.status(404).send({ error: "Definition not found" });
    return reply.send(def);
  });

  // ── Resolve ──

  app.get("/api/v1/config/resolve", async (req, reply) => {
    if (!checkPerm(req, reply, "read")) return;
    const { deviceId, groupId, templateId, planId } = req.query as Record<string, string>;
    const userId = getUser(req).userId;

    const configs = await resolver.resolve({ userId, deviceId, groupId, templateId, planId });

    // Group by category
    const grouped: Record<string, typeof configs> = {};
    for (const c of configs) {
      const cat = c.categoryKey || "uncategorized";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(c);
    }

    return reply.send({ configs, grouped });
  });

  // ── Values (CRUD) ──

  app.get("/api/v1/config/values", async (req, reply) => {
    if (!checkPerm(req, reply, "read")) return;
    const { scope, scopeId, definitionId } = req.query as Record<string, string>;

    let query = db.select().from(configValues).$dynamic();
    if (scope) query = query.where(eq(configValues.scope, scope));
    if (scopeId) query = query.where(eq(configValues.scopeId, scopeId));
    if (definitionId) query = query.where(eq(configValues.definitionId, definitionId));

    const values = await query.orderBy(desc(configValues.updatedAt)).limit(500);
    return reply.send({ values });
  });

  app.get("/api/v1/config/values/:scope/:scopeId", async (req, reply) => {
    if (!checkPerm(req, reply, "read")) return;
    const { scope, scopeId } = req.params as { scope: string; scopeId: string };
    const values = await db
      .select()
      .from(configValues)
      .where(
        and(
          eq(configValues.scope, scope),
          eq(configValues.scopeId, scopeId),
        )
      );
    return reply.send({ values });
  });

  app.put("/api/v1/config/values", async (req, reply) => {
    if (!checkPerm(req, reply, "write")) return;
    const userId = getUser(req).userId;
    const { definitionKey, scope, scopeId, value, changeReason } = req.body as {
      definitionKey: string;
      scope: string;
      scopeId?: string;
      value: string;
      changeReason?: string;
    };

    if (!definitionKey || !scope || value === undefined) {
      return reply.status(400).send({ error: "definitionKey, scope, and value required" });
    }

    const [def] = await db
      .select()
      .from(configDefinitions)
      .where(eq(configDefinitions.key, definitionKey))
      .limit(1);
    if (!def) return reply.status(404).send({ error: "Definition not found" });

    // Validate value type
    const validationError = validateValue(def.valueType, value, def.validationRule as any);
    if (validationError) {
      return reply.status(400).send({ error: validationError });
    }

    // Get old value for audit
    const [existing] = await db
      .select()
      .from(configValues)
      .where(
        and(
          eq(configValues.definitionId, def.id),
          eq(configValues.scope, scope),
          scopeId
            ? eq(configValues.scopeId, scopeId)
            : sql`${configValues.scopeId} IS NULL`,
        )
      )
      .limit(1);

    const oldValue = existing?.value ?? null;

    // Upsert
    if (existing) {
      await db
        .update(configValues)
        .set({
          value,
          version: (existing.version ?? 1) + 1,
          updatedBy: userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(configValues.id, existing.id));
    } else {
      await db.insert(configValues).values({
        definitionId: def.id,
        scope,
        scopeId: scopeId ?? null,
        value,
        version: 1,
        updatedBy: userId ?? null,
      });
    }

    // Audit log
    const ipAddress = (req as any).ip || (req as any).socket?.remoteAddress;
    await db.insert(configChangeLog).values({
      definitionId: def.id,
      configKey: def.key,
      scope,
      scopeId: scopeId ?? null,
      oldValue,
      newValue: value,
      changedBy: userId ?? null,
      ipAddress: typeof ipAddress === "string" ? ipAddress : null,
      changeReason: changeReason ?? null,
    });

    // Push config update via WebSocket to affected devices
    const hub = (app as any).wsHub;
    if (hub && (scope === "global" || scope === "device")) {
      const targetDeviceId = scope === "device" ? scopeId : undefined;
      const payload = {
        type: "config_update",
        configKey: def.key,
        configValue: value,
        version: (existing?.version ?? 0) + 1,
        scope,
        scopeId: scopeId ?? null,
      };

      if (targetDeviceId) {
        hub.sendToDevice(targetDeviceId, payload);
      } else {
        hub.broadcastToDevices(payload);
      }
    }

    return reply.send({ ok: true, key: def.key, scope, value });
  });

  app.delete("/api/v1/config/values/:id", async (req, reply) => {
    if (!checkPerm(req, reply, "delete")) return;
    const userId = getUser(req).userId;
    const { id } = req.params as { id: string };

    const [existing] = await db
      .select()
      .from(configValues)
      .where(eq(configValues.id, id))
      .limit(1);

    if (!existing) return reply.status(404).send({ error: "Value not found" });

    await db.delete(configValues).where(eq(configValues.id, id));

    // Audit
    await db.insert(configChangeLog).values({
      definitionId: existing.definitionId,
      configKey: "", // populated below if we have the def
      scope: existing.scope,
      scopeId: existing.scopeId,
      oldValue: existing.value,
      newValue: null,
      changedBy: userId ?? null,
      changeReason: "deleted",
    });

    return reply.send({ ok: true });
  });

  // ── Templates ──

  app.get("/api/v1/config/templates", async (req, reply) => {
    if (!checkPerm(req, reply, "read")) return;
    const templates = await db
      .select()
      .from(configTemplates)
      .where(eq(configTemplates.isActive, true))
      .orderBy(desc(configTemplates.updatedAt));
    return reply.send({ templates });
  });

  app.post("/api/v1/config/templates", async (req, reply) => {
    if (!checkPerm(req, reply, "write")) return;
    const userId = getUser(req).userId;
    const { name, description, values } = req.body as {
      name: string;
      description?: string;
      values: Record<string, string>;
    };
    if (!name) return reply.status(400).send({ error: "name required" });

    const [tmpl] = await db
      .insert(configTemplates)
      .values({
        name,
        description: description ?? null,
        values: values ?? {},
        createdBy: userId ?? null,
      })
      .returning();

    return reply.status(201).send(tmpl);
  });

  app.put("/api/v1/config/templates/:id", async (req, reply) => {
    if (!checkPerm(req, reply, "write")) return;
    const { id } = req.params as { id: string };
    const { name, description, values } = req.body as {
      name?: string;
      description?: string;
      values?: Record<string, string>;
    };

    const [existing] = await db
      .select()
      .from(configTemplates)
      .where(eq(configTemplates.id, id))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Template not found" });

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (values !== undefined) updates.values = values;

    const [updated] = await db
      .update(configTemplates)
      .set(updates)
      .where(eq(configTemplates.id, id))
      .returning();

    return reply.send(updated);
  });

  app.delete("/api/v1/config/templates/:id", async (req, reply) => {
    if (!checkPerm(req, reply, "delete")) return;
    const { id } = req.params as { id: string };
    await db
      .update(configTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(configTemplates.id, id));
    return reply.send({ ok: true });
  });

  app.post("/api/v1/config/templates/:id/apply", async (req, reply) => {
    if (!checkPerm(req, reply, "write")) return;
    const userId = getUser(req).userId;
    const { id } = req.params as { id: string };
    const { targetScope, targetScopeId } = req.body as {
      targetScope: "device" | "group";
      targetScopeId: string;
    };

    if (!targetScope || !targetScopeId) {
      return reply.status(400).send({ error: "targetScope and targetScopeId required" });
    }

    const result = await resolver.applyTemplate(id, targetScope, targetScopeId, userId);
    return reply.send(result);
  });

  // ── Audit Log ──

  app.get("/api/v1/config/audit-log", async (req, reply) => {
    if (!checkPerm(req, reply, "read")) return;
    const { configKey, scope, limit, offset } = req.query as Record<string, string>;

    let query = db.select().from(configChangeLog).$dynamic();

    if (configKey) query = query.where(eq(configChangeLog.configKey, configKey));
    if (scope) query = query.where(eq(configChangeLog.scope, scope));

    const logs = await query
      .orderBy(desc(configChangeLog.changedAt))
      .limit(Number(limit) || 100)
      .offset(Number(offset) || 0);

    return reply.send({ logs });
  });

  // ── Seed ──

  app.post("/api/v1/config/seed", async (req, reply) => {
    if (!checkPerm(req, reply, "manage")) return;
    // Seed categories
    for (const cat of CATEGORIES) {
      await db
        .insert(configCategories)
        .values(cat as any)
        .onConflictDoNothing();
    }

    // Load categories for ID mapping
    const cats = await db.select().from(configCategories);
    const catMap = new Map(cats.map((c) => [c.key, c.id]));

    // Seed definitions
    let seeded = 0;
    for (const def of DEFINITIONS) {
      const catId = catMap.get(def.categoryKey);
      if (!catId) continue;

      await db
        .insert(configDefinitions)
        .values({
          categoryId: catId,
          key: def.key,
          displayName: def.displayName,
          description: def.description,
          valueType: def.valueType,
          defaultValue: def.defaultValue,
          enumOptions: def.enumOptions ?? null,
          validationRule: def.validationRule ?? null,
          isSecret: def.isSecret,
          isOverridable: def.isOverridable,
          allowedScopes: def.allowedScopes,
          tags: def.tags,
          sortOrder: def.sortOrder,
        } as any)
        .onConflictDoNothing();
      seeded++;
    }

    return reply.send({ categories: cats.length, definitions: seeded });
  });

  // ── Export / Import ──

  app.post("/api/v1/config/export", async (req, reply) => {
    if (!checkPerm(req, reply, "read")) return;
    const { scope, scopeId } = req.body as { scope?: string; scopeId?: string };

    let values;
    if (scope) {
      const cond = scopeId
        ? and(eq(configValues.scope, scope), eq(configValues.scopeId, scopeId))
        : eq(configValues.scope, scope);
      values = await db.select().from(configValues).where(cond);
    } else {
      values = await db.select().from(configValues);
    }

    const templates = await db
      .select()
      .from(configTemplates)
      .where(eq(configTemplates.isActive, true));

    return reply.send({
      exportedAt: new Date().toISOString(),
      values,
      templates,
    });
  });

  app.post("/api/v1/config/import", async (req, reply) => {
    if (!checkPerm(req, reply, "write")) return;
    const userId = getUser(req).userId;
    const { values: importValues, templates: importTemplates, overwrite } = req.body as {
      values?: any[];
      templates?: any[];
      overwrite?: boolean;
    };

    let importedValues = 0;
    let importedTemplates = 0;

    if (importValues && Array.isArray(importValues)) {
      for (const v of importValues) {
        if (overwrite) {
          await db
            .delete(configValues)
            .where(
              and(
                eq(configValues.definitionId, v.definitionId),
                eq(configValues.scope, v.scope),
                eq(configValues.scopeId, v.scopeId ?? null),
              )
            );
        }
        await db
          .insert(configValues)
          .values({
            definitionId: v.definitionId,
            scope: v.scope,
            scopeId: v.scopeId ?? null,
            value: v.value,
            version: 1,
            updatedBy: userId ?? null,
          })
          .onConflictDoNothing();
        importedValues++;
      }
    }

    if (importTemplates && Array.isArray(importTemplates)) {
      for (const t of importTemplates) {
        await db
          .insert(configTemplates)
          .values({
            name: t.name,
            description: t.description ?? null,
            values: t.values ?? {},
            createdBy: userId ?? null,
          })
          .onConflictDoNothing();
        importedTemplates++;
      }
    }

    return reply.send({ importedValues, importedTemplates });
  });
}

function validateValue(
  valueType: string,
  value: string,
  rule?: { min?: number; max?: number; step?: number; pattern?: string; required?: boolean },
): string | null {
  if (rule?.required && (value === undefined || value === null || value === "")) {
    return "此字段为必填项";
  }

  switch (valueType) {
    case "number":
    case "slider": {
      const n = Number(value);
      if (isNaN(n)) return "必须为数字";
      if (rule?.min !== undefined && n < rule.min) return `最小值为 ${rule.min}`;
      if (rule?.max !== undefined && n > rule.max) return `最大值为 ${rule.max}`;
      break;
    }
    case "boolean": {
      if (value !== "true" && value !== "false") return "必须为 true 或 false";
      break;
    }
    case "url": {
      try {
        new URL(value);
      } catch {
        return "URL 格式无效";
      }
      break;
    }
    case "enum": {
      // Enum validation is done by the frontend via enumOptions
      break;
    }
    case "json": {
      try {
        JSON.parse(value);
      } catch {
        return "JSON 格式无效";
      }
      break;
    }
  }

  if (rule?.pattern) {
    try {
      if (!new RegExp(rule.pattern).test(value)) {
        return "格式不匹配";
      }
    } catch {
      // invalid regex pattern — skip validation
    }
  }

  return null;
}
