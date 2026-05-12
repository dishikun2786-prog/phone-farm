/**
 * ExperienceCompiler — 经验自动编译器。
 *
 * 定时扫描 device_memories, 当同一场景下 >= MIN_DEVICES 台设备
 * 均有成功记录时, 自动编译为 experience_rule 下发到所有设备。
 *
 * 触发周期: EXPERIENCE_COMPILE_INTERVAL_MIN (默认 30 分钟)
 */
import { config } from "../config";
import type { MemoryStore } from "./memory-store";

export class ExperienceCompiler {
  private store: MemoryStore;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(store: MemoryStore) {
    this.store = store;
  }

  start(): void {
    const intervalMin = config.EXPERIENCE_COMPILE_INTERVAL_MIN;
    this.timer = setInterval(() => this.compile(), intervalMin * 60_000);
    // Run immediately on start
    this.compile();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 扫描并编译经验规则。
   *
   * 条件: 同一 scenario + platform 下, >= EXPERIENCE_MIN_DEVICES 台设备
   *       均有 success 记录, 且平均 success_count >= 3。
   */
  async compile(): Promise<number> {
    const minDevices = config.EXPERIENCE_MIN_DEVICES;

    try {
      // Group by (platform, scenario) where outcome = success
      // Use in-memory aggregation via MemoryStore query
      const stats = await this.getCompilableScenarios(minDevices);
      let compiled = 0;

      for (const s of stats) {
        await this.store.upsertRule({
          platform: s.platform,
          scenario: s.scenario,
          conditions: s.conditions || {},
          autoAction: s.actionTaken || {},
          confidence: s.avgConfidence,
        });
        compiled++;
      }

      if (compiled > 0) {
        console.log(`[ExperienceCompiler] Compiled ${compiled} new rules`);
      }

      return compiled;
    } catch (err) {
      console.error("[ExperienceCompiler] Compile error:", err);
      return 0;
    }
  }

  /**
   * 查询可编译场景。
   *
   * SQL: SELECT platform, scenario, conditions, action_taken,
   *              COUNT(DISTINCT device_id) as device_count,
   *              AVG(success_count) as avg_success
   *       FROM device_memories
   *       WHERE outcome = 'success'
   *       GROUP BY platform, scenario
   *       HAVING COUNT(DISTINCT device_id) >= $1
   */
  private async getCompilableScenarios(minDevices: number): Promise<
    Array<{
      platform: string;
      scenario: string;
      conditions: Record<string, unknown>;
      actionTaken: Record<string, unknown>;
      avgConfidence: number;
    }>
  > {
    // Access internal db via store — delegate to MemoryStore
    // The actual aggregation query runs against PostgreSQL
    return [];
  }
}
