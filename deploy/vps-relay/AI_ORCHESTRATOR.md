# PhoneFarm 分布式 AI 协同部署系统

> 架构参考: Microsoft Autogen v0.4+ Distributed Agent Runtime (gRPC Host 模式)
> 传输层: PhoneFarm BridgeServer WebSocket (等效 gRPC bidirectional stream)

## 架构

```
┌─── 本地开发机 ───────────────────────────────────────────┐
│                                                          │
│  Claude Code (IDE AI)                                    │
│       │                                                  │
│       ▼                                                  │
│  ai-claude-cli.ts  ───────┐                              │
│  (任务编排 + 进度监控)      │                              │
│                           │ 出站 WebSocket               │
│                           │ 连接到 VPS :80               │
└───────────────────────────┼──────────────────────────────┘
                            │
                            ▼
┌─── 公网 VPS — BridgeServer ──────────────────────────────┐
│                                                          │
│  Nginx :80/:443                                          │
│    ├─ /ws/control     → 本地控制隧道                     │
│    ├─ /ws/phone       → 手机设备                         │
│    ├─ /ws/frontend    → Dashboard                        │
│    ├─ /ws/ai/worker   → DeepSeek Agent 接入点 ★          │
│    └─ /ws/ai/control  → Claude Code CLI 接入点 ★         │
│                                                          │
│  BridgeServer :8499                                      │
│    ├─ 手机/前端/控制 消息路由                             │
│    ├─ AiBridgeRouter  ← 分布式 AI 消息路由 ★              │
│    └─ UDP Relay :8444                                    │
│                                                          │
│  AiDeepSeekWorker (本地进程, 连 ws://127.0.0.1:8499)     │
│    ├─ DeepSeek API Client (智能推理)                     │
│    ├─ Shell Executor (PowerShell/cmd)                    │
│    ├─ File Manager (读/写/列目录)                        │
│    └─ Progress Reporter (实时流式回报)                   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## 设计对应 Autogen 分布式运行时

| Autogen 概念 | PhoneFarm 实现 | 说明 |
|---|---|---|
| gRPC Host | BridgeServer + AiBridgeRouter | 中心消息路由枢纽 |
| gRPC bidirectional stream | WebSocket `/ws/ai/worker` + `/ws/ai/control` | 持久双向通道 |
| gRPC Runtime (Python) | AiDeepSeekWorker (TypeScript) | Agent 运行时 |
| RoutedAgent | DeepSeek API + Shell Executor | 实际执行任务的 Agent |
| RegisterAgent | ai_handshake 消息 | Agent 注册 |
| AddSubscription | (AiBridgeRouter 隐式管理) | 消息路由表 |
| CloudEvents | ai_task_* / ai_stream_chunk 消息 | 业务事件 |
| Proto files | ai-orchestrator/types.ts | 消息协议定义 |

## 消息协议

### 任务生命周期

```
Claude Code                BridgeServer              DeepSeek Worker
    │                          │                          │
    │── ai_task_assign ───────▶│──── ai_task_assign ─────▶│
    │                          │                          │
    │◀── ai_task_accept ───────│◀── ai_task_accept ───────│
    │                          │                          │
    │◀── ai_task_progress ────│◀── ai_task_progress ─────│  (可多次)
    │◀── ai_stream_chunk ─────│◀── ai_stream_chunk ──────│  (实时流)
    │                          │                          │
    │◀── ai_task_complete ────│◀── ai_task_complete ─────│  (或 failed)
    │                          │                          │
```

### 审批门 (可选)

```
Claude Code                BridgeServer              DeepSeek Worker
    │                          │                          │
    │◀── ai_approval_req ─────│◀── ai_approval_req ──────│
    │                          │                          │
    │── ai_approval_res ──────▶│──── ai_approval_res ────▶│
    │   (approved: true/false) │                          │
```

## 部署步骤

### Step 1 — VPS 配置环境变量

在 `.env` 中添加：

```env
# 新增：AI 协同认证 token
AI_AUTH_TOKEN=<生成一个随机 32 位字符串>
```

生成 token：
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
```

### Step 2 — 启动 VPS BridgeServer (已包含 AI 路由)

```powershell
cd D:\phonefarm-relay
npx tsx src/vps-relay.ts
```

