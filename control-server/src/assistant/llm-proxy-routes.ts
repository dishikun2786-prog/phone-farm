/**
 * LLM Proxy Routes — server-side proxy for AI Assistant LLM calls.
 *
 * API keys stay on the server; Android sends JWT-authenticated requests.
 * Credit consumption happens AFTER successful LLM response.
 *
 * Endpoints:
 *   POST /api/v1/assistant/chat   — DeepSeek text (Anthropic Messages API)
 *   POST /api/v1/assistant/vision — QwenVL vision (DashScope API)
 */
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { creditService } from "../billing/credit-service.js";

/** Minimum credit balance required to use the assistant */
const MIN_CREDITS_FOR_CHAT = 1;
const MIN_CREDITS_FOR_VISION = 2;

/** DeepSeek proxy — Anthropic Messages API format */
async function proxyDeepSeek(
  messages: unknown[],
  systemPrompt?: string,
  tools?: unknown[],
): Promise<{ content: string; inputTokens: number; outputTokens: number; toolCalls?: unknown[] }> {
  const body: Record<string, unknown> = {
    model: config.DEEPSEEK_MODEL,
    messages,
    max_tokens: config.DEEPSEEK_MAX_TOKENS,
    temperature: config.DEEPSEEK_TEMPERATURE,
  };
  if (systemPrompt) body.system = systemPrompt;
  if (tools && tools.length > 0) body.tools = tools;

  const resp = await fetch(`${config.DEEPSEEK_API_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.DEEPSEEK_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`DeepSeek API error ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = (await resp.json()) as any;
  const content = data.content?.[0]?.text ?? "";
  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;

  // Extract tool calls from the Anthropic response
  const toolCalls: unknown[] = [];
  for (const block of (data.content ?? [])) {
    if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input ?? {},
      });
    }
  }

  return { content, inputTokens, outputTokens, toolCalls };
}

/** QwenVL proxy — DashScope OpenAI-compatible API */
async function proxyQwenVL(
  messages: unknown[],
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const resp = await fetch(config.DASHSCOPE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.DASHSCOPE_VL_MODEL,
      messages,
      max_tokens: config.DASHSCOPE_VL_MAX_TOKENS,
      temperature: config.DASHSCOPE_VL_TEMPERATURE,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`QwenVL API error ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = (await resp.json()) as any;
  const content = data.choices?.[0]?.message?.content ?? "";
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  return { content, inputTokens, outputTokens };
}

export async function llmProxyRoutes(app: FastifyInstance): Promise<void> {

  /** POST /assistant/chat — Brain agent text inference (DeepSeek) */
  app.post("/api/v1/assistant/chat", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    // Credit check
    const enough = await creditService.hasEnoughCredits(userId, MIN_CREDITS_FOR_CHAT);
    if (!enough) {
      return reply.status(402).send({
        error: "Insufficient credits",
        minRequired: MIN_CREDITS_FOR_CHAT,
        code: "INSUFFICIENT_CREDITS",
      });
    }

    if (!config.DEEPSEEK_API_KEY) {
      return reply.status(503).send({ error: "DeepSeek API not configured" });
    }

    const { messages, systemPrompt, sessionId, tools } = req.body as {
      messages: unknown[];
      systemPrompt?: string;
      sessionId?: string;
      tools?: unknown[];
    };

    if (!messages || !Array.isArray(messages)) {
      return reply.status(400).send({ error: "messages array is required" });
    }

    try {
      const result = await proxyDeepSeek(messages, systemPrompt, tools);

      // Track token usage for the session
      if (sessionId) {
        await creditService.updateSessionTokens(sessionId, result.inputTokens + result.outputTokens, 1);
      }

      // Consume credits (async, don't fail the response on credit error)
      try {
        await creditService.consumeCredits(userId, sessionId || "adhoc", {
          [config.DEEPSEEK_MODEL]: {
            model: config.DEEPSEEK_MODEL,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          },
        });
      } catch (err: any) {
        console.error("[LLM Proxy] Credit consumption failed:", err.message);
      }

      return reply.send({
        content: result.content,
        model: config.DEEPSEEK_MODEL,
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
        toolCalls: result.toolCalls,
      });
    } catch (err: any) {
      console.error("[LLM Proxy] DeepSeek call failed:", err.message);
      return reply.status(502).send({ error: `AI service unavailable: ${err.message}` });
    }
  });

  /** POST /assistant/vision — Phone agent screen understanding (QwenVL) */
  app.post("/api/v1/assistant/vision", async (req, reply) => {
    const userId = (req as any).user?.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    // Credit check
    const enough = await creditService.hasEnoughCredits(userId, MIN_CREDITS_FOR_VISION);
    if (!enough) {
      return reply.status(402).send({
        error: "Insufficient credits",
        minRequired: MIN_CREDITS_FOR_VISION,
        code: "INSUFFICIENT_CREDITS",
      });
    }

    if (!config.DASHSCOPE_API_KEY) {
      return reply.status(503).send({ error: "QwenVL API not configured" });
    }

    const { messages, sessionId } = req.body as {
      messages: unknown[];
      sessionId?: string;
    };

    if (!messages || !Array.isArray(messages)) {
      return reply.status(400).send({ error: "messages array is required" });
    }

    try {
      const result = await proxyQwenVL(messages);

      if (sessionId) {
        await creditService.updateSessionTokens(sessionId, result.inputTokens + result.outputTokens, 1);
      }

      try {
        await creditService.consumeCredits(userId, sessionId || "adhoc", {
          [config.DASHSCOPE_VL_MODEL]: {
            model: config.DASHSCOPE_VL_MODEL,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          },
        });
      } catch (err: any) {
        console.error("[LLM Proxy] Credit consumption failed:", err.message);
      }

      return reply.send({
        content: result.content,
        model: config.DASHSCOPE_VL_MODEL,
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      });
    } catch (err: any) {
      console.error("[LLM Proxy] QwenVL call failed:", err.message);
      return reply.status(502).send({ error: `AI service unavailable: ${err.message}` });
    }
  });
}
