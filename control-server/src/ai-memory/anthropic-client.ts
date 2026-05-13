/**
 * DeepSeek Anthropic Client — 基于 Anthropic Messages API 标准的 DeepSeek 客户端
 *
 * base_url: https://api.deepseek.com/anthropic
 * 认证方式: x-api-key (Anthropic 标准)
 * 请求格式: Anthropic Messages API
 *
 * 优势:
 *   - 标准 Anthropic 接口，便于对接 Claude Code / Skills / MCP 生态
 *   - system 为顶层字段，消息内容为 content 数组
 *   - 便于未来切换到其他 Anthropic 兼容提供商
 */
import os from "os";

const ANTHROPIC_BASE_URL = "https://api.deepseek.com/anthropic";
const ANTHROPIC_API_KEY = "sk-234ab5238bf04fb4912d4f5899a0e6b0";

const AI_MEMORY_MODEL = "deepseek-v4-flash";
const AI_MEMORY_MAX_TOKENS = 256;
const AI_MEMORY_TEMPERATURE = 0.1;

interface TextContent { type: "text"; text: string }
interface ToolUseContent { type: "tool_use"; id?: string; name: string; input: Record<string, unknown> }
interface ToolResultContent { type: "tool_result"; tool_use_id?: string; content: string }
type ContentBlock = TextContent | ToolUseContent | ToolResultContent;

interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: TextContent[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

interface AnthropicError {
  type: "error";
  error: { type: string; message: string };
}

export class DeepSeekAnthropicClient {
  private apiKey: string;
  private baseUrl: string;
  model: string;

  constructor(config?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = config?.apiKey || ANTHROPIC_API_KEY;
    this.baseUrl = config?.baseUrl || ANTHROPIC_BASE_URL;
    this.model = config?.model || AI_MEMORY_MODEL;
  }

  async messages(params: {
    system?: string;
    messages: Message[];
    max_tokens?: number;
    temperature?: number;
    stop_sequences?: string[];
  }): Promise<AnthropicResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: params.max_tokens ?? AI_MEMORY_MAX_TOKENS,
      temperature: params.temperature ?? AI_MEMORY_TEMPERATURE,
      messages: params.messages,
    };
    if (params.system) body.system = params.system;
    if (params.stop_sequences) body.stop_sequences = params.stop_sequences;

    return this.fetchWithRetry(body);
  }

  async jsonPrompt(params: {
    system: string;
    userContent: string;
    max_tokens?: number;
  }): Promise<Record<string, unknown>> {
    const response = await this.messages({
      system: params.system,
      messages: [
        {
          role: "user",
          content: [{ type: "text" as const, text: params.userContent }],
        },
      ],
      max_tokens: params.max_tokens ?? 512,
      temperature: 0.0,
    });

    const text = response.content
      .filter((c): c is TextContent => c.type === "text")
      .map(c => c.text)
      .join("\n");
    return this.parseJsonContent(text);
  }

  private async fetchWithRetry(body: Record<string, unknown>, retries = 3): Promise<AnthropicResponse> {
    const url = `${this.baseUrl}/v1/messages`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          const errText = await res.text();
          if ((res.status === 429 || res.status === 503 || res.status === 529) && attempt < retries) {
            await this.sleep(1000 * Math.pow(2, attempt));
            continue;
          }
          throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 300)}`);
        }

        return await res.json();
      } catch (err: any) {
        if (attempt === retries) throw err;
        await this.sleep(1000 * Math.pow(2, attempt));
      }
    }
    throw new Error("Anthropic API unreachable after retries");
  }

  private parseJsonContent(text: string): Record<string, unknown> {
    let json = text.trim();
    if (json.startsWith("```")) {
      json = json.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }
    try {
      return JSON.parse(json);
    } catch {
      const match = json.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error(`Failed to parse JSON: ${text.slice(0, 200)}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}

let defaultClient: DeepSeekAnthropicClient | null = null;

export function getAnthropicClient(): DeepSeekAnthropicClient {
  if (!defaultClient) {
    defaultClient = new DeepSeekAnthropicClient();
  }
  return defaultClient;
}