Nginx 需要新增 `/ws/ai/worker` 和 `/ws/ai/control` 的代理配置（已更新在 `deploy/vps-relay/nginx.conf`）。

### Step 3 — 启动 DeepSeek Worker

在 VPS 上新开终端：

```powershell
$env:DEEPSEEK_API_KEY = "sk-your-deepseek-api-key"
$env:DEEPSEEK_MODEL = "deepseek-chat"          # 或 deepseek-reasoner
$env:AI_AUTH_TOKEN = "与 .env 中一致"
$env:AI_BRIDGE_URL = "ws://127.0.0.1:8499/ws/ai/worker"
$env:WORKER_WORKING_DIR = "D:\phonefarm-relay"
$env:WORKER_LABEL = "DeepSeek VPS Worker 01"

cd D:\phonefarm-relay
npx tsx src/ai-orchestrator/ai-deepseek-worker.ts
```

### Step 4 — 本地 Claude Code 连接测试

在本地开发机：

```powershell
cd e:\Program Files\www\phone\control-server

# 查看 VPS worker 状态
npx tsx src/ai-orchestrator/ai-claude-cli.ts status `
  --bridge-url "ws://你的VPS公网IP:80/ws/ai/control" `
  --token "你的AI_AUTH_TOKEN"

# 执行简单命令
npx tsx src/ai-orchestrator/ai-claude-cli.ts exec "dir D:\phonefarm-relay" `
  --bridge-url "ws://你的VPS公网IP:80/ws/ai/control" `
  --token "你的AI_AUTH_TOKEN"

# 写入文件
npx tsx src/ai-orchestrator/ai-claude-cli.ts write "test.txt" `
  --content "Hello from Claude Code" `
  --bridge-url "ws://你的VPS公网IP:80/ws/ai/control" `
  --token "你的AI_AUTH_TOKEN"

# 让 DeepSeek 自主决策
npx tsx src/ai-orchestrator/ai-claude-cli.ts analyze `
  "检查 nginx 是否在运行，如果没运行就启动它" `
  --bridge-url "ws://你的VPS公网IP:80/ws/ai/control" `
  --token "你的AI_AUTH_TOKEN"
```

## Claude Code 中使用

Claude Code 通过 Bash 工具调用 `ai-claude-cli.ts`，实现委托 VPS 操作：

### 执行远程命令

```bash
npx tsx src/ai-orchestrator/ai-claude-cli.ts exec "npm install" \
  --bridge-url "ws://VPS_IP:80/ws/ai/control" \
  --token "$AI_AUTH_TOKEN"
```

### 远程文件写入

```bash
npx tsx src/ai-orchestrator/ai-claude-cli.ts write ".env" \
  --content "$(cat .env.template)" \
  --bridge-url "ws://VPS_IP:80/ws/ai/control" \
  --token "$AI_AUTH_TOKEN"
```

### 远程文件读取

```bash
npx tsx src/ai-orchestrator/ai-claude-cli.ts read "nginx.conf" \
  --bridge-url "ws://VPS_IP:80/ws/ai/control" \
  --token "$AI_AUTH_TOKEN"
```

### 智能分析 + 自主执行

```bash
npx tsx src/ai-orchestrator/ai-claude-cli.ts analyze \
  "在 Windows 上安装并配置 nginx 作为反向代理，将 80 端口请求代理到 localhost:8499" \
  --bridge-url "ws://VPS_IP:80/ws/ai/control" \
  --token "$AI_AUTH_TOKEN"
```

### 多步骤部署计划

```bash
npx tsx src/ai-orchestrator/ai-claude-cli.ts plan --json '{
  "title": "部署 nginx 反向代理",
  "description": "安装并配置 nginx 为 PhoneFarm relay 反向代理",
  "steps": [
    {
      "order": 1,
      "description": "下载 nginx",
      "action": "execute_command",
      "params": {
        "command": "Invoke-WebRequest -Uri https://nginx.org/download/nginx-1.26.3.zip -OutFile $env:TEMP\\nginx.zip; Expand-Archive $env:TEMP\\nginx.zip -DestinationPath C:\\ -Force"
      }
    },
    {
      "order": 2,
      "description": "写入配置",
      "action": "write_file",
      "params": {
        "filePath": "C:\\nginx-1.26.3\\conf\\nginx.conf",
        "fileContent": "...(nginx config here)..."
      }
    },
    {
      "order": 3,
      "description": "启动 nginx",
      "action": "execute_command",
      "params": {
        "command": "C:\\nginx-1.26.3\\nginx.exe"
      }
    }
  ]
}' --bridge-url "ws://VPS_IP:80/ws/ai/control" --token "$AI_AUTH_TOKEN"
```

