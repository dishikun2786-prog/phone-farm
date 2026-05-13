/**
 * Qwen3-VL-Plus 客户端 — 阿里云百炼 DashScope API (OpenAI 兼容)。
 *
 * API 端点: https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
 * 认证: Bearer Token (DASHSCOPE_API_KEY)
 * 模型: qwen3-vl-plus (推荐) / qwen3-vl-flash (最快) / qwen3-vl-max (最强)
 *
 * Qwen3-VL-Plus 特性:
 *   - 多模态: 支持文本 + 图像输入
 *   - 中文优化: UI 界面理解能力强
 *   - 性价比: ¥0.002/千张图
 *
 * 与 DeepSeekClient 暴露相同接口: decide(messages) → RawDecision
 */
import { config } from "../config";
import type { RuntimeConfig } from "../config-manager/runtime-config.js";
import type { RawDecision } from "./types";

export interface QwenVLConfig {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  runtimeConfig?: RuntimeConfig;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }>;
}

interface DashScopeResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export class QwenVLClient {
  private apiKey: string;
  private apiUrl: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private totalTokensUsed = 0;
  private totalImagesProcessed = 0;
  private rc: RuntimeConfig | undefined;
  private maxRetries: number;
  private requestTimeoutMs: number;
  private retryBaseDelayMs: number;

  constructor(overrides?: QwenVLConfig) {
    this.rc = overrides?.runtimeConfig;
    this.apiKey = overrides?.apiKey || config.DASHSCOPE_API_KEY;
    this.apiUrl = overrides?.apiUrl || config.DASHSCOPE_API_URL;
    this.model = overrides?.model || config.DASHSCOPE_VL_MODEL;
    this.maxTokens = overrides?.maxTokens ?? config.DASHSCOPE_VL_MAX_TOKENS;
    this.temperature = overrides?.temperature ?? config.DASHSCOPE_VL_TEMPERATURE;
    this.maxRetries = this.rc?.getNumber("ai.qwen_vl.retry_max_attempts", 3) ?? 3;
    this.requestTimeoutMs = this.rc?.getNumber("ai.qwen_vl.request_timeout_ms", 15000) ?? 15000;
    this.retryBaseDelayMs = this.rc?.getNumber("ai.qwen_vl.retry_base_delay_ms", 2000) ?? 2000;
  }

  /**
   * 发送多模态决策请求 (文本 + 图像)。
   * 图片使用 Base64 data URL 格式。
   */
  async decide(messages: ChatMessage[]): Promise<RawDecision> {
    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "image_url") {
            this.totalImagesProcessed++;
          }
        }
      }
    }

    const body = {
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      response_format: { type: "json_object" as const },
    };

    const response = await this.fetchWithRetry(body);
    const content = response.choices?.[0]?.message?.content || "{}";

    if (response.usage) {
      this.totalTokensUsed += response.usage.total_tokens || 0;
    }

    return this.parseResponse(content);
  }

  private async fetchWithRetry(body: Record<string, unknown>): Promise<DashScopeResponse> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch(this.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
            "X-DashScope-OssResourceResolve": "disable",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });

        if (!res.ok) {
          const errText = await res.text();
          if ((res.status === 429 || res.status === 503) && attempt < this.maxRetries) {
            await sleep(this.retryBaseDelayMs * Math.pow(2, attempt));
            continue;
          }
          throw new Error(`Qwen3-VL API ${res.status}: ${errText}`);
        }

        return await res.json() as DashScopeResponse;
      } catch (err) {
        if (attempt === this.maxRetries) throw err;
        await sleep(this.retryBaseDelayMs * Math.pow(2, attempt));
      }
    }
    throw new Error("Unreachable");
  }

  private parseResponse(content: string): RawDecision {
    let json = content.trim();
    if (json.startsWith("```")) {
      json = json.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
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
      estimatedCostYuan: this.totalImagesProcessed * 0.002,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
