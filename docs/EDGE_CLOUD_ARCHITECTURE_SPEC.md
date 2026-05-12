# PhoneFarm 边缘-云端协同架构 — 工程实现规格书

> **文档版本**: v1.1  
> **最后更新**: 2026-05-12  
> **状态**: 待评审  
> **核心变更**: 双模型决策层 — DeepSeek V4 Flash (文本决策) + Qwen3-VL-Flash (图像识别, 阿里云百炼)

---

## 目录

1. [架构总览](#1-架构总览)
2. [模块 A: 双模型决策引擎 (Control Server)](#2-模块-a-双模型决策引擎-control-server)
3. [模块 B: 边缘 CV 管线 (Android)](#3-模块-b-边缘-cv-管线-android)
4. [模块 C: 按需音视频流](#4-模块-c-按需音视频流)
5. [模块 D: 跨设备记忆系统](#5-模块-d-跨设备记忆系统)
6. [模块 E: 通信协议 & 数据契约](#6-模块-e-通信协议--数据契约)
7. [迁移计划 & 回滚策略](#7-迁移计划--回滚策略)
8. [测试策略](#8-测试策略)
9. [性能预算](#9-性能预算)
10. [附录: 完整文件变更清单](#10-附录-完整文件变更清单)

---

## 1. 架构总览

### 1.1 核心原则

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   边缘层 (PhoneFarm APK)                云端层 (Control Server)       │
│   ════════════════════════             ═══════════════════════════    │
│                                                                      │
│   感知 (Perceive)    ──State──→        决策 (Dual-Model Decide)       │
│   · OpenCV 变化检测                     ┌──────────────────────────┐ │
│   · ML Kit OCR 提取                     │ 路由网关 (DecisionRouter) │ │
│   · YOLO-nano 元素检测                  │   ~90% 文本场景           │ │
│   · A11yService UI 树                   │   → DeepSeek V4 Flash    │ │
│                                         │   ~10% 图像场景           │ │
│   执行 (Execute)     ←──Decision──      │   → Qwen3-VL-Flash       │ │
│   · 手势/输入注入                       │   (阿里云百炼)            │ │
│   · 本地快速反应                        └──────────────────────────┘ │
│   · 异常自动恢复                                                      │
│                                        记忆 (Remember)                │
│   推流 (Stream)       ──H.264→          · pgvector 语义检索           │
│   · 默认关闭                            · 经验自动编译                │
│   · MediaCodec 硬编码                   · 策略 A/B 优化               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**硬性约束**:
- APK **不运行**大模型推理 (移除 llama.cpp JNI)
- 默认**不推送**音视频流 (带宽优先)
- 状态上报优先于截图上报 (~90% 步骤不需要发截图)
- 文本决策用 DeepSeek V4 Flash (便宜), 疑难图像场景自动切 Qwen3-VL-Flash

### 1.2 双模型决策架构 (核心亮点)

```
设备上报 EdgeState (2-5KB Protobuf)
              │
              ▼
     ┌───────────────────┐
     │   DecisionRouter  │  ← 智能路由网关
     │   (路由决策引擎)    │
     └───────┬───────────┘
             │
     ┌───────┴──────────┐
     │ 路由条件评估       │
     │ · anomalyFlags?   │──有异常──→ Qwen3-VL-Flash (VLM, 看图)
     │ · confidence<0.7? │──低置信度─→ Qwen3-VL-Flash
     │ · pageType=?      │──未知页面─→ Qwen3-VL-Flash
     │ · 连续失败≥3?     │──卡死───→ Qwen3-VL-Flash
     │ · 以上皆否         │──正常───→ DeepSeek V4 Flash (文本)
     └───────┬──────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
DeepSeek V4 Flash   Qwen3-VL-Flash
(文本状态输入)       (文本状态 + 截图输入)
~90% 决策           ~10% 决策
$0.27/M tokens      ¥0.002/千张 (百炼)
<1s 延迟             <2s 延迟
```

### 1.3 模型对比

| 维度 | DeepSeek V4 Flash | Qwen3-VL-Flash (百炼) |
|------|-------------------|----------------------|
| 类型 | 纯文本 LLM | 多模态 VLM (文本+图像) |
| 输入 | 结构化状态文本 (~500 tokens) | 状态文本 + JPEG 截图 |
| 场景 | 常规操作决策 | 异常分析/未知页面/验证码 |
| API 端点 | `api.deepseek.com` | `dashscope.aliyuncs.com` |
| 接口兼容 | OpenAI 兼容 | OpenAI 兼容 |
| 模型名 | `deepseek-chat` | `qwen3-vl-flash` |
| 单价 | $0.27/M tokens | ¥0.002/千张图 |
| 延迟 | <1s | <2s |
| 占比 | ~90% | ~10% |

### 1.4 Qwen3-VL-Flash 自动切换触发条件

| 触发条件 | 说明 | 示例场景 |
|---------|------|---------|
| `anomalyFlags` 非空 | 检测到弹窗/验证码/白屏/限流 | 登录弹窗、图形验证码 |
| DeepSeek 返回 `confidence < 0.7` | 文本模型不确定 | 模糊的 UI 布局 |
| DeepSeek 返回 `needScreenshot: true` | 模型主动要求看图 | 复杂页面结构 |
| `pageType == UNKNOWN` | 无法识别页面类型 | 新版 APP 界面 |
| 连续 3 步相同动作且均失败 | 陷入死循环 | 反复点击无效区域 |
| 连续 3 步 confidence < 0.5 | 持续低置信度 | 页面剧烈变化 |

---

## 2. 模块 A: 双模型决策引擎 (Control Server)

### 2.1 模块结构

```
control-server/src/
├── decision/
│   ├── decision-router.ts       # ★ 路由网关 — 文本/视觉模型自动切换
│   ├── decision-engine.ts       # 决策主循环 (替代 VlmOrchestrator)
│   ├── deepseek-client.ts       # DeepSeek V4 Flash API 客户端
│   ├── qwen-vl-client.ts        # ★ Qwen3-VL-Flash API 客户端 (阿里云百炼)
│   ├── prompt-builder.ts        # 提示词构建 (文本模式 + 视觉模式)
│   ├── safety-guard.ts          # 安全护栏
│   ├── decision-routes.ts       # REST API + WebSocket 处理
│   └── types.ts                 # 类型定义
│
├── edge/
│   ├── state-ingestor.ts        # EdgeState Protobuf 解析 + 校验
│   └── state-store.ts           # Redis 缓存当前设备状态
│
├── orchestration/
│   ├── campaign-engine.ts       # 批量营销活动编排
│   └── device-coordinator.ts    # 多设备协同调度
│
├── memory/                       # 详见第 5 章
│   ├── memory-store.ts
│   ├── memory-retriever.ts
│   └── experience-compiler.ts
│
├── stream/
│   └── stream-manager.ts         # 详见第 4 章
│
└── config.ts                     # 新增双模型配置项
```

### 2.2 核心实现

#### 2.2.1 decision-router.ts — 智能路由网关

```typescript
/**
 * DecisionRouter — 双模型智能路由网关。
 *
 * 职责:
 *   1. 分析输入状态, 决定用文本模型 (DeepSeek) 还是视觉模型 (Qwen3-VL)
 *   2. 调用对应模型获取决策
 *   3. 路由决策记录 → 优化后续路由准确性
 *
 * 路由策略:
 *   文本路径 (DeepSeek V4 Flash):
 *     - 页面正常, 无异常标记
 *     - 页面类型明确
 *     - 前序步骤执行顺畅
 *     - 成本极低, 延迟极低
 *
 *   视觉路径 (Qwen3-VL-Flash):
 *     - 异常标记非空 (弹窗/验证码/白屏/限流)
 *     - DeepSeek 置信度低 (< 0.7)
 *     - 页面类型未知
 *     - 连续失败 ≥ 3 次
 *     - 需要识别图像内容 (验证码/图形/二维码)
 */
import { DeepSeekClient } from './deepseek-client';
import { QwenVLClient } from './qwen-vl-client';
import { PromptBuilder } from './prompt-builder';
import { SafetyGuard } from './safety-guard';
import { MemoryRetriever, type MemoryContext } from '../memory/memory-retriever';
import type { DecisionInput, DecisionOutput, DeviceAction } from './types';

/** 路由决策原因 */
type RouteReason =
  | 'normal'               // 正常 → DeepSeek
  | 'anomaly_detected'     // 异常 → Qwen3-VL
  | 'low_confidence'       // 低置信度 → Qwen3-VL
  | 'unknown_page'         // 未知页面 → Qwen3-VL
  | 'stuck_loop'           // 死循环 → Qwen3-VL
  | 'need_screenshot'      // 模型要求 → Qwen3-VL
  | 'force_text'           // 强制文本 (无截图可用时回退)
  ;

interface RouteDecision {
  model: 'deepseek' | 'qwen-vl';
  reason: RouteReason;
  includeScreenshot: boolean;
}

interface DecisionSession {
  deviceId: string;
  taskPrompt: string;
  maxSteps: number;
  platform: string;
  stepNumber: number;
  history: SessionStep[];
  consecutiveFailures: number;
  consecutiveLowConfidence: number;
  startedAt: number;
}

interface SessionStep {
  input: DecisionInput;
  decision: DecisionOutput;
  route: RouteDecision;
  timestamp: number;
  apiLatencyMs?: number;
}

export class DecisionRouter {
  private deepseek: DeepSeekClient;
  private qwenVL: QwenVLClient;
  private promptBuilder: PromptBuilder;
  private safetyGuard: SafetyGuard;
  private memoryRetriever: MemoryRetriever;

  /** 活跃会话 */
  private sessions = new Map<string, DecisionSession>();

  /** 路由统计 */
  private routeStats = {
    deepseekCount: 0,
    qwenVLCount: 0,
    switchReasons: new Map<RouteReason, number>(),
  };

  onDecision: ((deviceId: string, decision: DecisionOutput, route: RouteDecision) => void) | null = null;
  onComplete: ((deviceId: string, result: TaskResult) => void) | null = null;

  constructor(deps: {
    deepseek: DeepSeekClient;
    qwenVL: QwenVLClient;
    promptBuilder: PromptBuilder;
    safetyGuard: SafetyGuard;
    memoryRetriever: MemoryRetriever;
  }) {
    this.deepseek = deps.deepseek;
    this.qwenVL = deps.qwenVL;
    this.promptBuilder = deps.promptBuilder;
    this.safetyGuard = deps.safetyGuard;
    this.memoryRetriever = deps.memoryRetriever;
  }

  // ── 会话管理 ──

  startSession(deviceId: string, config: {
    taskPrompt: string;
    maxSteps?: number;
    platform?: string;
  }): void {
    this.sessions.set(deviceId, {
      deviceId,
      taskPrompt: config.taskPrompt,
      maxSteps: config.maxSteps || 50,
      platform: config.platform || 'unknown',
      stepNumber: 0,
      history: [],
      consecutiveFailures: 0,
      consecutiveLowConfidence: 0,
      startedAt: Date.now(),
    });
  }

  stopSession(deviceId: string, reason: string): void {
    const session = this.sessions.get(deviceId);
    if (!session) return;
    this.sessions.delete(deviceId);
    this.onComplete?.(deviceId, {
      deviceId,
      status: 'stopped',
      message: reason,
      totalSteps: session.stepNumber,
      durationMs: Date.now() - session.startedAt,
    });
  }

  // ── 核心: 智能路由 → 决策 ──

  /**
   * 处理设备上报的状态, 自动路由到最优模型。
   */
  async decide(input: DecisionInput): Promise<{ decision: DecisionOutput; route: RouteDecision }> {
    const session = this.sessions.get(input.deviceId);
    if (!session) throw new Error(`No active session for ${input.deviceId}`);

    // 1. 检查最大步数
    if (session.stepNumber >= session.maxSteps) {
      return this.terminate(input.deviceId, session, 'max_steps');
    }

    // 2. 检索跨设备记忆
    const memory = await this.memoryRetriever.retrieve({
      platform: session.platform,
      pageType: input.pageType,
      anomalyFlags: input.anomalyFlags,
      textSignature: input.textBlocks.map(b => b.text).join('|'),
    });

    // 3. 精确规则匹配 → 跳过 AI, 直接返回
    if (memory.exactRule && memory.exactRule.confidence >= 0.95) {
      const decision = this.buildRuleDecision(memory.exactRule);
      return { decision, route: { model: 'deepseek', reason: 'normal', includeScreenshot: false } };
    }

    // 4. ★ 路由决策: 文本模型 vs 视觉模型
    const route = this.determineRoute(input, session);

    // 5. 构建提示词 (文本或视觉)
    const messages = route.includeScreenshot
      ? this.promptBuilder.buildVision(input, memory, session)
      : this.promptBuilder.buildText(input, memory, session);

    // 6. 调用对应模型
    const t0 = Date.now();
    let rawResponse: RawDecision;

    if (route.model === 'deepseek') {
      rawResponse = await this.deepseek.decide(messages);
    } else {
      rawResponse = await this.qwenVL.decide(messages);
    }

    const apiLatencyMs = Date.now() - t0;

    // 7. 安全校验
    const screenSize = { screenWidth: input.screenshotWidth || 1080, screenHeight: input.screenshotHeight || 2400 };
    const action = this.safetyGuard.validate(rawResponse.action as DeviceAction, screenSize);

    // 8. 组装决策
    const decision: DecisionOutput = {
      decisionId: `${route.model}-${Date.now()}-${session.stepNumber}`,
      thinking: rawResponse.thinking,
      action,
      confidence: rawResponse.confidence,
      finished: rawResponse.finished,
      needScreenshot: rawResponse.needScreenshot || false,
      nextStepHint: rawResponse.nextStepHint,
      modelUsed: route.model,
    };

    // 9. 更新会话状态
    session.stepNumber++;
    session.history.push({ input, decision, route, timestamp: Date.now(), apiLatencyMs });
    this.updateSessionStats(session, decision);

    // 10. 更新路由统计
    this.routeStats[route.model === 'deepseek' ? 'deepseekCount' : 'qwenVLCount']++;
    const reasonCount = this.routeStats.switchReasons.get(route.reason) || 0;
    this.routeStats.switchReasons.set(route.reason, reasonCount + 1);

    // 11. 回调
    this.onDecision?.(input.deviceId, decision, route);

    // 12. 终止检查
    if (decision.finished) {
      this.sessions.delete(input.deviceId);
      this.onComplete?.(input.deviceId, {
        deviceId: input.deviceId,
        status: 'completed',
        message: decision.nextStepHint,
        totalSteps: session.stepNumber,
        durationMs: Date.now() - session.startedAt,
      });
    }

    return { decision, route };
  }

  /**
   * 路由决策核心 — 决定用哪个模型。
   *
   * 决策树:
   *   1. 异常标记非空           → qwen-vl (VLM 看图分析)
   *   2. 连续失败 ≥ 3            → qwen-vl (可能卡住了)
   *   3. 连续低置信度 ≥ 3        → qwen-vl (文本模型不够确定)
   *   4. 页面类型未知            → qwen-vl (需要视觉理解)
   *   5. 上一轮 DeepSeek 要求截图 → qwen-vl (模型主动请求)
   *   6. 无截图可用              → deepseek (回退文本)
   *   7. 其他                    → deepseek (默认文本)
   */
  private determineRoute(input: DecisionInput, session: DecisionSession): RouteDecision {
    const hasScreenshot = !!input.screenshotBase64;

    // 条件 1: 异常标记非空 → 必须用 VLM 看图
    if (input.anomalyFlags.length > 0) {
      if (!hasScreenshot) {
        // 无截图可用 → 回退文本, 但标记 needScreenshot
        return { model: 'deepseek', reason: 'anomaly_detected', includeScreenshot: false };
      }
      return { model: 'qwen-vl', reason: 'anomaly_detected', includeScreenshot: true };
    }

    // 条件 2: 连续失败 ≥ 3 次 → VLM 看图分析
    if (session.consecutiveFailures >= 3) {
      if (!hasScreenshot) {
        return { model: 'deepseek', reason: 'stuck_loop', includeScreenshot: false };
      }
      return { model: 'qwen-vl', reason: 'stuck_loop', includeScreenshot: true };
    }

    // 条件 3: 连续低置信度 ≥ 3 → VLM
    if (session.consecutiveLowConfidence >= 3) {
      if (!hasScreenshot) {
        return { model: 'deepseek', reason: 'low_confidence', includeScreenshot: false };
      }
      return { model: 'qwen-vl', reason: 'low_confidence', includeScreenshot: true };
    }

    // 条件 4: 页面类型未知 → VLM
    if (input.pageType === 'PAGE_UNKNOWN' || input.pageType === 'UNKNOWN') {
      if (!hasScreenshot) {
        return { model: 'deepseek', reason: 'unknown_page', includeScreenshot: false };
      }
      return { model: 'qwen-vl', reason: 'unknown_page', includeScreenshot: true };
    }

    // 条件 5: 上一轮要求截图 → VLM
    const lastStep = session.history[session.history.length - 1];
    if (lastStep?.decision?.needScreenshot && hasScreenshot) {
      return { model: 'qwen-vl', reason: 'need_screenshot', includeScreenshot: true };
    }

    // 条件 6: 无截图 → 强制文本
    if (!hasScreenshot) {
      return { model: 'deepseek', reason: 'force_text', includeScreenshot: false };
    }

    // 条件 7: 默认 → 文本 (DeepSeek)
    return { model: 'deepseek', reason: 'normal', includeScreenshot: false };
  }

  private updateSessionStats(session: DecisionSession, decision: DecisionOutput): void {
    if (decision.confidence < 0.7) {
      session.consecutiveLowConfidence++;
    } else {
      session.consecutiveLowConfidence = 0;
    }
  }

  /**
   * 外部更新失败计数 (设备回报 step_result: fail 时调用)。
   */
  recordStepFailure(deviceId: string): void {
    const session = this.sessions.get(deviceId);
    if (session) session.consecutiveFailures++;
  }

  recordStepSuccess(deviceId: string): void {
    const session = this.sessions.get(deviceId);
    if (session) session.consecutiveFailures = 0;
  }

  getRouteStats() {
    return {
      ...this.routeStats,
      switchReasons: Object.fromEntries(this.routeStats.switchReasons),
    };
  }

  private buildRuleDecision(rule: any): DecisionOutput {
    return {
      decisionId: `rule-${Date.now()}`,
      thinking: `自动规则匹配: ${rule.scenario}`,
      action: rule.auto_action as DeviceAction,
      confidence: rule.confidence,
      finished: false,
      needScreenshot: false,
      nextStepHint: `规则匹配: ${rule.scenario}`,
      modelUsed: 'rule',
    };
  }

  private terminate(deviceId: string, session: DecisionSession, reason: string) {
    const decision: DecisionOutput = {
      decisionId: `term-${Date.now()}`,
      thinking: `达到限制: ${reason}`,
      action: { type: 'terminate', message: reason },
      confidence: 1.0,
      finished: true,
      needScreenshot: false,
      nextStepHint: reason,
      modelUsed: 'none',
    };
    this.sessions.delete(deviceId);
    return { decision, route: { model: 'deepseek' as const, reason: 'normal' as const, includeScreenshot: false } };
  }
}
```

#### 2.2.2 qwen-vl-client.ts — 阿里云百炼 Qwen3-VL-Flash 客户端

```typescript
/**
 * Qwen3-VL-Flash 客户端 — 阿里云百炼 DashScope API (OpenAI 兼容)。
 *
 * API 端点: https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
 * 认证: Bearer Token (DASHSCOPE_API_KEY)
 * 模型: qwen3-vl-flash (最快) / qwen3-vl-plus (均衡) / qwen3-vl-max (最强)
 *
 * Qwen3-VL-Flash 特性:
 *   - 多模态: 支持文本 + 图像输入
 *   - 中文优化: UI 界面理解能力强
 *   - 性价比: ¥0.002/千张图, 适合批量自动化
 *
 * 调用方式: 与 DeepSeekClient 接口一致, 切换透明。
 */
import { config } from '../config';

export interface QwenVLConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export class QwenVLClient {
  private cfg: QwenVLConfig;
  private totalTokensUsed = 0;
  private totalImagesProcessed = 0;

  constructor(overrides?: Partial<QwenVLConfig>) {
    this.cfg = {
      apiKey: config.DASHSCOPE_API_KEY,
      apiUrl: config.DASHSCOPE_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      model: config.DASHSCOPE_VL_MODEL || 'qwen3-vl-flash',
      maxTokens: config.DASHSCOPE_VL_MAX_TOKENS || 1024,
      temperature: config.DASHSCOPE_VL_TEMPERATURE || 0.1,
      ...overrides,
    };
  }

  /**
   * 发送多模态决策请求 (文本 + 图像)。
   *
   * Qwen3-VL-Flash 的图片输入格式:
   *   1. Base64 data URL: "data:image/jpeg;base64,<base64>"
   *   2. 公网 URL: "https://example.com/image.jpg"
   *   这里使用 Base64 方式 (截图来自设备上报)。
   */
  async decide(messages: ChatMessage[]): Promise<RawDecision> {
    // 统计图片数
    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'image_url') {
            this.totalImagesProcessed++;
          }
        }
      }
    }

    const body = {
      model: this.cfg.model,
      messages,
      max_tokens: this.cfg.maxTokens,
      temperature: this.cfg.temperature,
      response_format: { type: 'json_object' as const },
    };

    const response = await this.fetchWithRetry(body);
    const content = response.choices?.[0]?.message?.content || '{}';

    if (response.usage) {
      this.totalTokensUsed += response.usage.total_tokens || 0;
    }

    return this.parseResponse(content);
  }

  private async fetchWithRetry(
    body: Record<string, unknown>,
    retries = 3
  ): Promise<DashScopeResponse> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(this.cfg.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.cfg.apiKey}`,
            // 百炼平台可选: 开启联网搜索 / 降低延迟
            'X-DashScope-OssResourceResolve': 'disable',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000), // VLM 推理稍慢, 15s 超时
        });

        if (!res.ok) {
          const errText = await res.text();
          if ((res.status === 429 || res.status === 503) && attempt < retries) {
            await this.sleep(2000 * Math.pow(2, attempt)); // VLM 限流退避更长
            continue;
          }
          throw new Error(`Qwen3-VL API ${res.status}: ${errText}`);
        }

        return await res.json() as DashScopeResponse;
      } catch (err) {
        if (attempt === retries) throw err;
        await this.sleep(2000 * Math.pow(2, attempt));
      }
    }
    throw new Error('Unreachable');
  }

  private parseResponse(content: string): RawDecision {
    let json = content.trim();
    if (json.startsWith('```')) {
      json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    try {
      return JSON.parse(json) as RawDecision;
    } catch {
      throw new Error(`Failed to parse Qwen3-VL response: ${content.slice(0, 200)}`);
    }
  }

  getStats() {
    return {
      totalTokensUsed: this.totalTokensUsed,
      totalImagesProcessed: this.totalImagesProcessed,
      estimatedCostYuan: this.totalImagesProcessed * 0.002, // 千张图单价
    };
  }

  private sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    { type: 'text'; text: string } |
    { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
  >;
}

interface DashScopeResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface RawDecision {
  thinking: string;
  action: Record<string, unknown>;
  confidence: number;
  finished: boolean;
  needScreenshot: boolean;
  nextStepHint: string;
}
```

#### 2.2.3 deepseek-client.ts — 精简 (与 QwenVLClient 接口统一)

```typescript
/**
 * DeepSeek V4 Flash 客户端 — 纯文本决策 (OpenAI 兼容)。
 *
 * 与 QwenVLClient 暴露相同接口: decide(messages) → RawDecision
 * 调用方 (DecisionRouter) 无需关心底层模型差异。
 */
import { config } from '../config';

export class DeepSeekClient {
  private apiKey: string;
  private apiUrl: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private totalTokensUsed = 0;

  constructor(overrides?: Partial<DeepSeekConfig>) {
    this.apiKey = overrides?.apiKey || config.DEEPSEEK_API_KEY;
    this.apiUrl = overrides?.apiUrl || config.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
    this.model = overrides?.model || config.DEEPSEEK_MODEL || 'deepseek-chat';
    this.maxTokens = overrides?.maxTokens || config.DEEPSEEK_MAX_TOKENS || 512;
    this.temperature = overrides?.temperature ?? config.DEEPSEEK_TEMPERATURE ?? 0.1;
  }

  async decide(messages: ChatMessage[]): Promise<RawDecision> {
    const body = {
      model: this.model,
      messages: messages.filter(m => {
        // 纯文本模型: 移除 image_url 内容 (防御性过滤)
        if (Array.isArray(m.content)) {
          m.content = m.content.filter(p => p.type !== 'image_url');
          if (m.content.length === 0) return false;
        }
        return true;
      }),
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      response_format: { type: 'json_object' as const },
    };

    const response = await this.fetchWithRetry(body);
    const content = response.choices?.[0]?.message?.content || '{}';

    if (response.usage) {
      this.totalTokensUsed += response.usage.total_tokens || 0;
    }

    return this.parseResponse(content);
  }

  private async fetchWithRetry(body: Record<string, unknown>, retries = 3): Promise<any> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          const errText = await res.text();
          if ((res.status === 429 || res.status === 503) && attempt < retries) {
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
            continue;
          }
          throw new Error(`DeepSeek API ${res.status}: ${errText}`);
        }

        return await res.json();
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
    throw new Error('Unreachable');
  }

  private parseResponse(content: string): RawDecision {
    let json = content.trim();
    if (json.startsWith('```')) {
      json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    try { return JSON.parse(json) as RawDecision; } catch {
      throw new Error(`Failed to parse DeepSeek response: ${content.slice(0, 200)}`);
    }
  }

  getTokenUsage(): number { return this.totalTokensUsed; }
}

// 共享类型
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    { type: 'text'; text: string } |
    { type: 'image_url'; image_url: { url: string; detail?: string } }
  >;
}

interface DeepSeekConfig {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface RawDecision {
  thinking: string;
  action: Record<string, unknown>;
  confidence: number;
  finished: boolean;
  needScreenshot: boolean;
  nextStepHint: string;
}
```

#### 2.2.4 prompt-builder.ts — 双模式提示词

```typescript
/**
 * 双模式提示词构建器。
 *
 * 文本模式 (DeepSeek V4 Flash):
 *   - 输入: 结构化状态描述 (纯文本)
 *   - Token: ~400-600 tokens
 *   - 适用: 常规操作决策
 *
 * 视觉模式 (Qwen3-VL-Flash):
 *   - 输入: 结构化状态 + JPEG 截图 (多模态)
 *   - Token: ~400 text + ~2000 image tokens
 *   - 适用: 异常分析/未知页面/验证码
 */
import type { DecisionInput } from './types';
import type { MemoryContext } from '../memory/memory-retriever';

const TEXT_SYSTEM_PROMPT = `你是 PhoneFarm 手机自动化 AI。你在控制一台 Android 12+ 手机执行营销任务。

## 输出规则
- 必须输出合法 JSON
- 坐标用像素值 (屏幕分辨率见状态描述)
- 文本输入只支持英文/数字 (中文输入用剪贴板)
- 滑动: 上滑=(540,1600)→(540,400), 下滑=(540,400)→(540,1600)
- 长按 ≥ 800ms, 等待 ≥ 300ms
- 任务完成或无法继续时设 finished=true
- 弹窗优先点击"稍后"/"忽略"/"关闭", 不点"确定"/"更新"

## 输出 JSON
{
  "thinking": "推理过程",
  "action": { "type": "tap|long_press|swipe|type|back|home|launch|wait|terminate", ... },
  "confidence": 0.95,
  "finished": false,
  "needScreenshot": false,
  "nextStepHint": "下一步描述"
}`;

const VISION_SYSTEM_PROMPT = `你是 PhoneFarm 手机自动化 AI (视觉模式)。你现在可以看到手机屏幕截图。

你的任务是分析截图中的异常/复杂场景, 给出精确操作。

## 输出规则
- 截图是手机屏幕的完整截图, 坐标原点在左上角
- 必须精确定位目标元素的像素坐标
- 弹窗/对话框: 找到关闭/取消按钮 → tap
- 验证码: 识别类型 → 描述给操作员, 设 finished=true
- 异常页面: 分析原因 → 给出恢复步骤
- 新页面类型: 识别布局 → 给出探索策略

## 输出 JSON
{
  "thinking": "截图分析推理过程",
  "action": { "type": ... },
  "confidence": 0.95,
  "finished": false,
  "needScreenshot": false,
  "nextStepHint": "下一步描述"
}`;

export class PromptBuilder {

  /** 文本模式 — DeepSeek V4 Flash */
  buildText(input: DecisionInput, memory: MemoryContext, session: any): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: 'system', content: TEXT_SYSTEM_PROMPT },
      { role: 'user', content: this.buildStateText(input, session) },
    ];

    if (memory.memories.length > 0) {
      messages.push({ role: 'user', content: this.buildMemoryText(memory) });
    }

    return messages;
  }

  /** 视觉模式 — Qwen3-VL-Flash (文本 + 截图) */
  buildVision(input: DecisionInput, memory: MemoryContext, session: any): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: 'system', content: VISION_SYSTEM_PROMPT },
    ];

    // 文本状态 + 截图放在同一条消息中 (多模态)
    const contentParts: any[] = [
      { type: 'text', text: this.buildStateText(input, session) },
    ];

    if (input.screenshotBase64) {
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${input.screenshotBase64}`,
          detail: 'high', // Qwen3-VL 高细节模式 (保持原图分辨率)
        },
      });
    }

    messages.push({ role: 'user', content: contentParts });

    if (memory.memories.length > 0) {
      messages.push({ role: 'user', content: this.buildMemoryText(memory) });
    }

    return messages;
  }

  private buildStateText(input: DecisionInput, session: any): string {
    const lines: string[] = [];

    lines.push(`## 设备状态`);
    lines.push(`- 应用: ${input.appLabel} (${input.currentApp})`);
    lines.push(`- 页面类型: ${input.pageType}`);
    lines.push(`- 页面稳定: ${input.pageStable ? '是' : '否 (变化率 ' + (input.changeRatio * 100).toFixed(0) + '%)'}`);
    lines.push(`- 键盘可见: ${input.keyboardVisible ? '是' : '否'}`);
    lines.push(`- 异常标记: ${input.anomalyFlags.length > 0 ? input.anomalyFlags.join(', ') : '无'}`);
    lines.push(`- 屏幕: ${input.screenshotWidth || 1080}x${input.screenshotHeight || 2400}`);

    lines.push(`\n## 任务`);
    lines.push(`- 目标: ${session.taskPrompt}`);
    lines.push(`- 步骤: ${session.stepNumber + 1}/${session.maxSteps}`);

    // 可交互元素 (按重要性排序, 最多 15 个)
    if (input.interactiveElements.length > 0) {
      lines.push(`\n## 可交互元素 (${input.interactiveElements.length} 个, 显示前15)`);
      const sorted = [...input.interactiveElements].sort((a, b) => {
        const sa = (a.clickable ? 3 : 0) + (a.text ? 2 : 0) + (a.contentDesc ? 1 : 0);
        const sb = (b.clickable ? 3 : 0) + (b.text ? 2 : 0) + (b.contentDesc ? 1 : 0);
        return sb - sa;
      });
      for (const el of sorted.slice(0, 15)) {
        const b = el.bounds;
        const cx = Math.round((b.left + b.right) / 2);
        const cy = Math.round((b.top + b.bottom) / 2);
        const label = el.text || el.contentDesc || el.resourceId?.split('/').pop() || el.className?.split('.').pop() || '?';
        const flags = [el.clickable && '可点', el.scrollable && '可滚', el.editable && '可输'].filter(Boolean).join(',');
        lines.push(`  [${cx},${cy}] "${label}" ${flags ? `(${flags})` : ''}`);
      }
    }

    // OCR 文字
    if (input.textBlocks.length > 0) {
      lines.push(`\n## 屏幕文字 (${input.textBlocks.length} 条, 前10)`);
      for (const tb of input.textBlocks.slice(0, 10)) {
        lines.push(`  - "${tb.text}" [${tb.confidence.toFixed(2)}]`);
      }
    }

    // YOLO 检测摘要
    if (input.detections.length > 0) {
      const counts: Record<string, number> = {};
      for (const d of input.detections) {
        counts[d.label] = (counts[d.label] || 0) + 1;
      }
      const summary = Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(', ');
      lines.push(`\n## UI 组件: ${summary}`);
    }

    return lines.join('\n');
  }

  private buildMemoryText(memory: MemoryContext): string {
    const lines = ['## 跨设备经验'];
    for (const m of memory.memories.slice(0, 3)) {
      lines.push(`- ${m.scenario}: ${JSON.stringify(m.action_taken)} → ${m.outcome} (${m.success_count}次成功)`);
    }
    if (memory.rules?.length) {
      for (const r of memory.rules) {
        lines.push(`- [规则] ${r.scenario} → 自动: ${JSON.stringify(r.auto_action)} (置信度: ${r.confidence})`);
      }
    }
    return lines.join('\n');
  }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    { type: 'text'; text: string } |
    { type: 'image_url'; image_url: { url: string; detail?: string } }
  >;
}
```

#### 2.2.5 types.ts — 类型定义

```typescript
// control-server/src/decision/types.ts

