/**
 * MemoryRetriever — 三级检索系统。
 *
 * Level 1: 精确签名匹配 (device_memories, state_signature = hash)
 * Level 2: 语义向量检索 (pgvector cosine similarity, top-5)
 * Level 3: 经验规则 (experience_rules, 高置信度规则直接返回动作)
 *
 * 返回 MemoryContext 供 DecisionRouter 和 PromptBuilder 使用。
 */
import type { MemoryStore, MemoryRecord, ExperienceRule } from "./memory-store";

export interface MemoryContext {
  memories: Array<{
    scenario: string;
    action_taken: Record<string, unknown>;
    outcome: string;
    success_count: number;
  }>;
  rules: Array<{
    scenario: string;
    auto_action: Record<string, unknown>;
    confidence: number;
  }>;
  exactRule: {
    scenario: string;
    auto_action: Record<string, unknown>;
    confidence: number;
  } | null;
}

export class MemoryRetriever {
  private store: MemoryStore;

  constructor(store: MemoryStore) {
    this.store = store;
  }

  /**
   * 三级检索入口。
   */
  async retrieve(params: {
    platform: string;
    pageType: string;
    anomalyFlags: string[];
    textSignature: string;
  }): Promise<MemoryContext> {
    const { platform, pageType, anomalyFlags, textSignature } = params;

    // Level 1: Exact signature match
    const exact = await this.store.findBySignature(textSignature, platform);
    if (exact && exact.successCount >= 3 && exact.outcome === "success") {
      // High-confidence exact match -> act as rule
      return {
        memories: [simplifyMemory(exact)],
        rules: [],
        exactRule: {
          scenario: exact.scenario,
          auto_action: exact.actionTaken,
          confidence: Math.min(0.99, exact.successCount / (exact.successCount + exact.failCount + 1)),
        },
      };
    }

    // Level 2: Semantic vector search
    const queryText = buildQueryText(platform, pageType, anomalyFlags, textSignature);
    const semantic = await this.store.semanticSearch(queryText, platform, 5);

    // Level 3: Experience rules
    const rules = await this.store.getRules(platform);

    return {
      memories: semantic.map(simplifyMemory),
      rules: rules.map(r => ({
        scenario: r.scenario,
        auto_action: r.autoAction,
        confidence: r.confidence,
      })),
      exactRule: null,
    };
  }
}

function simplifyMemory(m: MemoryRecord) {
  return {
    scenario: m.scenario,
    action_taken: m.actionTaken,
    outcome: m.outcome,
    success_count: m.successCount,
  };
}

function buildQueryText(
  platform: string,
  pageType: string,
  anomalyFlags: string[],
  textSignature: string,
): string {
  const parts = [platform, pageType];
  if (anomalyFlags.length > 0) parts.push(anomalyFlags.join(" "));
  parts.push(textSignature);
  return parts.join(" | ");
}
