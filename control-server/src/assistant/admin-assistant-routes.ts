/**
 * Admin AI Assistant Routes — Chat endpoint with tool-calling loop.
 *
 * POST   /api/v1/admin/assistant/chat       — Main chat (DeepSeek + tool execution loop)
 * GET    /api/v1/admin/assistant/sessions    — List user's sessions
 * GET    /api/v1/admin/assistant/sessions/:id — Get session detail
 * DELETE /api/v1/admin/assistant/sessions/:id — Delete session
 */
import type { FastifyInstance } from "fastify";
import { eq, desc, and, sql } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db.js";
import { assistantSessions } from "../schema.js";
import { requireAuth } from "../auth/auth-middleware.js";
import { ADMIN_TOOLS, ADMIN_SYSTEM_PROMPT, type AdminToolDef } from "./admin-assistant-tools.js";
import { executeToolCall } from "./admin-assistant-executor.js";
import type { ToolCallInput, ToolCallResult } from "./admin-assistant-executor.js";

const MAX_TOOL_LOOP_ITERATIONS = 15;

/** Tools available per role */
const ADMIN_ROLE_TOOLS: Record<string, string[]> = {
  super_admin: ADMIN_TOOLS.map((t) => t.name),
  admin: [
    "user_management", "tenant_user_management", "device_management",
    "device_group_management", "task_management", "activation_management",
    "billing_management", "config_management", "system_status",
    "stats_management", "alert_management", "vlm_management",
    "audit_management", "platform_account_management", "account_management",
    "credit_management", "webhook_management",
  ],
};

/** Direct DeepSeek call — Anthropic Messages API */
async function callDeepSeek(
  messages: unknown[],
  tools: AdminToolDef[],
): Promise<{
  content: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
}> {
  const body: Record<string, unknown> = {
    model: config.DEEPSEEK_MODEL,
    messages,
    max_tokens: 1024,
    temperature: 0.1,
    system: ADMIN_SYSTEM_PROMPT,
  };
  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
  }

  const resp = await fetch(`${config.DEEPSEEK_API_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.DEEPSEEK_API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`DeepSeek API error ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = (await resp.json()) as any;
  if (!data || !Array.isArray(data.content)) {
    throw new Error("DeepSeek 返回格式异常: content 不是数组");
  }
  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;

  const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
  let content = "";

  for (const block of data.content) {
    if (block?.type === "tool_use") {
      toolCalls.push({ id: block.id, name: block.name, input: block.input ?? {} });
    } else if (block?.type === "text") {
      content += block.text ?? "";
    }
  }

  return { content, inputTokens, outputTokens, toolCalls };
}

/** Format tool result as Anthropic tool_result content blocks */
function formatToolResults(results: Map<string, ToolCallResult>): unknown[] {
  const blocks: unknown[] = [];
  for (const [id, r] of results) {
    blocks.push({
      type: "tool_result",
      tool_use_id: id,
      content: r.summary,
    });
  }
  return blocks;
}

