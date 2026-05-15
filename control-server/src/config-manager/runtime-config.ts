/**
 * RuntimeConfig — unified configuration bridge between env vars (config.ts)
 * and DB-backed config-manager.
 *
 * Resolution order: DB override > env value > definition defaultValue
 * Changes via set() are persisted to DB, audited, and broadcast to subscribers.
 * invalidate() hot-reloads all values from DB without server restart.
 */
import { db } from "../db.js";
import { configValues, configDefinitions, configChangeLog, configCategories } from "./config-schema.js";
import { CATEGORIES, DEFINITIONS } from "./config-definitions.js";
import { eq, and, desc, inArray } from "drizzle-orm";
import type { config as ConfigType } from "../config.js";

type ConfigShape = typeof ConfigType;

export interface ConfigEntry {
  key: string;
  value: string;
  source: "env" | "db" | "default";
  valueType: string;
  displayName: string;
  description: string;
  categoryKey: string;
  categoryDisplayName: string;
  isSecret: boolean;
}

type ChangeCallback = (newValue: string) => void;

export class RuntimeConfig {
  private envValues: Record<string, string>;
  private dbOverrides: Map<string, string> = new Map();
  private subscribers: Map<string, Set<ChangeCallback>> = new Map();
  private initialized = false;

  constructor(envConfig: ConfigShape) {
    this.envValues = {};
    for (const [key, val] of Object.entries(envConfig)) {
      this.envValues[key] = String(val);
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const allDbValues = await db
      .select({
        key: configDefinitions.key,
        value: configValues.value,
      })
      .from(configValues)
      .innerJoin(configDefinitions, eq(configValues.definitionId, configDefinitions.id))
      .where(eq(configValues.scope, "global"));

    for (const row of allDbValues) {
      this.dbOverrides.set(row.key, row.value);
    }

    this.initialized = true;
  }

  get ready(): boolean {
    return this.initialized;
  }

  /** Get effective config value: DB override > env > default */
  get(key: string, defaultValue?: string): string {
    // Check DB overrides first
    const dbVal = this.dbOverrides.get(key);
    if (dbVal !== undefined) return dbVal;

    // Check env values using full key in SCREAMING_SNAKE_CASE
    const envKey = key.replace(/\./g, "_").toUpperCase();
    const envVal = this.envValues[envKey];
    if (envVal !== undefined && envVal !== "") return envVal;

    // Fallback: strip category prefix (first dot-segment) and try again
    // e.g. "ai.deepseek.api_key" → "DEEPSEEK_API_KEY" (matches config.ts naming)
    const dotIdx = key.indexOf(".");
    if (dotIdx > 0) {
      const shortKey = key.substring(dotIdx + 1).replace(/\./g, "_").toUpperCase();
      const shortVal = this.envValues[shortKey];
      if (shortVal !== undefined && shortVal !== "") return shortVal;
    }

    // Check lowercase env key as fallback
    if (envKey !== key) {
      const envVal2 = this.envValues[key];
      if (envVal2 !== undefined && envVal2 !== "") return envVal2;
    }

    // Return provided default or lookup from definitions
    if (defaultValue !== undefined) return defaultValue;

    const def = DEFINITIONS.find((d) => d.key === key);
    if (def) return def.defaultValue;

    return "";
  }

  getNumber(key: string, defaultValue?: number): number {
    const val = this.get(key, defaultValue?.toString());
    const n = Number(val);
    return isNaN(n) ? (defaultValue ?? 0) : n;
  }

  getBoolean(key: string, defaultValue?: boolean): boolean {
    const val = this.get(key, defaultValue?.toString());
    return val === "true" || val === "1";
  }

  /** Set a config value (writes to DB global scope, triggers subscribers) */
  async set(
    key: string,
    value: string,
    options?: { changeReason?: string; userId?: string; ipAddress?: string },
  ): Promise<void> {
    // Find or create definition
    let [def] = await db
      .select()
      .from(configDefinitions)
      .where(eq(configDefinitions.key, key))
      .limit(1);

    if (!def) {
      // Auto-create definition from seeds
      const seed = DEFINITIONS.find((d) => d.key === key);
      if (!seed) throw new Error(`Unknown config key: ${key}`);

      const cats = await db.select().from(configCategories);
      const catMap = new Map(cats.map((c) => [c.key, c.id]));
      let catId = catMap.get(seed.categoryKey);

      if (!catId) {
        const catSeed = CATEGORIES.find((c) => c.key === seed.categoryKey);
        if (catSeed) {
          const [newCat] = await db
            .insert(configCategories)
            .values(catSeed as any)
            .returning();
          catId = newCat!.id;
        }
      }

      if (!catId) throw new Error(`Category not found for key: ${key}`);

      const [newDef] = await db
        .insert(configDefinitions)
        .values({
          categoryId: catId,
          key: seed.key,
          displayName: seed.displayName,
          description: seed.description,
          valueType: seed.valueType,
          defaultValue: seed.defaultValue,
          enumOptions: seed.enumOptions ?? null,
          validationRule: seed.validationRule ?? null,
          isSecret: seed.isSecret,
          isOverridable: seed.isOverridable,
          allowedScopes: seed.allowedScopes,
          tags: seed.tags,
          sortOrder: seed.sortOrder,
        } as any)
        .returning();
      def = newDef!;
    }

    // Get old value for audit
    const [existing] = await db
      .select()
      .from(configValues)
      .where(
        and(
          eq(configValues.definitionId, def.id),
          eq(configValues.scope, "global"),
        ),
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
          updatedBy: options?.userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(configValues.id, existing.id));
    } else {
      await db.insert(configValues).values({
        definitionId: def.id,
        scope: "global",
        scopeId: null,
        value,
        version: 1,
        updatedBy: options?.userId ?? null,
      });
    }

    // Audit log
    await db.insert(configChangeLog).values({
      definitionId: def.id,
      configKey: key,
      scope: "global",
      scopeId: null,
      oldValue,
      newValue: value,
      changedBy: options?.userId ?? null,
      ipAddress: options?.ipAddress ?? null,
      changeReason: options?.changeReason ?? null,
    });

    // Update memory cache
    this.dbOverrides.set(key, value);

    // Notify subscribers
    const subs = this.subscribers.get(key);
    if (subs) {
      for (const cb of subs) {
        try { cb(value); } catch { /* swallow subscriber errors */ }
      }
    }
  }

