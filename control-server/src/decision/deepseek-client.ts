/**
 * DeepSeek V4 Flash 客户端 (Anthropic API) — 纯文本决策。
 *
 * 基于 Anthropic Messages API 标准，base_url: https://api.deepseek.com/anthropic
 * 与 QwenVLClient 暴露相同接口: decide(messages) → RawDecision
 */
import { config } from "../config";
import type { RuntimeConfig } from "../config-manager/runtime-config.js";
import type { RawDecision } from "./types";

export interface DeepSeekConfig {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  runtimeConfig?: RuntimeConfig;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: string } }>;
}

export class DeepSeekClient {
  private apiKey: string;
  private apiUrl: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private totalTokensUsed = 0;
  private rc: RuntimeConfig | undefined;
  private maxRetries: number;
  private requestTimeoutMs: number;
  private retryBaseDelayMs: number;

  constructor(overrides?: DeepSeekConfig) {
    this.rc = overrides?.runtimeConfig;
    this.apiKey = overrides?.apiKey || config.DEEPSEEK_API_KEY;
    this.apiUrl = overrides?.apiUrl || config.DEEPSEEK_API_URL;
    this.model = overrides?.model || config.DEEPSEEK_MODEL;
    this.maxTokens = overrides?.maxTokens ?? config.DEEPSEEK_MAX_TOKENS;
    this.temperature = overrides?.temperature ?? config.DEEPSEEK_TEMPERATURE;
    this.maxRetries = this.rc?.getNumber("ai.deepseek.retry_max_attempts", 3) ?? 3;
    this.requestTimeoutMs = this.rc?.getNumber("ai.deepseek.request_timeout_ms", 10000) ?? 10000;
    this.retryBaseDelayMs = this.rc?.getNumber("ai.deepseek.retry_base_delay_ms", 1000) ?? 1000;
  }

  async decide(allMessages: ChatMessage[]): Promise<RawDecision> {
    const systemMsg = allMessages.find(m => m.role === "system");
    const userMsgs = allMessages.filter(m => m.role !== "system");

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: userMsgs.map(m => ({
        role: m.role,
        content: typeof m.content === "string"
          ? [{ type: "text", text: m.content }]
          : m.content.filter((p: any) => p.type !== "image_url").map((p: any) => ({ type: "text", text: p.text })),
      })),
    };
    if (systemMsg && typeof systemMsg.content === "string") {
      body.system = systemMsg.content;
    }

    const response = await this.fetchWithRetry(body);
    const textBlocks = response.content?.filter((c: any) => c.type === "text") || [];
    const content = textBlocks.map((c: any) => c.text).join("\n") || "{}";

    if (response.usage) {
      this.totalTokensUsed += (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0);
    }

    return this.parseResponse(content);
  }

  private async fetchWithRetry(body: Record<string, unknown>): Promise<any> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch(this.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });

        if (!res.ok) {
          const errText = await res.text();
          if ((res.status === 429 || res.status === 503 || res.status === 529) && attempt < this.maxRetries) {
            await sleep(this.retryBaseDelayMs * Math.pow(2, attempt));
            continue;
          }
          throw new Error(`DeepSeek API ${res.status}: ${errText.slice(0, 200)}`);
        }

        return await res.json();
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
      throw new Error(`Failed to parse DeepSeek response: ${content.slice(0, 200)}`);
    }
  }

  getTokenUsage(): number {
    return this.totalTokensUsed;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