export async function adminAssistantRoutes(app: FastifyInstance, authService: any): Promise<void> {

  const requireAdmin = async (req: any, reply: any) => {
    const role = req.user?.role;
    if (role !== "super_admin" && role !== "admin") {
      return reply.status(403).send({ error: "仅管理员可使用 AI 助手" });
    }
  };

  // ── POST /api/v1/admin/assistant/chat ──
  app.post(
    "/api/v1/admin/assistant/chat",
    { preHandler: [requireAuth(authService), requireAdmin] },
    async (req, reply) => {
      const user = (req as any).user;
      if (!user?.userId) return reply.status(401).send({ error: "Unauthorized" });

      if (!config.DEEPSEEK_API_KEY) {
        return reply.status(503).send({ error: "DeepSeek API 未配置，请在 .env 中设置 DEEPSEEK_API_KEY" });
      }

      const { messages, sessionId } = req.body as {
        messages: Array<{ role: string; content: string | unknown[] }>;
        sessionId?: string;
      };

      if (!messages || !Array.isArray(messages)) {
        return reply.status(400).send({ error: "messages 数组为必填项" });
      }

      // Filter tools by role
      const allowedToolNames = ADMIN_ROLE_TOOLS[user.role] || ADMIN_ROLE_TOOLS.admin;
      const availableTools = ADMIN_TOOLS.filter((t) => allowedToolNames.includes(t.name));

      try {
        // Convert frontend messages to Anthropic format (content can be string or blocks[])
        const apiMessages: Array<{ role: string; content: unknown }> = messages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        }));

        const allToolCalls: Array<{
          id: string;
          name: string;
          input: Record<string, unknown>;
          output?: ToolCallResult;
        }> = [];

        // Tool calling loop
        let currentMessages = [...apiMessages];
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        const loopStart = Date.now();
        const LOOP_TIMEOUT_MS = 60_000;

        for (let i = 0; i < MAX_TOOL_LOOP_ITERATIONS; i++) {
          if (Date.now() - loopStart > LOOP_TIMEOUT_MS) {
            return reply.send({
              content: "操作超时，已完成部分操作。请继续指示以完成剩余操作。",
              toolCalls: allToolCalls,
              usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
              sessionId,
            });
          }
          const result = await callDeepSeek(currentMessages, availableTools);
          totalInputTokens += result.inputTokens;
          totalOutputTokens += result.outputTokens;

          // No tool calls — return final text response
          if (result.toolCalls.length === 0) {
            // Save to session
            const msgHistory = [
              ...messages,
              { role: "assistant", content: result.content, toolCalls: allToolCalls },
            ];

            if (sessionId) {
              await db
                .update(assistantSessions)
                .set({
                  totalTokens: sql`${assistantSessions.totalTokens} + ${totalInputTokens + totalOutputTokens}`,
                  totalSteps: sql`${assistantSessions.totalSteps} + 1`,
                  endedAt: new Date(),
                })
                .where(eq(assistantSessions.id, sessionId))
                .catch(() => {}); // non-critical
            }

            return reply.send({
              content: result.content,
              toolCalls: allToolCalls,
              usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
              sessionId,
            });
          }

          // Execute tool calls
          const toolResults = new Map<string, ToolCallResult>();
          for (const tc of result.toolCalls) {
            try {
              const res = await executeToolCall(tc.name, tc.input as ToolCallInput, {
                userId: user.userId,
                role: user.role,
                tenantId: user.tenantId,
                app,
              });
              toolResults.set(tc.id, res);
              allToolCalls.push({ ...tc, output: res });
            } catch (err: any) {
              toolResults.set(tc.id, {
                success: false,
                result: null,
                error: err.message,
                summary: `工具调用失败: ${err.message}`,
              });
            }
          }

          // Add assistant message (with tool_use blocks) and tool results to conversation
          const toolUseBlocks = result.toolCalls.map((tc) => ({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.input,
          }));

          currentMessages.push({
            role: "assistant",
            content: result.content
              ? [{ type: "text", text: result.content }, ...toolUseBlocks]
              : toolUseBlocks,
          } as any);

          currentMessages.push({
            role: "user",
            content: formatToolResults(toolResults),
          } as any);
        }

        // Max iterations reached
        return reply.send({
          content: "操作步骤较多，已完成部分操作。请继续指示以完成剩余操作。",
          toolCalls: allToolCalls,
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
          sessionId,
        });
      } catch (err: any) {
        console.error("[AdminAssistant] Chat error:", err.message);
        return reply.status(502).send({ error: `AI 服务不可用: ${err.message}` });
      }
    },
  );

  // ── GET /api/v1/admin/assistant/sessions ──
  app.get(
    "/api/v1/admin/assistant/sessions",
    { preHandler: [requireAuth(authService), requireAdmin] },
    async (req) => {
      const user = (req as any).user;
      const rows = await db
        .select({
          id: assistantSessions.id,
          title: assistantSessions.title,
          updatedAt: assistantSessions.endedAt,
          tokensUsed: assistantSessions.totalTokens,
        })
        .from(assistantSessions)
        .where(eq(assistantSessions.userId, user.userId))
        .orderBy(desc(assistantSessions.endedAt))
        .limit(50);

      return { sessions: rows };
    },
  );

  // ── GET /api/v1/admin/assistant/sessions/:id ──
  app.get(
    "/api/v1/admin/assistant/sessions/:id",
    { preHandler: [requireAuth(authService), requireAdmin] },
    async (req, reply) => {
      const user = (req as any).user;
      const { id } = req.params as { id: string };

      const row = await db
        .select()
        .from(assistantSessions)
        .where(and(eq(assistantSessions.id, id), eq(assistantSessions.userId, user.userId)))
        .limit(1);

      if (!row[0]) return reply.status(404).send({ error: "会话不存在" });
      return row[0];
    },
  );

  // ── DELETE /api/v1/admin/assistant/sessions/:id ──
  app.delete(
    "/api/v1/admin/assistant/sessions/:id",
    { preHandler: [requireAuth(authService), requireAdmin] },
    async (req, reply) => {
      const user = (req as any).user;
      const { id } = req.params as { id: string };

      const result = await db
        .delete(assistantSessions)
        .where(and(eq(assistantSessions.id, id), eq(assistantSessions.userId, user.userId)));

      if (result.rowCount === 0) {
        return reply.status(404).send({ error: "会话不存在或无权删除" });
      }
      return { ok: true };
    },
  );
}
