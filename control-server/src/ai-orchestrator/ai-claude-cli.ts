/**
 * AiClaudeCli — Claude Code 与 VPS DeepSeek 的桥接 CLI 工具。
 *
 * 运行在本地开发机，让 Claude Code 可以通过 Bash 工具委托任务给
 * VPS 上的 DeepSeek Agent Worker 执行。
 *
 * 用法：
 *   # 执行 shell 命令
 *   npx tsx ai-claude-cli.ts exec "npm install" --cwd D:\phonefarm-relay
 *
 *   # 写入文件
 *   npx tsx ai-claude-cli.ts write "config\app.json" --content '{"port": 8080}'
 *
 *   # 读取文件
 *   npx tsx ai-claude-cli.ts read "config\app.json"
 *
 *   # 列出目录
 *   npx tsx ai-claude-cli.ts ls "D:\phonefarm-relay\src"
 *
 *   # 让 DeepSeek 自主分析和执行
 *   npx tsx ai-claude-cli.ts analyze "部署 nginx 反向代理到 localhost:8499"
 *
 *   # JSON 模式 — 多步骤任务
 *   npx tsx ai-claude-cli.ts plan --file task-plan.json
 *   npx tsx ai-claude-cli.ts plan --json '{"title":"...","steps":[...]}'
 *
 *   # 查看 VPS worker 状态
 *   npx tsx ai-claude-cli.ts status
 *
 * 环境变量（可选，也有 CLI 参数）：
 *   AI_BRIDGE_URL=ws://vps-ip:80/ws/ai/control
 *   AI_AUTH_TOKEN=<与 VPS AI_AUTH_TOKEN 一致>
 */

import "dotenv/config";
import { WebSocket } from "ws";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import type { AiMessage, AiTaskAssignPayload } from "./types";

