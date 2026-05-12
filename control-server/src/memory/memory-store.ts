/**
 * MemoryStore — pgvector 持久化存储。
 *
 * 存储设备记忆 (device_memories) 和经验规则 (experience_rules)。
 * 使用 pgvector 扩展的 vector(1024) 类型存储 BGE-M3 嵌入向量。
 *
 * 依赖: PostgreSQL + pgvector extension
 */
import { randomUUID } from "crypto";
import type { DecisionInput } from "../decision/types";

// ── Types ──

export interface MemoryRecord {
  id: string;
  deviceId: string;
  platform: string;
  pageType: string;
  scenario: string;
  stateSignature: string;
  observation: string;
  actionTaken: Record<string, unknown>;
  outcome: string;
  errorReason?: string;
  embedding?: number[];
  successCount: number;
  failCount: number;
  lastSeenAt: Date;
}

export interface ExperienceRule {
  id: string;
  platform: string;
  scenario: string;
  conditions: Record<string, unknown>;
  autoAction: Record<string, unknown>;
  confidence: number;
  verifiedByDevices: number;
  totalSuccesses: number;
  totalTrials: number;
  enabled: boolean;
  lastVerifiedAt: Date;
}

// ── DB Interface ──

interface PgPool {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export class MemoryStore {
  private db: PgPool;
  private embeddingFn: ((text: string) => Promise<number[]>) | null = null;

  constructor(db: PgPool, embeddingFn?: (text: string) => Promise<number[]>) {
    this.db = db;
    this.embeddingFn = embeddingFn ?? null;
  }

  /**
   * 存储一条设备记忆 (upsert by device_id + state_signature).
   */
  async upsertMemory(record: {
    deviceId: string;
    platform: string;
    pageType: string;
    scenario: string;
    stateSignature: string;
    observation: string;
    actionTaken: Record<string, unknown>;
    outcome: string;
    errorReason?: string;
  }): Promise<void> {
    const embedding = await this.computeEmbedding(record.observation);

    await this.db.query(
      `INSERT INTO device_memories
         (device_id, platform, page_type, scenario, state_signature,
          observation, action_taken, outcome, error_reason, embedding,
          success_count, fail_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (device_id, state_signature)
       DO UPDATE SET
         observation = EXCLUDED.observation,
         action_taken = EXCLUDED.action_taken,
         outcome = EXCLUDED.outcome,
         embedding = EXCLUDED.embedding,
         success_count = device_memories.success_count + EXCLUDED.success_count,
         fail_count = device_memories.fail_count + EXCLUDED.fail_count,
         last_seen_at = NOW()`,
      [
        record.deviceId,
        record.platform,
        record.pageType,
        record.scenario,
        record.stateSignature,
        record.observation,
        JSON.stringify(record.actionTaken),
        record.outcome,
        record.errorReason || null,
        embedding ? `[${embedding.join(",")}]` : null,
        record.outcome === "success" ? 1 : 0,
        record.outcome === "fail" ? 1 : 0,
      ]
    );
  }

  /**
   * 精确签名匹配 — 同设备同场景命中。
   */
  async findBySignature(
    stateSignature: string,
    platform: string
  ): Promise<MemoryRecord | null> {
    const { rows } = await this.db.query(
      `SELECT * FROM device_memories
       WHERE state_signature = $1 AND platform = $2
       ORDER BY last_seen_at DESC LIMIT 1`,
      [stateSignature, platform]
    );
    if (rows.length === 0) return null;
    return mapMemoryRecord(rows[0]);
  }

  /**
   * 语义向量检索 — 跨设备相似场景。
   */
  async semanticSearch(
    queryText: string,
    platform: string,
    limit = 5
  ): Promise<MemoryRecord[]> {
    const embedding = await this.computeEmbedding(queryText);
    if (!embedding) return [];

    const { rows } = await this.db.query(
      `SELECT * FROM device_memories
       WHERE platform = $1 AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector
       LIMIT $3`,
      [platform, `[${embedding.join(",")}]`, limit]
    );

    return rows.map(mapMemoryRecord);
  }