  /** Subscribe to config changes. Returns unsubscribe function. */
  on(key: string, callback: ChangeCallback): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(callback);
    return () => {
      this.subscribers.get(key)?.delete(callback);
    };
  }

  /** Hot-reload: re-read all DB overrides */
  async invalidate(): Promise<void> {
    this.dbOverrides.clear();

    const allDbValues = await db
      .select({
        key: configDefinitions.key,
        value: configValues.value,
      })
      .from(configValues)
      .innerJoin(configDefinitions, eq(configValues.definitionId, configDefinitions.id))
      .where(eq(configValues.scope, "global"));

    for (const row of allDbValues) {
      this.dbOverrides.set(row.key, row.value);
    }

    // Notify all subscribers of potentially changed values
    for (const [key, subs] of this.subscribers) {
      const newVal = this.get(key);
      for (const cb of subs) {
        try { cb(newVal); } catch { /* swallow */ }
      }
    }
  }

  /** Get a full merged configuration snapshot with source annotations */
  async getAll(): Promise<ConfigEntry[]> {
    const categories = await db.select().from(configCategories);
    const catMap = new Map(categories.map((c) => [c.key, c.displayName]));

    // Also include categories from seeds that may not be in DB yet
    for (const cat of CATEGORIES) {
      if (!catMap.has(cat.key)) catMap.set(cat.key, cat.displayName);
    }

    const entries: ConfigEntry[] = [];

    for (const def of DEFINITIONS) {
      const dbVal = this.dbOverrides.get(def.key);
      const envKey = def.key.replace(/\./g, "_").toUpperCase();
      const envVal = this.envValues[envKey];

      let value: string;
      let source: "env" | "db" | "default";

      if (dbVal !== undefined) {
        value = dbVal;
        source = "db";
      } else if (envVal !== undefined && envVal !== "") {
        value = envVal;
        source = "env";
      } else {
        value = def.defaultValue;
        source = "default";
      }

      entries.push({
        key: def.key,
        value: def.isSecret ? "********" : value,
        source,
        valueType: def.valueType,
        displayName: def.displayName,
        description: def.description,
        categoryKey: def.categoryKey,
        categoryDisplayName: catMap.get(def.categoryKey) ?? def.categoryKey,
        isSecret: def.isSecret,
      });
    }

    return entries;
  }

  /** Get all feature flags with their effective boolean values */
  async getFeatureFlags(): Promise<Record<string, { enabled: boolean; source: string; displayName: string; categoryKey: string }>> {
    const flags: Record<string, { enabled: boolean; source: string; displayName: string; categoryKey: string }> = {};

    for (const def of DEFINITIONS) {
      if (def.valueType !== "boolean") continue;
      if (!def.key.startsWith("ff.") && def.categoryKey !== "feature_flags") continue;

      const dbVal = this.dbOverrides.get(def.key);
      const envKey = def.key.replace(/\./g, "_").toUpperCase();
      const envVal = this.envValues[envKey];

      let value: string;
      let source: string;

      if (dbVal !== undefined) {
        value = dbVal;
        source = "db";
      } else if (envVal !== undefined && envVal !== "") {
        value = envVal;
        source = "env";
      } else {
        value = def.defaultValue;
        source = "default";
      }

      flags[def.key] = {
        enabled: value === "true" || value === "1",
        source,
        displayName: def.displayName,
        categoryKey: def.categoryKey,
      };
    }

    return flags;
  }
}

// Singleton
export let runtimeConfig: RuntimeConfig;

export function initRuntimeConfig(envConfig: ConfigShape): RuntimeConfig {
  runtimeConfig = new RuntimeConfig(envConfig);
  return runtimeConfig;
}