// ── Parse CLI Args ──

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  // Also check --name=value format
  const found = args.find(a => a.startsWith(`--${name}=`));
  if (found) return found.split("=")[1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`) || args.includes(`-${name[0]}`);
}

const subcommand = args[0];
const target = args[1];

// ── Config ──

const BRIDGE_URL = getArg("bridge-url") || process.env.AI_BRIDGE_URL || "ws://127.0.0.1:8499/ws/ai/control";
const AUTH_TOKEN = getArg("token") || process.env.AI_AUTH_TOKEN || "ai-worker-token-change-me";
const TIMEOUT_MS = parseInt(getArg("timeout") || "600000"); // 10 min default

// ── Help ──

function printHelp(): void {
  console.log(`
PhoneFarm AI Orchestrator — Claude Code ↔ DeepSeek Bridge
==========================================================

USAGE:
  npx tsx ai-claude-cli.ts <command> [target] [options]

COMMANDS:
  exec <command>      Execute a shell command on VPS
  write <path>        Write a file on VPS (--content or --file)
  read <path>         Read a file from VPS
  ls <path>           List directory on VPS
  analyze <prompt>    Let DeepSeek analyze and decide actions
  plan                Execute a multi-step plan (--file or --json)
  status              Show connected workers and pending tasks

OPTIONS:
  --cwd <dir>         Working directory (default: D:\\phonefarm-relay)
  --content <text>    File content for write command
  --file <path>       Read task plan from local JSON file
  --json <json>       Inline JSON task plan
  --bridge-url <url>  VPS BridgeServer WebSocket URL
  --token <token>     AI auth token
  --timeout <ms>      Task timeout in ms (default: 600000)
  --require-approval  Ask for approval before executing
  --help, -h          Show this help

EXAMPLES:
  # Simple command
  npx tsx ai-claude-cli.ts exec "npm install"

  # Write a file
  npx tsx ai-claude-cli.ts write "nginx.conf" --content "$(cat nginx.conf)"

  # Let DeepSeek figure out the deployment
  npx tsx ai-claude-cli.ts analyze "Install and configure nginx on this Windows VPS"

  # Multi-step plan from file
  npx tsx ai-claude-cli.ts plan --file deploy-plan.json

ENVIRONMENT VARIABLES:
  AI_BRIDGE_URL    VPS BridgeServer WebSocket URL
  AI_AUTH_TOKEN    AI auth token (must match VPS AI_AUTH_TOKEN)
`);
  process.exit(0);
}

if (hasFlag("help") || !subcommand) {
  printHelp();
}

// ── Connection ──

function connectAndSend(payload: AiTaskAssignPayload): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BRIDGE_URL);
    let taskCompleted = false;
    const timeout = setTimeout(() => {
      if (!taskCompleted) {
        ws.close();
        reject(new Error(`Task timed out after ${TIMEOUT_MS}ms`));
      }
    }, TIMEOUT_MS);

    ws.on("open", () => {
      // Send task
      const msg: AiMessage = {
        type: "ai_task_assign",
        msgId: randomUUID(),
        taskId: randomUUID(),
        from: {
          role: "claude-code",
          instanceId: "claude-cli",
          label: "Claude Code CLI",
          capabilities: ["deploy_orchestrate"],
        },
        ts: new Date().toISOString(),
        payload,
      };
      ws.send(JSON.stringify(msg));
    });

    ws.on("message", (raw) => {
      try {
        const msg: AiMessage = JSON.parse(raw.toString());
        switch (msg.type) {
          case "ai_task_accept":
            console.log(`✓ Task accepted by ${msg.from.label || msg.from.instanceId}`);
            break;

          case "ai_task_progress": {
            const p = msg.payload as any;
            const icon = p.status === "failed" ? "✗" : p.status === "completed" ? "✓" : "↻";
            console.log(`  ${icon} [${p.percent ?? "?"}%] ${p.currentStep || ""}`);
            break;
          }

          case "ai_stream_chunk": {
            const p = msg.payload as any;
            if (p.channel === "stderr") {
              process.stderr.write(p.content);
            } else if (p.channel === "thinking") {
              console.log(`  [DeepSeek] ${p.content}`);
            } else {
              process.stdout.write(p.content);
            }
            break;
          }

          case "ai_task_complete": {
            const p = msg.payload as any;
            taskCompleted = true;
            clearTimeout(timeout);
            console.log(`\n✓ Task completed: ${p.summary}`);
            if (p.suggestions?.length) {
              console.log("\nSuggestions:");
              for (const s of p.suggestions) console.log(`  • ${s}`);
            }
            if (p.artifacts?.length) {
              console.log("\nArtifacts:");
              for (const a of p.artifacts) console.log(`  • ${a.path} (${a.summary || a.type})`);
            }
            ws.close();
            resolve();
            break;
          }

          case "ai_task_failed": {
            const p = msg.payload as any;
            taskCompleted = true;
            clearTimeout(timeout);
            console.error(`\n✗ Task failed: ${p.summary}`);
            ws.close();
            reject(new Error(p.summary));
            break;
          }

          case "ai_approval_req": {
            const p = msg.payload as any;
            console.log(`\n⚠ APPROVAL REQUIRED: ${p.action}`);
            console.log(`  Risk: ${p.risk}`);
            if (p.affectedFiles?.length) {
              console.log(`  Files: ${p.affectedFiles.join(", ")}`);
            }
            // Auto-approve if not requiring approval, otherwise prompt
            if (hasFlag("require-approval")) {
              console.log("  Type 'yes' to approve: ");
              // In non-interactive mode, reject
              ws.send(JSON.stringify({
                type: "ai_approval_res",
                msgId: randomUUID(),
                taskId: msg.taskId,
                from: msg.from,
                ts: new Date().toISOString(),
                payload: { approvalId: p.approvalId, approved: false, note: "Non-interactive mode — auto rejected" },
              }));
            } else {
              ws.send(JSON.stringify({
                type: "ai_approval_res",
                msgId: randomUUID(),
                taskId: msg.taskId,
                from: msg.from,
                ts: new Date().toISOString(),
                payload: { approvalId: p.approvalId, approved: true, note: "Auto approved by Claude Code" },
              }));
            }
            break;
          }
        }
      } catch { /* ignore */ }
    });

    ws.on("close", () => {
      if (!taskCompleted) {
        clearTimeout(timeout);
        reject(new Error("Connection closed before task completion"));
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${err.message}`));
    });
  });
}

// ── Subcommand Handlers ──