export type PageType =
  | 'PAGE_UNKNOWN' | 'PAGE_FEED' | 'PAGE_SEARCH' | 'PAGE_PROFILE'
  | 'PAGE_LIVE' | 'PAGE_CHAT' | 'PAGE_SETTINGS' | 'PAGE_LOGIN' | 'PAGE_POPUP';

export interface Rect {
  left: number; top: number; right: number; bottom: number;
}

export interface UiElement {
  text: string;
  contentDesc: string;
  resourceId: string;
  className: string;
  clickable: boolean;
  longClickable: boolean;
  scrollable: boolean;
  editable: boolean;
  bounds: Rect;
}

export interface TextBlock {
  text: string;
  bbox: Rect;
  confidence: number;
}

export interface Detection {
  uiClass: string;
  label: string;
  bbox: Rect;
  confidence: number;
}

export interface DecisionInput {
  deviceId: string;
  currentApp: string;
  appLabel: string;
  pageType: PageType;
  pageStable: boolean;
  textBlocks: TextBlock[];
  interactiveElements: UiElement[];
  detections: Detection[];
  changeRatio: number;
  keyboardVisible: boolean;
  anomalyFlags: string[];
  screenshotBase64?: string;
  screenshotWidth?: number;
  screenshotHeight?: number;
}

