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
import { eq, and, inArray, sql } from "drizzle-orm";

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

/** Cache entry with expiration timestamp. */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class ConfigResolver {
  private cache = new Map<string, CacheEntry<ResolvedConfig[]>>();
  private cacheTtlMs = 30_000; // 30 seconds

  private cacheKey(ctx: ConfigResolutionContext): string {
    return `${ctx.deviceId ?? ""}|${ctx.groupId ?? ""}|${ctx.templateId ?? ""}|${ctx.userId ?? ""}`;
  }

  async resolve(ctx: ConfigResolutionContext): Promise<ResolvedConfig[]> {
    const key = this.cacheKey(ctx);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const result = await this.resolveUncached(ctx);
    this.cache.set(key, { data: result, expiresAt: Date.now() + this.cacheTtlMs });
    return result;
  }

  private async resolveUncached(ctx: ConfigResolutionContext): Promise<ResolvedConfig[]> {
    const definitions = await db.select().from(configDefinitions);
    const categories = await db.select().from(configCategories);
    const catMap = new Map(categories.map((c) => [c.id, c]));

    // Resolve groupId from device membership (uses JSONB containment for efficiency)
    let groupId = ctx.groupId;
    if (!groupId && ctx.deviceId) {
      const match = await db
        .select({ id: deviceGroups.id })
        .from(deviceGroups)
        .where(sql`${deviceGroups.deviceIds} @> ${JSON.stringify([ctx.deviceId])}::jsonb`)
        .limit(1);
      if (match.length > 0) groupId = match[0].id;
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

  /** Resolve a single key — queries DB directly instead of full scan. */
  async resolveKey(
    ctx: ConfigResolutionContext,
    key: string,
  ): Promise<ResolvedConfig | null> {
    // Query the specific definition directly
    const [def] = await db
      .select()
      .from(configDefinitions)
      .where(eq(configDefinitions.key, key))
      .limit(1);
    if (!def) return null;

    const [cat] = await db
      .select()
      .from(configCategories)
      .where(eq(configCategories.id, def.categoryId))
      .limit(1);

    // Resolve groupId from device membership
    let groupId = ctx.groupId;
    if (!groupId && ctx.deviceId) {
      const match = await db
        .select({ id: deviceGroups.id })
        .from(deviceGroups)
        .where(sql`${deviceGroups.deviceIds} @> ${JSON.stringify([ctx.deviceId])}::jsonb`)
        .limit(1);
      if (match.length > 0) groupId = match[0].id;
    }

    // Resolve planId
    let planId = ctx.planId;
    if (!planId && ctx.userId) {
      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.userId, ctx.userId), eq(subscriptions.status, "active")))
        .limit(1);
      if (sub) planId = sub.planId;
    }

    // Build scope filter conditions for this definition
    const scopeConditions: any[] = [];
    scopeConditions.push(and(eq(configValues.scope, "global"), eq(configValues.scopeId, "")));
    if (planId) scopeConditions.push(and(eq(configValues.scope, "plan"), eq(configValues.scopeId, planId!)));
    if (ctx.templateId) scopeConditions.push(and(eq(configValues.scope, "template"), eq(configValues.scopeId, ctx.templateId!)));
    if (groupId) scopeConditions.push(and(eq(configValues.scope, "group"), eq(configValues.scopeId, groupId!)));
    if (ctx.deviceId) scopeConditions.push(and(eq(configValues.scope, "device"), eq(configValues.scopeId, ctx.deviceId!)));

    // Fetch only values for this specific definition
    const values = await db
      .select()
      .from(configValues)
      .where(eq(configValues.definitionId, def.id));

    // Resolve by scope priority
    type Scope = ResolvedConfig["source"];
    for (const scope of ["device", "group", "template", "plan", "global"] as Scope[]) {
      const entry = values.find((v) => {
        if (v.scope !== scope) return false;
        if (scope === "global") return true;
        const expectedId = scope === "plan" ? planId : scope === "group" ? groupId : scope === "template" ? ctx.templateId : ctx.deviceId;
        return v.scopeId === expectedId;
      });
      if (entry && entry.value != null) {
        return {
          key: def.key,
          displayName: def.displayName,
          value: entry.value,
          valueType: def.valueType,
          source: scope,
          sourceId: entry.scopeId ?? undefined,
          isSecret: def.isSecret,
          categoryKey: cat?.key ?? "",
          categoryDisplayName: cat?.displayName ?? "",
        };
      }
    }

    return {
      key: def.key,
      displayName: def.displayName,
      value: def.defaultValue ?? "",
      valueType: def.valueType,
      source: "default",
      isSecret: def.isSecret,
      categoryKey: cat?.key ?? "",
      categoryDisplayName: cat?.displayName ?? "",
    };
  }

  /** Invalidate cache — call after config writes. */
  invalidateCache(): void {
    this.cache.clear();
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

    this.invalidateCache();
    return { applied };
  }
}