async function main(): Promise<void> {
  const cwd = getArg("cwd") || process.env.WORKER_WORKING_DIR || "D:\\phonefarm-relay";

  switch (subcommand) {
    // ---- exec ----
    case "exec":
    case "run": {
      if (!target) {
        console.error("Usage: ai-claude-cli.ts exec <command> [--cwd <dir>]");
        process.exit(1);
      }
      await connectAndSend({
        title: `Execute: ${target.slice(0, 80)}`,
        description: `Execute the following shell command: ${target}`,
        action: "execute_command",
        params: { command: target, workingDir: cwd, timeoutMs: TIMEOUT_MS },
      });
      break;
    }

    // ---- write ----
    case "write":
    case "put": {
      if (!target) {
        console.error("Usage: ai-claude-cli.ts write <path> --content <text> [--cwd <dir>]");
        process.exit(1);
      }
      let content = getArg("content") || "";
      const filePath = getArg("file");
      if (filePath && existsSync(filePath)) {
        content = readFileSync(filePath, "utf-8");
      }
      if (!content) {
        console.error("Error: --content or --file required for write command");
        process.exit(1);
      }
      await connectAndSend({
        title: `Write file: ${target}`,
        description: `Write content to file: ${target}`,
        action: "write_file",
        params: { filePath: target, fileContent: content, workingDir: cwd },
      });
      break;
    }

    // ---- read ----
    case "read":
    case "get": {
      if (!target) {
        console.error("Usage: ai-claude-cli.ts read <path> [--cwd <dir>]");
        process.exit(1);
      }
      await connectAndSend({
        title: `Read file: ${target}`,
        description: `Read file: ${target}`,
        action: "read_file",
        params: { readPath: target, workingDir: cwd },
      });
      break;
    }

    // ---- ls ----
    case "ls":
    case "list":
    case "dir": {
      const listPath = target || ".";
      await connectAndSend({
        title: `List directory: ${listPath}`,
        description: `List directory contents: ${listPath}`,
        action: "list_directory",
        params: { listPath, workingDir: cwd },
      });
      break;
    }

    // ---- analyze ----
    case "analyze":
    case "ask":
    case "ai": {
      if (!target) {
        console.error("Usage: ai-claude-cli.ts analyze <prompt> [--cwd <dir>]");
        process.exit(1);
      }
      console.log(`Sending to DeepSeek: "${target}"\n`);
      await connectAndSend({
        title: `Analyze: ${target.slice(0, 80)}`,
        description: target,
        action: "analyze_and_decide",
        params: {
          workingDir: cwd,
          requireApproval: hasFlag("require-approval"),
        },
      });
      break;
    }

    // ---- plan ----
    case "plan": {
      let planJson = getArg("json") || "";
      const planFile = getArg("file");
      if (planFile && existsSync(planFile)) {
        planJson = readFileSync(planFile, "utf-8");
      }
      if (!planJson) {
        console.error("Error: --file <path> or --json <json> required for plan command");
        process.exit(1);
      }

      const plan = JSON.parse(planJson);
      await connectAndSend({
        title: plan.title || "Multi-step deployment plan",
        description: plan.description || "Execute the following deployment plan",
        action: "multi_step_plan",
        steps: plan.steps || [],
        params: { workingDir: cwd, requireApproval: hasFlag("require-approval") },
      });
      break;
    }

    // ---- status ----
    case "status":
    case "workers":
    case "ping": {
      console.log(`Connecting to ${BRIDGE_URL}...`);
      const ws = new WebSocket(BRIDGE_URL);
      ws.on("open", () => {
        ws.send(JSON.stringify({
          type: "ai_ping",
          msgId: randomUUID(),
          taskId: randomUUID(),
          from: {
            role: "claude-code",
            instanceId: "claude-cli",
            label: "Claude Code CLI",
            capabilities: ["deploy_orchestrate"],
          },
          ts: new Date().toISOString(),
          payload: {},
        }));
      });
      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "ai_pong") {
            const workers = msg.payload?.workers || [];
            console.log(`\nConnected workers: ${workers.length}`);
            for (const w of workers) {
              console.log(`  • ${w.identity?.label || w.identity?.instanceId} [${w.online ? "ONLINE" : "OFFLINE"}]`);
              if (w.currentTask) console.log(`    Current task: ${w.currentTask}`);
              console.log(`    Since: ${w.connectedAt}`);
            }
            ws.close();
            process.exit(0);
          }
        } catch { /* */ }
      });
      setTimeout(() => { console.log("No response from server"); process.exit(1); }, 5000);
      break;
    }

    default:
      console.error(`Unknown command: ${subcommand}`);
      printHelp();
  }
}

main().catch((err) => {
  console.error(`\nFatal: ${err.message}`);
  process.exit(1);
});