export type DeviceAction =
  | { type: 'tap'; x: number; y: number }
  | { type: 'long_press'; x: number; y: number; durationMs?: number }
  | { type: 'swipe'; x1: number; y1: number; x2: number; y2: number; durationMs?: number }
  | { type: 'type'; text: string }
  | { type: 'back' }
  | { type: 'home' }
  | { type: 'launch'; packageName: string }
  | { type: 'wait'; durationMs: number }
  | { type: 'terminate'; message?: string };

export interface DecisionOutput {
  decisionId: string;
  thinking: string;
  action: DeviceAction;
  confidence: number;
  finished: boolean;
  needScreenshot: boolean;
  nextStepHint: string;
  modelUsed: 'deepseek' | 'qwen-vl' | 'rule' | 'none';
}

export interface TaskResult {
  deviceId: string;
  status: 'completed' | 'failed' | 'stopped' | 'max_steps';
  message: string;
  totalSteps: number;
  durationMs: number;
}
```

#### 2.2.6 safety-guard.ts — 安全护栏

```typescript
/**
 * 安全护栏 — 校验 AI 输出的动作合法性。
 *
 * 校验项:
 *   1. 坐标越界 → clamp 到屏幕内
 *   2. 启动应用黑名单 → 拒绝 (系统设置/支付)
 *   3. 文本内容长度限制 → 截断
 *   4. 连续重复动作检测 → 标记 (3次相同 → 路由切换到 VLM)
 *   5. 操作频率限制 → 最小间隔 300ms
 */
