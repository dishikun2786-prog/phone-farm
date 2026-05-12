/**
 * AiDeepSeekWorker — DeepSeek AI Agent 运行时 (VPS 端)。
 *
 * 对应 Autogen 架构中的 "GRPC Runtime" + "RoutedAgent"。
 *
 * 职责：
 *   1. 连接 BridgeServer (:8499/ws/ai/worker)，注册为 DeepSeek Agent
 *   2. 接收 Claude Code 发来的任务
 *   3. 调用 DeepSeek API 进行智能决策（复杂任务）
 *   4. 执行 shell 命令 / 文件操作
 *   5. 实时流式回报 stdout/stderr 到 Claude Code
 *
 * 启动方式：
 *   npx tsx src/ai-orchestrator/ai-deepseek-worker.ts
 *   或通过 PM2 管理
 *
 * 环境变量：
 *   AI_BRIDGE_URL=ws://127.0.0.1:8499/ws/ai/worker
 *   AI_AUTH_TOKEN=<与 BridgeServer 一致>
 *   DEEPSEEK_API_KEY=sk-xxx
 *   DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
 *   DEEPSEEK_MODEL=deepseek-chat
 *   WORKER_WORKING_DIR=D:\phonefarm-relay
 */

import "dotenv/config";
import { WebSocket } from "ws";
import { randomUUID } from "crypto";
import { spawn, execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import type { AiMessage, AgentIdentity, AiTaskAssignPayload, AiStreamChunkPayload } from "./types";

// ── Config ──

const BRIDGE_URL = process.env.AI_BRIDGE_URL || "ws://127.0.0.1:8499/ws/ai/worker";
const AUTH_TOKEN = process.env.AI_AUTH_TOKEN || "ai-worker-token-change-me";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const WORKING_DIR = process.env.WORKER_WORKING_DIR || process.cwd();
const WORKER_ID = process.env.WORKER_INSTANCE_ID || `deepseek-worker-${randomUUID().slice(0, 8)}`;
const WORKER_LABEL = process.env.WORKER_LABEL || "DeepSeek VPS Agent";

// ── Identity ──

const identity: AgentIdentity = {
  role: "deepseek-worker",
  instanceId: WORKER_ID,
  label: WORKER_LABEL,
  capabilities: [
    "shell_exec",
    "file_write",
    "file_read",
    "file_list",
    "npm_exec",
    "git_exec",
    "docker_exec",
    "http_fetch",
    "code_analyze",
  ],
};

// ── State ──

let ws: WebSocket;
let connected = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// ── Main ──

function connect(): void {
  if (ws) {
    try { ws.close(); } catch { /* */ }
  }

  console.log(`[DeepSeekWorker] Connecting to ${BRIDGE_URL}...`);
  ws = new WebSocket(BRIDGE_URL);

  ws.on("open", () => {
    console.log("[DeepSeekWorker] WebSocket connected, sending handshake...");
    ws.send(JSON.stringify({
      type: "ai_handshake",
      msgId: randomUUID(),
      from: identity,
      ts: new Date().toISOString(),
      payload: {
        agent: identity,
        token: AUTH_TOKEN,
      },
    }));
  });

  ws.on("message", (raw) => {
    try {
      const msg: AiMessage = JSON.parse(raw.toString());
      handleMessage(msg);
    } catch {
      // Binary or malformed — ignore
    }
  });

  ws.on("close", (code) => {
    connected = false;
    console.log(`[DeepSeekWorker] Disconnected (code: ${code})`);
    scheduleReconnect();
  });

  ws.on("error", (err) => {
    console.error(`[DeepSeekWorker] Error: ${err.message}`);
    // close will fire next
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = Math.min(2000 * Math.pow(2, reconnectAttempts), 60000);
  reconnectAttempts++;
  console.log(`[DeepSeekWorker] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
  reconnectTimer = setTimeout(connect, delay);
}

// ── Message Handler ──

async function handleMessage(msg: AiMessage): Promise<void> {
  switch (msg.type) {
    case "ai_handshake_ack": {
      const p = msg.payload as any;
      if (p.success) {
        connected = true;
        reconnectAttempts = 0;
        console.log(`[DeepSeekWorker] Authenticated as ${identity.instanceId}`);
      } else {
        console.error(`[DeepSeekWorker] Auth failed: ${p.error}`);
        process.exit(1);
      }
      break;
    }

    case "ai_task_assign": {
      await handleTaskAssign(msg);
      break;
    }

    case "ai_approval_res": {
      // Approval response — handled by task execution context
      console.log(`[DeepSeekWorker] Approval response for task ${msg.taskId}`);
      break;
    }

    case "ai_ping": {
      sendToBridge({
        type: "ai_pong",
        msgId: randomUUID(),
        taskId: msg.taskId,
        from: identity,
        ts: new Date().toISOString(),
        payload: { uptime: process.uptime() },
      });
      break;
    }
  }
}

// ── Task Execution ──

async function handleTaskAssign(msg: AiMessage): Promise<void> {
  const taskId = msg.taskId!;
  const payload = msg.payload as AiTaskAssignPayload;

  console.log(`[DeepSeekWorker] Task received: ${taskId} — "${payload.title}"`);

  // Accept task
  sendToBridge({
    type: "ai_task_accept",
    msgId: randomUUID(),
    taskId,
    from: identity,
    ts: new Date().toISOString(),
    payload: { status: "accepted", currentStep: "Task accepted, preparing execution..." },
  });

  try {
    // Determine execution strategy
    if (payload.action === "multi_step_plan" && payload.steps) {
      await executeMultiStep(taskId, payload);
    } else if (payload.action === "analyze_and_decide") {
      await executeWithDeepSeekReasoning(taskId, payload);
    } else {
      await executeDirectAction(taskId, payload);
    }
  } catch (err: any) {
    sendToBridge({
      type: "ai_task_failed",
      msgId: randomUUID(),
      taskId,
      from: identity,
      ts: new Date().toISOString(),
      payload: {
        success: false,
        summary: `Task failed: ${err.message}`,
        exitCode: -1,
      },
    });
  }
}

// ── Direct Action Execution ──

async function executeDirectAction(taskId: string, payload: AiTaskAssignPayload): Promise<void> {
  const { action, params } = payload;

  sendProgress(taskId, "running", 10, `Executing: ${action}`);

  switch (action) {
    case "execute_command": {
      if (!params.command) throw new Error("No command specified");
      await executeShell(taskId, params.command, params.workingDir || WORKING_DIR, params.timeoutMs || 300000);
      break;
    }

    case "write_file": {
      if (!params.filePath || params.fileContent === undefined) throw new Error("No filePath or fileContent");
      const fullPath = join(WORKING_DIR, params.filePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, params.fileContent, "utf-8");
      sendProgress(taskId, "running", 80, `File written: ${params.filePath}`);
      break;
    }

    case "read_file": {
      if (!params.readPath) throw new Error("No readPath");
      const fullPath = join(WORKING_DIR, params.readPath);
      const content = readFileSync(fullPath, "utf-8");
      sendStream(taskId, "stdout", content, true);
      break;
    }

    case "list_directory": {
      const listPath = params.listPath || ".";
      const fullPath = join(WORKING_DIR, listPath);
      const entries = readdirSync(fullPath).map(name => {
        const p = join(fullPath, name);
        const st = statSync(p);
        return {
          name,
          path: join(listPath, name),
          type: (st.isDirectory() ? "directory" : "file") as "file" | "directory",
          size: st.size,
          modifiedAt: st.mtime.toISOString(),
        };
      });
      sendToBridge({
        type: "ai_file_res",
        msgId: randomUUID(),
        taskId,
        from: identity,
        ts: new Date().toISOString(),
        payload: { action: "list", path: listPath, entries },
      });
      break;
    }

    default:
      throw new Error(`Unsupported action: ${action}`);
  }

  // Complete
  sendToBridge({
    type: "ai_task_complete",
    msgId: randomUUID(),
    taskId,
    from: identity,
    ts: new Date().toISOString(),
    payload: {
      success: true,
      summary: `Action "${action}" completed successfully`,
    },
  });
}

// ── Shell Execution with Streaming ──

async function executeShell(
  taskId: string,
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    sendProgress(taskId, "running", 20, `Running: ${command}`);

    // Use PowerShell on Windows, bash on Unix
    const isWin = process.platform === "win32";
    const shell = isWin ? "powershell.exe" : "/bin/bash";
    const shellArgs = isWin ? ["-Command", command] : ["-c", command];

    const child = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      sendStream(taskId, "stdout", text, false);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      sendStream(taskId, "stderr", text, false);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      sendStream(taskId, "stdout", `\n[Exit code: ${code}]\n`, true);
      sendProgress(taskId, "running", 90, `Command finished with exit code ${code}`);
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ── DeepSeek Reasoning (for complex tasks) ──

async function executeWithDeepSeekReasoning(taskId: string, payload: AiTaskAssignPayload): Promise<void> {
  if (!DEEPSEEK_API_KEY) {
    // Fallback: treat as direct command
    sendProgress(taskId, "running", 0, "DeepSeek API not configured, executing directly...");
    await executeDirectAction(taskId, payload);
    return;
  }

  sendProgress(taskId, "running", 5, "Asking DeepSeek to analyze task...");

  const systemPrompt = `You are a deployment automation agent on a Windows VPS.
Your job is to execute the user's task by deciding which commands to run.
Available capabilities: shell commands (PowerShell), file operations, npm, git, docker.

Working directory: ${WORKING_DIR}

Respond with a JSON object:
{
  "thinking": "your reasoning",
  "commands": ["command1", "command2"],
  "files": [{"path": "relative/path", "content": "file content"}],
  "summary": "what you did"
}`;

  const response = await callDeepSeek(systemPrompt, payload.description);

  // Send thinking to Claude
  if (response.thinking) {
    sendStream(taskId, "thinking", response.thinking, false);
  }

  // Execute commands
  if (response.commands?.length) {
    for (let i = 0; i < response.commands.length; i++) {
      const cmd = response.commands[i];
      sendProgress(taskId, "running", 20 + (i / response.commands.length) * 60, `[${i + 1}/${response.commands.length}] ${cmd}`);
      try {
        await executeShell(taskId, cmd, WORKING_DIR, 300000);
      } catch (err: any) {
        // Report error but continue with next commands
        sendStream(taskId, "stderr", `Command failed: ${err.message}`, false);
      }
    }
  }

  // Write files
  if (response.files?.length) {
    for (const f of response.files) {
      const fullPath = join(WORKING_DIR, f.path);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, f.content, "utf-8");
      sendStream(taskId, "log", `File written: ${f.path}`, false);
    }
  }

  sendToBridge({
    type: "ai_task_complete",
    msgId: randomUUID(),
    taskId,
    from: identity,
    ts: new Date().toISOString(),
    payload: {
      success: true,
      summary: response.summary || "Task executed with DeepSeek reasoning",
      suggestions: response.suggestions,
    },
  });
}

// ── Multi-Step Plan Execution ──

async function executeMultiStep(taskId: string, payload: AiTaskAssignPayload): Promise<void> {
  const steps = payload.steps!.sort((a, b) => a.order - b.order);
  const results: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const percent = 10 + (i / steps.length) * 80;

    sendProgress(taskId, "running", percent, `Step ${i + 1}/${steps.length}: ${step.description}`);

    // Check dependency
    if (step.dependsOn) {
      const depResult = results[step.dependsOn - 1];
      if (depResult?.includes("FAILED")) {
        sendStream(taskId, "stderr", `Skipping step ${i + 1}: dependency step ${step.dependsOn} failed`, false);
        continue;
      }
    }

    // Execute step
    const stepPayload: AiTaskAssignPayload = {
      ...payload,
      action: step.action,
      params: step.params,
    };

    await executeDirectAction(taskId, stepPayload);
  }

  sendToBridge({
    type: "ai_task_complete",
    msgId: randomUUID(),
    taskId,
    from: identity,
    ts: new Date().toISOString(),
    payload: {
      success: true,
      summary: `All ${steps.length} steps completed`,
    },
  });
}

// ── DeepSeek API Client ──

async function callDeepSeek(
  systemPrompt: string,
  userMessage: string,
): Promise<{
  thinking?: string;
  commands?: string[];
  files?: { path: string; content: string }[];
  summary?: string;
  suggestions?: string[];
}> {
  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    throw new Error(`DeepSeek API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as any;
  const text = data.choices?.[0]?.message?.content || "";

  // Try to extract JSON from response
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch { /* not JSON, return as thinking */ }

  return { thinking: text, summary: text };
}

// ── Helpers ──

function sendToBridge(msg: AiMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(msg)); } catch { /* */ }
  }
}

function sendProgress(taskId: string, status: string, percent: number, currentStep: string): void {
  sendToBridge({
    type: "ai_task_progress",
    msgId: randomUUID(),
    taskId,
    from: identity,
    ts: new Date().toISOString(),
    payload: { status, percent, currentStep } as any,
  });
}

function sendStream(taskId: string, channel: AiStreamChunkPayload["channel"], content: string, isLast: boolean): void {
  sendToBridge({
    type: "ai_stream_chunk",
    msgId: randomUUID(),
    taskId,
    from: identity,
    ts: new Date().toISOString(),
    payload: { channel, content, isLast } as AiStreamChunkPayload,
  });
}

// ── Start ──

console.log(`[DeepSeekWorker] Starting...`);
console.log(`  Bridge:    ${BRIDGE_URL}`);
console.log(`  Worker ID: ${WORKER_ID}`);
console.log(`  Label:     ${WORKER_LABEL}`);
console.log(`  DeepSeek:  ${DEEPSEEK_API_KEY ? "enabled" : "disabled (no API key)"}`);
console.log(`  Work Dir:  ${WORKING_DIR}`);

connect();

// Keep alive
process.on("SIGINT", () => {
  console.log("[DeepSeekWorker] Shutting down...");
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) { try { ws.close(); } catch { /* */ } }
  process.exit(0);
});
