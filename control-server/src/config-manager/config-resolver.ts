/**
 * PhoneFarm Config Resolver — scope-based config merging engine.
 *
 * Resolution order (highest priority wins):
 *   device → group → template → plan → global → default
 */
import { db } from "../db.js";
import {
  configDefinitions,
  configValues,
  configTemplates,
  configCategories,
} from "./config-schema.js";
import { subscriptions } from "../billing/billing-schema.js";
import { deviceGroups } from "../schema.js";
import { eq, and, inArray } from "drizzle-orm";

export interface ResolvedConfig {
  key: string;
  displayName: string;
  value: string;
  valueType: string;
  source: "default" | "global" | "plan" | "template" | "group" | "device";
  sourceId?: string;
  isSecret: boolean;
  categoryKey: string;
  categoryDisplayName: string;
}

export interface ConfigResolutionContext {
  userId?: string;
  deviceId?: string;
  groupId?: string;
  templateId?: string;
  planId?: string;
}

const SCOPE_PRIORITY: ResolvedConfig["source"][] = [
  "device", "group", "template", "plan", "global",
];

export class ConfigResolver {

  async resolve(ctx: ConfigResolutionContext): Promise<ResolvedConfig[]> {
    const definitions = await db.select().from(configDefinitions);
    const categories = await db.select().from(configCategories);
    const catMap = new Map(categories.map((c) => [c.id, c]));

    // Resolve groupId from device membership
    let groupId = ctx.groupId;
    if (!groupId && ctx.deviceId) {
      const allGroups = await db.select().from(deviceGroups);
      const match = allGroups.find((g) =>
        (g.deviceIds as string[]).includes(ctx.deviceId!)
      );
      if (match) groupId = match.id;
    }

    // Resolve planId from active subscription
    let planId = ctx.planId;
    if (!planId && ctx.userId) {
      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.userId, ctx.userId),
            eq(subscriptions.status, "active"),
          )
        )
        .limit(1);
      if (sub) planId = sub.planId;
    }

    // Load all values for all definitions
    const defIds = definitions.map((d) => d.id);
    const allValues = await db
      .select()
      .from(configValues)
      .where(inArray(configValues.definitionId, defIds));

    // Filter values to only those matching our scopes
    const relevantScopeIds = new Map<string, Set<string | null>>();
    relevantScopeIds.set("global", new Set([null]));
    if (planId) relevantScopeIds.set("plan", new Set([planId]));
    if (ctx.templateId) relevantScopeIds.set("template", new Set([ctx.templateId]));
    if (groupId) relevantScopeIds.set("group", new Set([groupId]));
    if (ctx.deviceId) relevantScopeIds.set("device", new Set([ctx.deviceId]));

    const filteredValues = allValues.filter((v) => {
      const ids = relevantScopeIds.get(v.scope);
      if (!ids) return false;
      return ids.has(v.scopeId ?? null);
    });

    // Build lookup: definitionId → Map<scope, valueEntry>
    const valueMap = new Map<string, Map<string, typeof filteredValues[0]>>();
    for (const v of filteredValues) {
      if (!valueMap.has(v.definitionId)) {
        valueMap.set(v.definitionId, new Map());
      }
      valueMap.get(v.definitionId)!.set(v.scope, v);
    }

    // Resolve each definition
    const resolved: ResolvedConfig[] = [];
    for (const def of definitions) {
      const scopeMap = valueMap.get(def.id);
      let bestValue: string | null = null;
      let bestSource: ResolvedConfig["source"] = "default";
      let bestSourceId: string | undefined;

      if (scopeMap) {
        for (const scope of SCOPE_PRIORITY) {
          const entry = scopeMap.get(scope);
          if (entry && entry.value != null) {
            bestValue = entry.value;
            bestSource = scope as ResolvedConfig["source"];
            bestSourceId = entry.scopeId ?? undefined;
            break;
          }
        }
      }

      const cat = catMap.get(def.categoryId);
      resolved.push({
        key: def.key,
        displayName: def.displayName,
        value: bestValue ?? def.defaultValue ?? "",
        valueType: def.valueType,
        source: bestSource,
        sourceId: bestSourceId,
        isSecret: def.isSecret,
        categoryKey: cat?.key ?? "",
        categoryDisplayName: cat?.displayName ?? "",
      });
    }

    return resolved;
  }

  async resolveKey(
    ctx: ConfigResolutionContext,
    key: string,
  ): Promise<ResolvedConfig | null> {
    const all = await this.resolve(ctx);
    return all.find((r) => r.key === key) ?? null;
  }

  async applyTemplate(
    templateId: string,
    targetScope: "device" | "group",
    targetScopeId: string,
    updatedBy?: string,
  ): Promise<{ applied: number }> {
    const [template] = await db
      .select()
      .from(configTemplates)
      .where(eq(configTemplates.id, templateId))
      .limit(1);

    if (!template) throw new Error("Template not found");

    const templateValues = template.values as Record<string, string>;
    const entries = Object.entries(templateValues);
    if (entries.length === 0) return { applied: 0 };

    const keys = entries.map(([k]) => k);
    const defs = await db
      .select()
      .from(configDefinitions)
      .where(inArray(configDefinitions.key, keys));
    const defMap = new Map(defs.map((d) => [d.key, d.id]));

    let applied = 0;
    for (const [key, value] of entries) {
      const defId = defMap.get(key);
      if (!defId) continue;

      await db
        .delete(configValues)
        .where(
          and(
            eq(configValues.definitionId, defId),
            eq(configValues.scope, targetScope),
            eq(configValues.scopeId, targetScopeId),
          )
        );

      await db.insert(configValues).values({
        definitionId: defId,
        scope: targetScope,
        scopeId: targetScopeId,
        value,
        version: 1,
        updatedBy: updatedBy ?? null,
      });
      applied++;
    }

    return { applied };
  }
}