import type { DeviceAction } from './types';

export class SafetyGuard {
  private actionHistory = new Map<string, Array<{ hash: string; time: number }>>();
  private readonly BLACKLIST_PACKAGES = [
    'com.android.settings',
    'com.android.packageinstaller',
    'com.android.vending',
    'com.eg.android.AlipayGphone',
  ];

  validate(
    action: DeviceAction,
    screen: { screenWidth: number; screenHeight: number }
  ): DeviceAction {
    switch (action.type) {
      case 'tap':
      case 'long_press':
        action.x = this.clamp(action.x, 0, screen.screenWidth);
        action.y = this.clamp(action.y, 0, screen.screenHeight);
        break;

      case 'swipe':
        action.x1 = this.clamp(action.x1, 0, screen.screenWidth);
        action.y1 = this.clamp(action.y1, 0, screen.screenHeight);
        action.x2 = this.clamp(action.x2, 0, screen.screenWidth);
        action.y2 = this.clamp(action.y2, 0, screen.screenHeight);
        break;

      case 'launch':
        if (this.BLACKLIST_PACKAGES.some(p => action.packageName?.startsWith(p))) {
          throw new SafetyViolation(`禁止启动应用: ${action.packageName}`, 'BLACKLIST_APP');
        }
        break;

      case 'type':
        if (action.text && action.text.length > 500) {
          action.text = action.text.slice(0, 500);
        }
        break;
    }

    return action;
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(v)));
  }
}