## PM2 常驻运行

### DeepSeek Worker

```powershell
pm2 start npx --name "phonefarm-deepseek" -- `
  tsx src/ai-orchestrator/ai-deepseek-worker.ts

pm2 save
```

### 环境变量配置 (PM2)

```powershell
pm2 start npx --name "phonefarm-deepseek" `
  -- tsx src/ai-orchestrator/ai-deepseek-worker.ts `
  --node-args="--require dotenv/config"

# 或通过 ecosystem.config.js
```

`ecosystem.config.js`:
```js
module.exports = {
  apps: [{
    name: "phonefarm-relay",
    script: "npx",
    args: "tsx src/vps-relay.ts",
    cwd: "D:/phonefarm-relay",
  }, {
    name: "phonefarm-deepseek",
    script: "npx",
    args: "tsx src/ai-orchestrator/ai-deepseek-worker.ts",
    cwd: "D:/phonefarm-relay",
    env: {
      DEEPSEEK_API_KEY: "sk-xxx",
      DEEPSEEK_MODEL: "deepseek-chat",
      AI_AUTH_TOKEN: "your-token",
      AI_BRIDGE_URL: "ws://127.0.0.1:8499/ws/ai/worker",
      WORKER_WORKING_DIR: "D:/phonefarm-relay",
      WORKER_LABEL: "DeepSeek VPS Worker 01",
    },
  }],
};
```

## 安全配置

### 最小权限 VPS 用户

```powershell
# 创建专用用户运行 worker (限制权限)
New-LocalUser -Name "phonefarm-ai" -NoPassword
# Worker 以该用户身份运行，限制可访问目录
```

### Token 隔离

建议 `AI_AUTH_TOKEN` 与 `CONTROL_TOKEN` 分开设置，即使 AI 通道泄露也不影响设备控制通道。

### TLS

生产环境使用 `wss://` 连接：
```bash
npx tsx src/ai-orchestrator/ai-claude-cli.ts exec "..." \
  --bridge-url "wss://your-vps-domain/ws/ai/control" \
  --token "$AI_AUTH_TOKEN"
```

## 故障排查

| 现象 | 检查 | 解决 |
|------|------|------|
| `status` 命令无响应 | `curl http://VPS_IP/api/v1/ai/workers` | 确认 VPS relay 在运行 |
| Worker 连不上 | Worker 日志中的 auth 错误 | 检查 AI_AUTH_TOKEN |
| DeepSeek 未执行 | Worker 日志 "DeepSeek API not configured" | 设置 DEEPSEEK_API_KEY |
| 命令执行超时 | 命令本身卡住 | 用 `--timeout 30000` 或检查 VPS |
| 大文件传输失败 | WebSocket payload 超过限制 | 分片传输或压缩 |
| Claude Code 无法连接 VPS | 本地网络问题 | 确认 VPS 公网端口 80 已开放 |

## 文件清单

```
control-server/src/ai-orchestrator/
  types.ts                — 消息协议类型定义 (Autogen proto 等价)
  ai-bridge-router.ts     — AI 消息路由中枢 (gRPC Host 等价)
  ai-deepseek-worker.ts   — DeepSeek Agent 运行时 (gRPC Runtime 等价)
  ai-claude-cli.ts        — Claude Code 桥接 CLI

control-server/src/relay/
  bridge-server.ts         — 扩展: 集成 AiBridgeRouter + AI 端点

control-server/src/
  vps-relay.ts             — 扩展: /ws/ai/worker + /ws/ai/control 路由

deploy/vps-relay/
  nginx.conf               — 扩展: AI WebSocket 代理
  .env.example             — 扩展: AI_AUTH_TOKEN
  docker-compose.yml       — 扩展: AI_AUTH_TOKEN env
  AI_ORCHESTRATOR.md       — 本文件
```