  /**
   * 获取平台所有经验规则。
   */
  async getRules(platform: string, enabledOnly = true): Promise<ExperienceRule[]> {
    let query = `SELECT * FROM experience_rules WHERE platform = $1`;
    if (enabledOnly) query += ` AND enabled = true`;
    query += ` ORDER BY confidence DESC`;

    const { rows } = await this.db.query(query, [platform]);
    return rows.map(mapRule);
  }

  /**
   * 插入或更新经验规则。
   */
  async upsertRule(rule: {
    platform: string;
    scenario: string;
    conditions: Record<string, unknown>;
    autoAction: Record<string, unknown>;
    confidence: number;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO experience_rules
         (platform, scenario, conditions, auto_action, confidence, verified_by_devices, total_successes, total_trials)
       VALUES ($1,$2,$3,$4,$5,1,1,1)
       ON CONFLICT (id) DO NOTHING`,
      [
        rule.platform,
        rule.scenario,
        JSON.stringify(rule.conditions),
        JSON.stringify(rule.autoAction),
        rule.confidence,
      ]
    );
  }

  /**
   * 获取记忆统计。
   */
  async getStats(): Promise<{
    totalMemories: number;
    totalRules: number;
    compiledToday: number;
  }> {
    const [memRes, ruleRes, todayRes] = await Promise.all([
      this.db.query(`SELECT COUNT(*) as c FROM device_memories`),
      this.db.query(`SELECT COUNT(*) as c FROM experience_rules`),
      this.db.query(
        `SELECT COUNT(*) as c FROM experience_rules WHERE created_at::date = CURRENT_DATE`
      ),
    ]);

    return {
      totalMemories: Number(memRes.rows[0]?.c ?? 0),
      totalRules: Number(ruleRes.rows[0]?.c ?? 0),
      compiledToday: Number(todayRes.rows[0]?.c ?? 0),
    };
  }

  // ── Private ──

  private async computeEmbedding(text: string): Promise<number[] | null> {
    if (!this.embeddingFn) return null;
    try {
      return await this.embeddingFn(text);
    } catch {
      return null;
    }
  }
}

function mapMemoryRecord(row: Record<string, unknown>): MemoryRecord {
  return {
    id: row.id as string,
    deviceId: row.device_id as string,
    platform: row.platform as string,
    pageType: row.page_type as string,
    scenario: row.scenario as string,
    stateSignature: row.state_signature as string,
    observation: row.observation as string,
    actionTaken: typeof row.action_taken === "string" ? JSON.parse(row.action_taken as string) : (row.action_taken as Record<string, unknown> ?? {}),
    outcome: row.outcome as string,
    errorReason: row.error_reason as string | undefined,
    embedding: row.embedding as number[] | undefined,
    successCount: Number(row.success_count ?? 0),
    failCount: Number(row.fail_count ?? 0),
    lastSeenAt: new Date(row.last_seen_at as string),
  };
}

function mapRule(row: Record<string, unknown>): ExperienceRule {
  return {
    id: row.id as string,
    platform: row.platform as string,
    scenario: row.scenario as string,
    conditions: typeof row.conditions === "string" ? JSON.parse(row.conditions as string) : (row.conditions as Record<string, unknown> ?? {}),
    autoAction: typeof row.auto_action === "string" ? JSON.parse(row.auto_action as string) : (row.auto_action as Record<string, unknown> ?? {}),
    confidence: Number(row.confidence ?? 0),
    verifiedByDevices: Number(row.verified_by_devices ?? 0),
    totalSuccesses: Number(row.total_successes ?? 0),
    totalTrials: Number(row.total_trials ?? 0),
    enabled: Boolean(row.enabled),
    lastVerifiedAt: new Date(row.last_verified_at as string),
  };
}