export class SafetyViolation extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'SafetyViolation';
  }
}
```

### 2.3 环境变量配置

```bash
# control-server/.env (新增/修改项)

# ── DeepSeek V4 Flash (主模型, 文本决策) ──
DEEPSEEK_API_KEY=sk-xxxxxxxx
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_MAX_TOKENS=512
DEEPSEEK_TEMPERATURE=0.1

# ── Qwen3-VL-Flash (辅助模型, 图像识别) ──
DASHSCOPE_API_KEY=sk-xxxxxxxx
DASHSCOPE_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
DASHSCOPE_VL_MODEL=qwen3-vl-flash
DASHSCOPE_VL_MAX_TOKENS=1024
DASHSCOPE_VL_TEMPERATURE=0.1
```

### 2.4 config.ts 更新

```typescript
// control-server/src/config.ts (新增项)
const envSchema = z.object({
  // ... 现有保持不变 ...

  // DeepSeek (文本模型)
  DEEPSEEK_API_KEY: z.string().default(''),
  DEEPSEEK_API_URL: z.string().default('https://api.deepseek.com/v1/chat/completions'),
  DEEPSEEK_MODEL: z.string().default('deepseek-chat'),
  DEEPSEEK_MAX_TOKENS: z.coerce.number().default(512),
  DEEPSEEK_TEMPERATURE: z.coerce.number().default(0.1),

  // Qwen3-VL-Flash (视觉模型, 阿里云百炼)
  DASHSCOPE_API_KEY: z.string().default(''),
  DASHSCOPE_API_URL: z.string().default('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'),
  DASHSCOPE_VL_MODEL: z.string().default('qwen3-vl-flash'),
  DASHSCOPE_VL_MAX_TOKENS: z.coerce.number().default(1024),
  DASHSCOPE_VL_TEMPERATURE: z.coerce.number().default(0.1),

  // 路由阈值
  ROUTER_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.7),    // 低于此值切 VLM
  ROUTER_MAX_CONSECUTIVE_FAILURES: z.coerce.number().default(3),  // 连续失败 N 次切 VLM
  ROUTER_MAX_LOW_CONFIDENCE: z.coerce.number().default(3),        // 连续低置信 N 次切 VLM

  // 边缘状态
  EDGE_STATE_TTL_SEC: z.coerce.number().default(300),

  // 视频流
  STREAM_IDLE_TIMEOUT_SEC: z.coerce.number().default(300),
  STREAM_MAX_DURATION_SEC: z.coerce.number().default(1800),

  // 经验编译
  EXPERIENCE_COMPILE_INTERVAL_MIN: z.coerce.number().default(30),
  EXPERIENCE_MIN_DEVICES: z.coerce.number().default(3),

  // Feature Flags
  FF_DECISION_ENGINE: z.coerce.boolean().default(true),
  FF_QWEN_VL_FALLBACK: z.coerce.boolean().default(true),
  FF_STREAM_ON_DEMAND: z.coerce.boolean().default(true),
  FF_CROSS_DEVICE_MEMORY: z.coerce.boolean().default(true),
});
```

### 2.5 自动切换流程图

```
                  ┌─────────────────────────┐
                  │ 设备上报 EdgeState       │
                  │ (含 anomalyFlags,        │
                  │  pageType, etc.)         │
                  └───────────┬─────────────┘
                              │
                  ┌───────────▼─────────────┐
                  │ 记忆精确规则匹配?         │
                  │ (confidence >= 0.95)    │
                  └──────┬──────────┬───────┘
                    是   │          │  否
                         ▼          ▼
                  ┌──────────┐ ┌──────────────────────┐
                  │ 直接返回  │ │ determineRoute()     │
                  │ 规则动作  │ │ 路由决策引擎           │
                  └──────────┘ └──────────┬───────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
              ┌─────▼─────┐     ┌────────▼────────┐    ┌───────▼──────┐
              │anomalyFlags│     │consecutiveFails │    │pageType ===  │
              │.length > 0 │     │     >= 3        │    │  UNKNOWN     │
              └─────┬─────┘     └────────┬────────┘    └───────┬──────┘
                    │                    │                      │
                    └────────────────────┼──────────────────────┘
                                         │ 任一条件满足
                              ┌──────────▼───────────┐
                              │ 有截图可用?            │
                              └──────┬───────┬───────┘
                                是   │       │  否
                                     ▼       ▼
                              ┌──────────┐ ┌──────────┐
                              │Qwen3-VL  │ │DeepSeek  │
                              │Flash     │ │V4 Flash  │
                              │(视觉模式) │ │(文本模式) │
                              └──────────┘ │+标记      │
                                           │needScreen │
                                           └──────────┘
```

---

## 3. 模块 B: 边缘 CV 管线 (Android)

### 3.1 模块结构

```
android-client/app/src/main/java/com/phonefarm/client/edge/
├── EdgePipeline.kt          # CV 管线编排器 (@Singleton)
├── ScreenAnalyzer.kt        # OpenCV 屏幕分析
├── TextExtractor.kt         # ML Kit OCR 封装
├── UiDetector.kt            # YOLO-nano TFLite 推理
├── StateCompiler.kt         # CV + OCR + YOLO + A11y → EdgeState
├── StateProtobuf.kt         # Protobuf lite 序列化
├── LocalReactor.kt          # 本地快速反应引擎
└── model/
    ├── EdgeModels.kt         # 数据类
    └── ReactionRule.kt       # 反应规则模型
```

### 3.2 核心接口

#### 3.2.1 EdgePipeline.kt

```kotlin
/**
 * 边缘 CV 管线编排器。
 *
 * 线程模型: OpenCV(专用线程) → OCR+YOLO(并行,IO线程池) → 状态编译(主线程A11y快照)
 * 性能约束: 总延迟 p95 < 150ms (1080p 输入)
 */
@Singleton
class EdgePipeline @Inject constructor(
    private val screenAnalyzer: ScreenAnalyzer,
    private val textExtractor: TextExtractor,
    private val uiDetector: UiDetector,
    private val stateCompiler: StateCompiler,
    private val localReactor: LocalReactor
) {
    private val pipelineScope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    val isModelReady: StateFlow<Boolean> = uiDetector.isReady

    suspend fun process(
        screenshot: Bitmap,
        currentApp: String,
        taskContext: TaskContext?
    ): ProcessResult = withContext(pipelineScope.coroutineContext) {
        val t0 = SystemClock.elapsedRealtime()

        // 阶段 1: OpenCV (必须, <10ms)
        val change = screenAnalyzer.analyze(screenshot)

        // 阶段 2: 本地快速反应检查
        if (taskContext != null) {
            val localAction = localReactor.evaluate(change, currentApp, taskContext)
            if (localAction != null) {
                return@withContext ProcessResult.LocalReact(localAction, change)
            }
        }

        // 阶段 3: OCR + YOLO (并行, 仅页面稳定时)
        val ocrDef = if (change.isPageStable) async { textExtractor.extract(screenshot) } else null
        val yoloDef = if (change.isPageStable && uiDetector.isReady.value) async { uiDetector.detect(screenshot) } else null
        val ocr = ocrDef?.await()
        val det = yoloDef?.await()

        // 阶段 4: 状态编译
        val a11ySnapshot = withContext(Dispatchers.Main) {
            PhoneFarmAccessibilityService.instance?.takeUiSnapshot()
        }
        val state = stateCompiler.compile(
            deviceId = DeviceIdentity.id,
            screenshot = screenshot, currentApp = currentApp,
            screenWidth = screenshot.width, screenHeight = screenshot.height,
            changeAnalysis = change, ocrResult = ocr,
            detectionResult = det, a11ySnapshot = a11ySnapshot,
            taskContext = taskContext
        )

        // 阶段 5: Protobuf 序列化
        val proto = StateProtobuf.encode(state)
        val totalMs = SystemClock.elapsedRealtime() - t0

        val anomaly = state.anomalyFlags.isNotEmpty()
        return@withContext ProcessResult.StateReady(
            state = state,
            protobuf = proto,
            shouldSendScreenshot = anomaly,
            screenshotJpeg = if (anomaly) screenshot.compressJPEG(75) else null,
            timings = PipelineTimings(opencvMs = change.opencvTimeMs, ocrMs = ocr?.elapsedMs,
                yoloMs = det?.elapsedMs, compileMs = totalMs, totalMs = totalMs)
        )
    }
}
```

#### 3.2.2 ScreenAnalyzer.kt (OpenCV, 概要)

```kotlin
@Singleton
class ScreenAnalyzer @Inject constructor() {
    private var prevGray: Mat? = null
    private var prevHash: Long = 0
    private var stableFrames = 0

    fun analyze(screenshot: Bitmap): ChangeAnalysis {
        val t0 = SystemClock.elapsedRealtime()
        val gray = Mat()
        Utils.bitmapToMat(screenshot, gray)
        Imgproc.cvtColor(gray, gray, Imgproc.COLOR_RGBA2GRAY)
        Imgproc.resize(gray, gray, Size(360.0, 0.0), 0.0, 0.0, Imgproc.INTER_AREA)

        val hash = computePHash(gray)
        var changeRatio = 1.0f
        val regions = mutableListOf<Rect>()
        var keyboard = false

        if (prevGray != null) {
            val diff = Mat(); Core.absdiff(prevGray!!, gray, diff)
            val thresh = Mat(); Imgproc.threshold(diff, thresh, 25.0, 255.0, Imgproc.THRESH_BINARY)
            changeRatio = Core.countNonZero(thresh).toFloat() / (thresh.rows() * thresh.cols())
            // 连通域 → 变化区域 (省略细节)
            keyboard = regions.filter { it.y > gray.rows() * 0.55 }.sumOf { it.area().toLong() } >
                    (gray.rows() * gray.cols() * 0.15)
            diff.release(); thresh.release()
        }

        val hamming = java.lang.Long.bitCount(prevHash xor hash)
        stableFrames = if (changeRatio < 0.015f && hamming <= 5) stableFrames + 1 else 0
        val popup = if (changeRatio < 0.05f) matchPopupTemplates(gray) else PopupType.NONE

        prevGray?.release(); prevGray = gray; prevHash = hash
        return ChangeAnalysis(changeRatio = changeRatio, isPageStable = stableFrames >= 3,
            stableFrames = stableFrames, keyboardVisible = keyboard,
            detectedPopupType = popup, opencvTimeMs = SystemClock.elapsedRealtime() - t0)
    }
}
```

#### 3.2.3 UiDetector.kt (YOLO-nano, 概要)

```kotlin
@Singleton
class UiDetector @Inject constructor(@ApplicationContext private val ctx: Context) {
    private val _isReady = MutableStateFlow(false)
    val isReady: StateFlow<Boolean> = _isReady.asStateFlow()
    private var interpreter: Interpreter? = null

    init { loadModel() }

    private fun loadModel() {
        CoroutineScope(Dispatchers.IO).launch {
            val bytes = ctx.assets.open("models/yolo_ui_nano.tflite").use { it.readBytes() }
            val opts = Interpreter.Options().apply {
                try { addDelegate(GpuDelegate()) } catch (_: Exception) { setNumThreads(4) }
            }
            interpreter = Interpreter(ByteBuffer.allocateDirect(bytes.size).put(bytes), opts)
            _isReady.value = true
        }
    }

    suspend fun detect(bitmap: Bitmap): DetectionResult = withContext(Dispatchers.Default) {
        val t0 = SystemClock.elapsedRealtime()
        // 预处理 → 推理 → NMS (细节省略)
        DetectionResult(detections = emptyList(), elapsedMs = SystemClock.elapsedRealtime() - t0)
    }
}
```

### 3.3 新增依赖

```toml
# gradle/libs.versions.toml
[versions]
opencv-android = "4.10.0"
tflite = "2.17.0"
tflite-gpu = "2.17.0"

[libraries]
opencv-android = { module = "org.opencv:opencv-android", version.ref = "opencv-android" }
tflite = { module = "org.tensorflow:tensorflow-lite", version.ref = "tflite" }
tflite-gpu = { module = "org.tensorflow:tensorflow-lite-gpu", version.ref = "tflite-gpu" }
tflite-support = { module = "org.tensorflow:tensorflow-lite-support", version.ref = "tflite" }
```

---

## 4. 模块 C: 按需音视频流

### 4.1 设计原则

| 需求 | 实现 |
|------|------|
| 默认关闭 | 设备仅上报结构化状态, 不推流 |
| Dashboard 主动开启 | 设备详情页「查看实时画面」按钮 |
| 自动关闭 | 无订阅者 5 分钟 / 最长 30 分钟 |
| 双通道隔离 | 视频流走独立二进制帧, 不阻塞状态+决策通道 |
| 自适应码率 | WiFi:1080p@15fps, 5G:1080p@10fps, 4G:720p@10fps |

### 4.2 StreamManager (服务端)

```typescript
// control-server/src/stream/stream-manager.ts

interface StreamSession {
  deviceId: string;
  status: 'idle' | 'starting' | 'streaming' | 'stopping';
  resolution: { width: number; height: number };
  subscribers: Set<WebSocket>;
  startedAt: Date;
  bytesTransferred: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  maxDurationTimer: ReturnType<typeof setTimeout> | null;
}

export class StreamManager {
  private sessions = new Map<string, StreamSession>();
  private deviceSender: ((deviceId: string, msg: object) => boolean) | null = null;

  setDeviceSender(s: (deviceId: string, msg: object) => boolean) { this.deviceSender = s; }

  async startStream(deviceId: string, opts: StreamOptions, subscriber: WebSocket): Promise<StreamSession> {
    let s = this.sessions.get(deviceId);
    if (s?.status === 'streaming') { s.subscribers.add(subscriber); this.resetIdle(s); return s; }

    s = {
      deviceId, status: 'starting',
      resolution: await this.getResolution(deviceId),
      subscribers: new Set([subscriber]), startedAt: new Date(),
      bytesTransferred: 0, idleTimer: null, maxDurationTimer: null,
    };
    this.sessions.set(deviceId, s);

    this.deviceSender?.(deviceId, { type: 'start_stream', payload: opts });
    s.maxDurationTimer = setTimeout(() => this.stopStream(deviceId, 'max_duration'), 30 * 60_000);
    return s;
  }

  stopStream(deviceId: string, reason: string): void {
    const s = this.sessions.get(deviceId); if (!s) return;
    this.deviceSender?.(deviceId, { type: 'stop_stream', payload: { reason } });
    for (const ws of s.subscribers) {
      try { ws.send(JSON.stringify({ type: 'stream_closed', deviceId, reason })); } catch {}
    }
    if (s.idleTimer) clearTimeout(s.idleTimer);
    if (s.maxDurationTimer) clearTimeout(s.maxDurationTimer);
    this.sessions.delete(deviceId);
  }

  relayNalUnit(deviceId: string, nal: Buffer): void {
    const s = this.sessions.get(deviceId);
    if (!s || s.status !== 'streaming') return;
    s.bytesTransferred += nal.length;
    for (const ws of s.subscribers) {
      if (ws.readyState === WebSocket.OPEN) { try { ws.send(nal); } catch {} }
    }
  }

  addSubscriber(deviceId: string, ws: WebSocket): void {
    const s = this.sessions.get(deviceId);
    if (s) { s.subscribers.add(ws); this.resetIdle(s); }
  }

  removeSubscriber(deviceId: string, ws: WebSocket): void {
    const s = this.sessions.get(deviceId);
    if (s) { s.subscribers.delete(ws); this.resetIdle(s); }
  }

  private resetIdle(s: StreamSession): void {
    if (s.idleTimer) clearTimeout(s.idleTimer);
    s.idleTimer = setTimeout(() => {
      if (s.subscribers.size === 0) this.stopStream(s.deviceId, 'idle_timeout');
    }, 5 * 60_000);
  }

  private async getResolution(id: string) { return { width: 1080, height: 2400 }; }
}

export const streamManager = new StreamManager();
```

### 4.3 StreamController (Android)

```kotlin
@Singleton
class StreamController @Inject constructor(
    private val encoder: ScreenEncoder,
    private val ws: WebSocketClient
) {
    private var streaming = false

    fun handleCommand(msg: WebSocketMessage) {
        when (msg.type) {
            "start_stream" -> start(msg.payload as StreamConfig)
            "stop_stream" -> stop()
        }
    }

    fun start(cfg: StreamConfig) {
        if (streaming) return
        encoder.start(
            maxSize = cfg.maxSize ?: 1080, bitRate = cfg.bitRate ?: 4_000_000,
            maxFps = cfg.maxFps ?: 15, audio = cfg.audio ?: false,
            onNalUnit = { ws.sendBinaryFrame(0x02, it) },
            onAudioFrame = { ws.sendBinaryFrame(0x05, it) }
        )
        streaming = true
        ws.send(WebSocketMessage.StreamStarted(encoder.getResolution()))
    }

    fun stop() {
        if (!streaming) return
        encoder.stop(); streaming = false
        ws.send(WebSocketMessage.StreamStopped("server_request"))
    }

    fun isStreaming() = streaming
}
```

### 4.4 REST API

```typescript
POST /api/v1/stream/start       // { deviceId, options? } → 开启视频流
POST /api/v1/stream/stop        // { deviceId } → 停止视频流
GET  /api/v1/stream/status/:id  // 查询流状态
GET  /api/v1/stream/stats       // 全局流统计
```

---

## 5. 模块 D: 跨设备记忆系统

### 5.1 数据库迁移

```sql
-- control-server/migrations/0002_edge_memory.sql

CREATE EXTENSION IF NOT EXISTS vector;

-- 设备记忆表
CREATE TABLE device_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    platform TEXT NOT NULL,              -- dy / ks / wx / xhs
    page_type TEXT,
    scenario TEXT NOT NULL,
    state_signature TEXT NOT NULL,       -- SHA256 前 16 位
    observation TEXT NOT NULL,
    action_taken JSONB NOT NULL,
    outcome TEXT NOT NULL,               -- success / fail / retry
    error_reason TEXT,
    embedding vector(1024),
    success_count INTEGER DEFAULT 1,
    fail_count INTEGER DEFAULT 0,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (device_id, state_signature)
);

CREATE INDEX idx_memory_embedding ON device_memories
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_memory_signature ON device_memories (state_signature, platform);

-- 经验规则表
CREATE TABLE experience_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL,
    scenario TEXT NOT NULL,
    conditions JSONB NOT NULL,
    auto_action JSONB NOT NULL,
    confidence FLOAT DEFAULT 0.5,
    verified_by_devices INTEGER DEFAULT 0,
    total_successes INTEGER DEFAULT 0,
    total_trials INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rules_platform ON experience_rules (platform, enabled, confidence DESC);
```

### 5.2 核心接口概要

```typescript
// MemoryStore — 记忆持久化
class MemoryStore {
    async upsert(params: {
        deviceId, platform, scenario, stateSignature: string;
        observation: string; actionTaken: object;
        outcome: 'success' | 'fail'; embedding: number[];
    }): Promise<void> { /* Upsert logic */ }

    async embed(text: string): Promise<number[]> {
        // 使用 DeepSeek Embedding API
    }
}

// MemoryRetriever — 三级检索
class MemoryRetriever {
    async retrieve(params: {
        platform, pageType: string; anomalyFlags: string[];
        textSignature: string;
    }): Promise<MemoryContext> {
        // Level 1: 精确签名匹配
        // Level 2: 向量语义检索 (cosine distance)
        // Level 3: 经验规则匹配
    }
}

// ExperienceCompiler — 定时编译经验规则
class ExperienceCompiler {
    async compile(): Promise<number> {
        // 查找: ≥3 设备, ≥5 次成功, 0 失败
        // 编译为 experience_rules → 自动下发
    }
}
```

---

## 6. 模块 E: 通信协议 & 数据契约

### 6.1 消息通道

| 通道 | 方向 | 帧类型 | 内容 | 频率 | 大小 |
|------|------|--------|------|------|------|
| 状态通道 | APK→Server | Binary 0x10 | EdgeState Protobuf | 页面变化时 | 2-5KB |
| 决策通道 | Server→APK | Text JSON | DecisionOutput | 每步 | 200-500B |
| 视频通道 | APK→Server | Binary 0x02/0x05 | H.264 NAL / AAC | 按需 15fps | ~500KB/s |
| 截图通道 | APK→Server | Text JSON | JPEG Base64 | 异常时 5-10% | 50-200KB |

### 6.2 Protobuf (EdgeState)

```protobuf
syntax = "proto3";
package phonefarm.edge;
option java_package = "com.phonefarm.client.edge.proto";

message EdgeState {
  int64 timestamp_ms = 1;
  string device_id = 2;
  string current_app = 3;
  string app_label = 4;
  PageType page_type = 5;
  bool page_stable = 6;
  int32 screen_width = 7;
  int32 screen_height = 8;
  repeated UiElement interactive_elements = 9;
  repeated TextBlock text_blocks = 10;
  repeated Detection detections = 11;
  float change_ratio = 12;
  repeated Rect change_regions = 13;
  int32 stable_frames = 14;
  bool keyboard_visible = 15;
  repeated string anomaly_flags = 16;
  optional TaskState task_state = 17;
  optional bytes screenshot_jpeg = 18;
}

enum PageType {
  PAGE_UNKNOWN = 0; PAGE_FEED = 1; PAGE_SEARCH = 2;
  PAGE_PROFILE = 3; PAGE_LIVE = 4; PAGE_CHAT = 5;
  PAGE_SETTINGS = 6; PAGE_LOGIN = 7; PAGE_POPUP = 8;
}

enum UiClass {
  UI_UNKNOWN = 0; UI_BUTTON = 1; UI_TEXT_INPUT = 2; UI_IMAGE = 3;
  UI_ICON = 4; UI_TOGGLE = 5; UI_KEYBOARD = 6; UI_NAV_BAR = 7;
  UI_AD_BANNER = 8; UI_VIDEO = 9; UI_WEBVIEW = 10;
}

message Rect { int32 left = 1; int32 top = 2; int32 right = 3; int32 bottom = 4; }
message UiElement { string text = 1; string content_desc = 2; string resource_id = 3; string class_name = 4; bool clickable = 5; bool long_clickable = 6; bool scrollable = 7; bool editable = 8; Rect bounds = 11; }
message TextBlock { string text = 1; Rect bbox = 2; float confidence = 3; }
message Detection { UiClass ui_class = 1; string label = 2; Rect bbox = 3; float confidence = 4; }
message TaskState { string task_id = 1; string task_prompt = 2; int32 step_number = 3; int32 max_steps = 4; string status = 5; }
```

---

## 7. 迁移计划 & 回滚策略

### 7.1 五阶段迁移

```
Week 1-2  │ Phase A: 双模型决策引擎
          │ ├─ DecisionRouter + DeepSeekClient + QwenVLClient
          │ ├─ PromptBuilder (双模式) + SafetyGuard
          │ ├─ decision-routes.ts (替代 vlm-routes.ts)
          │ └─ 验收: 模拟状态 → 正确路由到对应模型 → 正确决策
          │
Week 2-4  │ Phase B: 边缘 CV 管线
          │ ├─ OpenCV + ML Kit OCR + YOLO-nano 集成
          │ ├─ EdgePipeline + StateCompiler + Protobuf
          │ ├─ LocalReactor (6 内置规则)
          │ └─ 验收: APK 上报 EdgeState, 服务端解析
          │
Week 4-5  │ Phase C: 跨设备记忆
          │ ├─ pgvector + 迁移脚本 + MemoryStore
          │ ├─ MemoryRetriever + ExperienceCompiler
          │ └─ 验收: 设备 A 经验指导设备 B
          │
Week 5-6  │ Phase D: 按需音视频流
          │ ├─ StreamManager + StreamController
          │ ├─ API 端点 + Dashboard 按钮
          │ └─ 验收: 按需开启/关闭/自动超时
          │
Week 6-7  │ Phase E: 编排 + 旧代码清理
          │ ├─ CampaignEngine + DeviceCoordinator
          │ ├─ 移除 LocalVlmClient/InferenceRouter/MemoryManager
          │ ├─ 移除 vlm-orchestrator.ts/vlm-client.ts
          │ └─ 验收: 编译通过, 旧模块 0 引用
```

### 7.2 Feature Flags

```typescript
// 迁移期间通过环境变量控制新旧切换
FF_DECISION_ENGINE=true       // 新版双模型决策引擎
FF_QWEN_VL_FALLBACK=true      // 异常时自动切换 Qwen3-VL
FF_EDGE_STATE=true            // 接受 EdgeState (Protobuf)
FF_STREAM_ON_DEMAND=true      // 按需视频流
FF_CROSS_DEVICE_MEMORY=true   // 跨设备记忆
FF_LEGACY_VLM=false           // 旧 VLM 循环 (回退用)
```

```kotlin
// Android BuildConfig
buildConfigField("boolean", "ENABLE_EDGE_PIPELINE", "true")
buildConfigField("boolean", "ENABLE_LEGACY_VLM", "false")
```

---

## 8. 测试策略

### 8.1 决策路由测试 (核心)

```
测试 1: 正常页面 → DeepSeek
  输入: pageType=FEED, anomalyFlags=[], consecutiveFailures=0
  预期: route.model='deepseek', route.reason='normal'

测试 2: 异常弹窗 → Qwen3-VL
  输入: anomalyFlags=['popup_update'], 有截图
  预期: route.model='qwen-vl', route.reason='anomaly_detected'

测试 3: 连续失败 → Qwen3-VL
  输入: consecutiveFailures=3, 有截图
  预期: route.model='qwen-vl', route.reason='stuck_loop'

测试 4: 无截图 → 回退 DeepSeek
  输入: anomalyFlags=['captcha'], 无截图
  预期: route.model='deepseek', route.includeScreenshot=false

测试 5: 精确规则匹配 → 跳过 AI
  输入: memory.exactRule.confidence=0.96
  预期: 直接返回规则动作, 不调 API

测试 6: DeepSeek 解析失败 → 重试 3 次后抛错
测试 7: Qwen3-VL 解析失败 → 重试 3 次后抛错
```

### 8.2 集成测试

```
测试 8: EdgePipeline → Protobuf → StateIngestor 端到端
  4 平台 × 5 页面类型 = 20 张截图
  验证: Protobuf < 5KB, 反序列化成功, 字段完整

测试 9: StateIngestor → DecisionRouter → 正确模型 → DecisionOutput
  20 个 EdgeState fixtures
  验证: 路由正确率 > 95%, 决策合理性 (人类评审)

测试 10: 视频流按需启停
  验证: start → 3s 内出画面 → stop → 编码器释放
  验证: 5 分钟无订阅者 → 自动关闭

测试 11: 记忆系统
  设备 A 完成 3 次相同场景 → 编译规则
  设备 B 相同场景 → 召回规则 → 直接应用
```

---

## 9. 性能预算

### 9.1 Android 端

| 指标 | 目标 |
|------|------|
| 边缘管线总延迟 (p95) | < 150ms |
| OpenCV 分析 | < 10ms |
| ML Kit OCR | < 80ms |
| YOLO-nano (GPU) | < 50ms |
| YOLO-nano (CPU) | < 100ms |
| Protobuf 序列化 | < 5ms |
| APK 体积增量 | < 10MB |

### 9.2 服务端

| 指标 | 目标 |
|------|------|
| DeepSeek API p95 | < 1.5s |
| Qwen3-VL API p95 | < 3s |
| 路由决策 (不含 API) | < 5ms |
| 记忆检索 p95 | < 200ms |

### 9.3 模型成本估算 (50 步任务)

| 场景 | 模型 | 步数 | 单价 | 单任务成本 |
|------|------|------|------|-----------|
| 常规 | DeepSeek V4 Flash | 45 步 | $0.27/M tokens | ~$0.006 |
| 异常 | Qwen3-VL-Flash | 5 步 | ¥0.002/千张 | ~¥0.01 |
| **合计** | | **50 步** | | **~$0.007** |

10 设备 × 10 任务/天 = 100 任务/天 → ~$0.70/天 → **~$21/月**

---

## 10. 附录: 完整文件变更清单

### 10.1 新增文件

```
android-client/
├── app/src/main/java/com/phonefarm/client/edge/
│   ├── EdgePipeline.kt
│   ├── ScreenAnalyzer.kt
│   ├── TextExtractor.kt
│   ├── UiDetector.kt
│   ├── StateCompiler.kt
│   ├── StateProtobuf.kt
│   ├── LocalReactor.kt
│   └── model/ (EdgeModels.kt, ReactionRule.kt)
├── app/src/main/java/com/phonefarm/client/stream/
│   └── StreamController.kt
├── app/src/main/proto/edge_state.proto
└── app/src/main/assets/models/ (yolo_ui_nano.tflite, yolo_ui_labels.txt)

control-server/
└── src/
    ├── decision/
    │   ├── decision-router.ts        # ★ 双模型路由网关
    │   ├── decision-engine.ts
    │   ├── deepseek-client.ts        # DeepSeek V4 Flash
    │   ├── qwen-vl-client.ts         # Qwen3-VL-Flash (百炼)
    │   ├── prompt-builder.ts         # 双模式提示词
    │   ├── safety-guard.ts
    │   ├── decision-routes.ts
    │   └── types.ts
    ├── edge/ (state-ingestor.ts, state-store.ts)
    ├── memory/ (memory-store.ts, memory-retriever.ts, experience-compiler.ts)
    ├── stream/stream-manager.ts
    ├── orchestration/ (campaign-engine.ts, device-coordinator.ts)
    └── migrations/0002_edge_memory.sql

docs/
└── EDGE_CLOUD_ARCHITECTURE_SPEC.md   ← 本文件
```

### 10.2 修改文件

```
android-client/
├── app/build.gradle.kts                     # +OpenCV, +TFLite, +Protobuf
├── gradle/libs.versions.toml                # 版本声明
├── .../network/WebSocketMessageDispatcher.kt # 截图上报 → EdgeState 上报
├── .../service/BridgeForegroundService.kt   # +EdgePipeline, +StreamController
└── .../di/AppModule.kt                      # +Edge 模块绑定

control-server/
├── package.json                             # +pgvector 依赖
├── src/config.ts                            # +双模型配置 + Feature Flags
└── src/index.ts                             # +DecisionRoutes 注册

dashboard/
├── src/pages/DeviceDetail.tsx               # +「查看实时画面」按钮
└── src/components/ScrcpyPlayer.tsx         # 适配新 API 路径
```

### 10.3 Phase E 删除文件

```
android-client/
├── .../vlm/LocalVlmClient.kt       # 移除 llama.cpp JNI 推理
├── .../vlm/InferenceRouter.kt      # 移除多模型路由
├── .../vlm/MemoryManager.kt        # 迁移到云端
└── .../cpp/                        # 移除 llama.cpp CMake

control-server/
├── src/vlm/vlm-orchestrator.ts     # 被 DecisionRouter 替代
└── src/vlm/vlm-client.ts           # 被 deepseek-client + qwen-vl-client 替代

vlm-bridge/                          # Python VLM 微服务 (不再需要)
```

---

> **文档结束**  
> 核心设计决策: DeepSeek V4 Flash 处理 ~90% 常规文本决策, Qwen3-VL-Flash 处理 ~10% 异常图像场景,  
> DecisionRouter 自动路由切换, 兼顾成本、速度与准确性。
