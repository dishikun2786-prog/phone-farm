# PhoneFarm — 远程手机群控自动化平台

## 项目架构总览 (2026-05-14)

### 顶层结构

```
phone/
├── control-server/       # Node.js/Fastify 后端 API (TypeScript 6.0, Fastify 5.8)
├── dashboard/            # React/Vite 前端仪表盘 (React 19, Vite 8, Tailwind 4)
├── android-client/       # PhoneFarm Native Android APK (Kotlin 2.1, Compose, Hilt)
├── android-bridge/       # 旧版 DeekeScript 桥接兼容层 (AutoX v7)
├── edge-node/            # Go 边缘节点 (WebRTC/NATS 信令, Go 1.21)
├── vlm-bridge/           # Python VLM 微服务 (ClawGUI 桥接)
├── deploy/               # Docker Compose + K8s + Nginx + 部署脚本
├── docs/                 # 文档
└── operitai/             # 运营/IT 工具
```

### 核心技术栈

| 层 | 技术 | 版本/说明 |
|---|---|---|
| 控制服务器 | Node.js + Fastify + TypeScript | node 26.1, fastify 5.8, tsx 4 |
| 数据库 ORM | Drizzle ORM + pg | PG 18 |
| 缓存/队列 | Redis + BullMQ (ioredis) | Redis 7.4.3, BullMQ 5.76 |
| 前端 | React + Vite + TailwindCSS + Zustand | react 19, vite 8, zustand 5 |
| Android 语言 | Kotlin + Jetpack Compose + Material 3 | Kotlin 2.1, BOM 2024.12 |
| Android 构建 | Gradle + AGP + KSP | Gradle 8.11, JDK 21 |
| Android DI | Hilt (Dagger + KSP) | Hilt 2.55 |
| Android 网络 | OkHttp + Retrofit | OkHttp 4.12 |
| 边缘节点 | Go + gorilla/websocket + NATS | Go 1.21 |
| 部署 | PM2 + Caddy/Nginx + Docker Compose + K8s | |

### 控制服务器模块 (control-server/src/)

```
src/
├── index.ts                    # 生产入口 — 路由注册、中间件、插件初始化
├── config.ts                   # Zod 环境变量校验 (~50 个变量)
├── db.ts                       # Drizzle ORM + pg Pool
├── schema.ts                   # 18 个 Drizzle 表定义
├── routes.ts                   # 核心 CRUD (设备/任务/账户)
├── ws-hub.ts                   # WebSocket 集线器 (设备+前端连接池)
├── vps-relay.ts                # VPS 中继服务进程
│
├── auth/                       # JWT 认证 + RBAC (4 角色 20 资源)
├── activation/                 # 卡密激活系统
├── decision/                   # AI 决策引擎 (DeepSeek V4 Flash + Qwen3-VL-Plus 双路由)
├── ai-memory/                  # AI 内存调度器 (已禁用, REST API 可用)
├── ai-orchestrator/            # AI 编排器
├── queue/                      # BullMQ 任务队列 (P0-P3 优先级, 10 并发)
├── vlm/                        # VLM AI Agent (执行/剧集/脚本/模型管理)
├── config-manager/             # DB 支持的运行时配置 (env > DB > 默认值)
├── relay/                      # VPS 桥接隧道 (BridgeClient → VirtualWS)
├── edge/                       # 边缘计算模块
├── nats/                       # NATS JetStream 消息同步
├── webrtc/                     # WebRTC 信令中继
├── scrcpy/                     # 屏幕镜像/录制
├── stream/                     # 按需流媒体
├── storage/                    # MinIO S3 对象存储
├── scheduler/                  # Cron 调度器
├── stats/                      # 统计计算
├── alerts/                     # 告警规则引擎
├── webhook/                    # Webhook 交付
├── crash/                      # 崩溃报告
├── billing/                    # 计费
├── remote/                     # 远程命令
├── orchestration/              # 任务编排
├── cluster/                    # 集群管理
├── memory/                     # 跨设备体验内存
├── ray/                        # Ray 分布式计算集成
├── proto/                      # Protobuf 定义
└── types/                      # TypeScript 类型
```

### Dashboard 页面结构

```
dashboard/src/pages/
├── Login.tsx                   # 登录页
├── DeviceList.tsx              # 设备列表仪表盘
├── DeviceDetail.tsx            # 单设备详情
├── TaskList.tsx / TaskCreate.tsx  # 任务管理
├── AccountList.tsx             # 账号管理
├── VlmTaskPage.tsx             # VLM AI 任务
├── EpisodeListPage.tsx         # VLM 剧集历史
├── ScriptManager.tsx           # 编译脚本管理
├── ModelConfigPage.tsx         # VLM 模型配置
├── GroupControlPanel.tsx       # 群控面板
├── KeyMapPage.tsx              # 键位映射
├── SystemControlPanel.tsx      # 服务控制
├── admin/                      # 管理面板 (11 个页面)
│   ├── AdminPanel.tsx
│   ├── CardKeyManagement.tsx
│   ├── DeviceGroupManagement.tsx
│   ├── BatchOperationPanel.tsx
│   ├── AuditLogViewer.tsx
│   ├── VlmUsageDashboard.tsx
│   ├── AlertRuleConfig.tsx
│   ├── ServerHealthDashboard.tsx
│   ├── SystemConfigPage.tsx
│   ├── FeatureFlagsPage.tsx
│   └── InfrastructureMonitorPage.tsx
└── config/                     # 配置管理 (5 个页面)
    ├── ConfigManagement.tsx
    ├── ConfigGlobalEditor.tsx
    ├── ConfigDeviceEditor.tsx
    ├── ConfigTemplateEditor.tsx
    └── ConfigAuditLog.tsx
```

### 数据库表 (18 个)

| 表 | 说明 |
|---|---|
| devices | 设备注册信息 (ID/IP/型号/Android版本/电量/在线状态) |
| accounts | 平台账号 (平台/用户名/加密密码/设备关联) |
| task_templates | 预定义营销任务模板 |
| tasks | 调度任务 (模板/设备/账户/cron/启用) |
| executions | 任务执行记录 (状态/开始结束时间/统计/日志) |
| users | 用户认证 (用户名/密码哈希/角色) |
| vlm_episodes | VLM AI 运行记录 |
| vlm_steps | 每步截图/动作/思考 |
| vlm_scripts | 从剧集编译的自动化脚本 |
| card_keys | 激活卡密 |
| device_bindings | 卡密设备绑定 |
| device_groups | 设备分组 |
| platform_accounts | 带状态的平台账户 |
| api_keys | API 密钥 (带权限) |
| cron_jobs | 持久化 cron 作业 |
| crash_reports | Android 崩溃转储 |
| account_deletions | GDPR 删除请求 |
| webhook_configs | HTTP Webhook 端点 |
| alert_rules | 告警规则 |

### AI 决策引擎 (decision/)

双模智能路由系统:
- **DeepSeek V4 Flash** (Anthropic Messages API 格式) — 主要文本决策器 (~90% 流量)
- **Qwen3-VL-Plus** (阿里云百炼 DashScope API) — 视觉理解 (~10% 流量)

路由策略: 检测异常 → 连续失败 ≥3 → 连续低置信度 ≥3 → 未知页面 → 最后步骤需截图 → 默认文本

### WebSocket 协议

| 端点 | 用途 |
|---|---|
| `/ws/device` | 设备连接 (JWT 或 DEVICE_AUTH_TOKEN 认证, gzip 压缩) |
| `/ws/frontend` | 前端仪表盘连接 (设备订阅过滤) |

消息类型: auth/heartbeat/task_status/task_result/screenshot/log/webrtc_*/command/execute_decision

### 关键端口

| 端口 | 服务 |
|---|---|
| 8443 | Control Server API (HTTP) |
| 8444 | UDP 中继 (A/V 帧) |
| 8499 | VPS 桥接中继 |
| 5432 | PostgreSQL (本地) |
| 6379 | Redis (本地) |
| 9090 | Edge Node HTTP + 指标 |
| 4222 | NATS 客户端 |
| 3478 | TURN/STUN |

### 分裂部署架构

```
公网 VPS (中继)                     本地机器 (控制端)
├─ Nginx :80/:443                  ├─ Control Server :8443
├─ BridgeServer :8499              ├─ BridgeClient → VPS (出站)
└─ UDP Relay :8444                 ├─ PostgreSQL :5432
         ▲                              ├─ Redis :6379
         │ 手机出站                     └─ Dashboard :5173
    PhoneFarm APK (1..N)
```

**数据流**: 手机 → VPS/ws/phone → BridgeServer → 隧道 → BridgeClient → VirtualWS → Hub → 业务逻辑

---

## 2026-05-13 生产环境更新记录

### 🔴 Redis 升级 5.0.10 → 7.4.3

- **原因**: BullMQ 要求 Redis ≥ 6.2.0，旧版5.0.10导致 `Worker.run crash: Cannot read properties of undefined (reading 'client')`
- **操作**: 下载 [redis-windows/redis-windows](https://github.com/redis-windows/redis-windows/releases) 7.4.3，停止服务 → 备份 C:\BtSoft\redis → 替换二进制 → 更新 redis.conf (需 `maxmemory-policy noeviction`) → 启动
- **文件**: `deploy/scripts/upgrade-redis.ps1`, `deploy/scripts/fix-redis.ps1`

### 🟢 BullMQ 兼容性修复

- **文件**: [redis-client.ts](control-server\src\queue\redis-client.ts) — `maxRetriesPerRequest: 3` → `null`
- **原因**: BullMQ Worker 要求此字段为 `null`，否则 `Cannot read properties of undefined (reading 'client')`
- **结果**: BullMQ 队列正常初始化 `[queue] BullMQ initialized`

### 🟢 PM2 配置增强 (防止 OOM)

- **文件**: [ecosystem.config.cjs](control-server\ecosystem.config.cjs)
- `phonefarm-control`: heap 256→512MB, restart 300→600M, max_restarts 10→20
- `phonefarm-relay`: heap 128→512MB, restart 192→600M, max_restarts 10→20

### 🟢 6 个缺失 API 路由修复

| 修复 | 文件 |
|---|---|
| `GET /api/v1/vlm/models` 404 | [index.ts](control-server\src\index.ts) — 注册 `registerVlmModelRoutes` |
| `GET /api/v1/vlm/stats` 404 | [index.ts](control-server\src\index.ts) — 新增路由 |
| `GET /api/v1/scripts/version` 404 | [scripts-manifest-routes.ts](control-server\src\scripts-manifest-routes.ts) — 新增 |
| `GET /api/v1/scripts/version/:id` 404 | 同上 — 新增 |
| `POST /api/v1/scripts/deploy-batch` 404 | 同上 — 新增 |
| `POST /api/v1/seed-templates` 404 | [api.ts](dashboard\src\lib\api.ts) — 路径 `/seed-templates`→`/admin/seed-templates` |

### 🟢 前端路由修复

| 修复 | 文件 |
|---|---|
| `/login` 已登录重定向到首页 | [App.tsx](dashboard\src\App.tsx) |
| 移除未使用的 `WS_PATHS` 变量 | [useWebSocket.ts](dashboard\src\hooks\useWebSocket.ts) |

### 🟢 POST /api/v1/groups 400 修复

- **文件**: [scrcpy-routes.ts](control-server\src\scrcpy\scrcpy-routes.ts) — 允许创建空设备分组 `deviceIds: []`
- **文件**: [DeviceGroupManagement.tsx](dashboard\src\pages\admin\DeviceGroupManagement.tsx) — 数据格式修复 (裸数组 vs `{groups, total}`)

### 🟡 AI Memory 智能内存调度 (已禁用)

- **文件**: `src/ai-memory/` (anthropic-client.ts + deepseek-advisor.ts + memory-scheduler.ts + ai-memory-routes.ts)
- **设计**: DeepSeek V4 Flash (Anthropic API) 决策引擎 + 规则回退 + PM2 进程管理
- **API**: `/api/v1/ai-memory/status|stats|history`，`POST /api/v1/ai-memory/check` 手动触发
- **状态**: 自动调度已禁用 (DeepSeek API JSON 解析问题)，REST API 可用

### 🔴 CMD 弹窗问题排查与修复

- **根因1**: `HKCU\Run` 注册表 PM2 自启调用 `.cmd` 弹出窗口 → 已移除，改为隐藏计划任务
- **根因2**: `Common Startup\宝塔面板.lnk` 开机弹窗 → 已移除
- **根因3**: `ShengRiStartup.bat` 计划任务 → 已改为 `.ps1` + `-WindowStyle Hidden`
- **结果**: 所有计划任务均配置 `-WindowStyle Hidden` + `Settings -Hidden`，不再弹窗
- **注意**: 所有 PhoneFarm 计划任务当前均为 **Disabled** 状态

### 🟢 DeepSeek API 配置更新

- **API 格式**: 从 OpenAI 兼容格式 → Anthropic Messages API
- **Base URL**: `https://api.deepseek.com/anthropic`
- **模型**: `deepseek-v4-flash` (config.ts + deepseek-client.ts 同步更新)
- **认证**: `x-api-key` (Anthropic 标准)

### 🟢 统一配置系统 (config-manager/)

- **文件**: `src/config-manager/` — runtime-config.ts + config-routes.ts + system-config-routes.ts + config-definitions.ts + config-schema.ts
- **设计**: 三层优先级 env > DB > 默认值，支持全局/设备/模板三级配置
- **API**: `/api/v1/config/*` (需认证), `/api/v1/system/config`
- **前端**: 5 个配置管理页面 (ConfigManagement/ConfigGlobalEditor/ConfigDeviceEditor/ConfigTemplateEditor/ConfigAuditLog)

### 🟢 基础设施监控面板

- **前端**: [InfrastructureMonitorPage.tsx](dashboard\src\pages\admin\InfrastructureMonitorPage.tsx) — PostgreSQL/Redis/NATS/MinIO/Ray 连接状态
- **功能**: 实时连接状态、资源使用率、历史图表

## VPS 服务器部署清单

### 当前 VPS: `47.243.254.248` / `phone.openedskill.com` (Windows Server + 宝塔面板 + Caddy)

---

### 场景 A — 最小中继部署 (当前方案: VPS仅做公网桥接)

> 控制服务器/数据库/Redis 都在本地，VPS 只负责公网入口 + 消息转发

| # | 组件 | 端口 | 用途 | 部署方式 | 状态 |
|---|---|---|---|---|---|
| 1 | **Node.js 22+** | — | 运行时 | [nvm-windows](https://github.com/coreybutler/nvm-windows) 或官方安装 | ✅ 已装 |
| 2 | **PhoneFarm Relay** | 8499 (内网) + 8444 (UDP) | 桥接中继服务器 | PM2 `phonefarm-relay` | ✅ 运行中 |
| 3 | **Caddy** | 80, 443 | HTTPS 反向代理 + 自动 TLS | 宝塔面板 | ✅ 运行中 |
| 4 | **Nginx** (备选) | 80, 443 | Caddy 替代方案 | 手动安装 | ❌ 未用 (Caddy 替代) |
| 5 | **SSL 证书** | — | `phone.openedskill.com` TLS | Caddy 自动 (Let's Encrypt) | ✅ 自动续签 |
| 6 | **防火墙规则** | 80/TCP, 443/TCP, 8444/UDP | 公网入站 | 宝塔安全 + Windows 防火墙 | ✅ |
| 7 | **云安全组** | 80/TCP, 443/TCP, 8444/UDP | 阿里云安全组 | 阿里云控制台 | ✅ |

**PM2 进程**: `pm2 status` 应显示 `phonefarm-relay` 状态 `online`

**Caddy 反向代理核心配置** (宝塔面板 → 网站 → 配置):
```
phone.openedskill.com {
    reverse_proxy /api/* 127.0.0.1:8499
    reverse_proxy /ws/*  127.0.0.1:8499
    reverse_proxy /health 127.0.0.1:8499
}
```

**验证命令**:
```bash
curl https://phone.openedskill.com/api/v1/health
curl https://phone.openedskill.com/api/v1/bridge/status
pm2 logs phonefarm-relay --lines 20
```

---

### 场景 B — 全栈生产部署 (未来方案: 全部服务迁移至 VPS)

> 当本地机器不再承担服务端职责，VPS 托管全套后端

| # | 组件 | 端口 | 用途 | 部署方式 |
|---|---|---|---|---|
| 1 | **Node.js 22+** | — | 运行时 | nvm-windows / 官方安装 |
| 2 | **PostgreSQL 18** | 5432 (内网) | 主数据库 | Docker: `postgres:18-alpine` 或 Windows 安装 |
| 3 | **Redis 7.4** | 6379 (内网) | BullMQ 队列 + 缓存 | [redis-windows](https://github.com/redis-windows/redis-windows/releases) 或 Docker |
| 4 | **PhoneFarm Control** | 8443 (内网) + 8444 (UDP) | 主控制服务器 | PM2 `phonefarm-control` |
| 5 | **PhoneFarm Relay** | 8499 (内网) | 桥接中继 (可选, 全栈时不需要) | PM2 (仅分裂部署需要) |
| 6 | **Caddy / Nginx** | 80, 443 | HTTPS 反向代理 + 静态文件 | 宝塔面板 / Docker |
| 7 | **Dashboard 静态文件** | — | React SPA | Nginx/Caddy 直接提供 `dashboard/dist/` |
| 8 | **NATS Server** | 4222 (内网) | 消息同步 (FF_NATS_SYNC) | `setup-nats.ps1` / Docker |
| 9 | **MinIO** | 9000+9001 (内网) | S3 对象存储 (截图/模型/日志) | `setup-minio.ps1` / Docker |
| 10 | **coturn** | 3478, 5349 | TURN/STUN (WebRTC NAT穿透) | `setup-coturn.ps1` / Docker |
| 11 | **Ray** | 8265 (内网) | AI 分布式调度 (FF_RAY_SCHEDULER) | `pip install ray` / Docker |

**Docker Compose 一键部署** (全栈):
```bash
cd /opt/phonefarm
# 配置 .env 文件 (JWT_SECRET, DEEPSEEK_API_KEY, DASHSCOPE_API_KEY 等)
docker compose up -d
# 启动后验证
docker compose ps
curl http://localhost:80/api/v1/health
```

**K8s 集群部署** (多区域未来方案):
```bash
kubectl apply -k deploy/k8s/overlays/production/
```

---

### 环境变量清单 (.env)

> VPS 上必须配置的核心环境变量

```bash
# === 服务器基础 ===
PORT=8443
HOST=0.0.0.0
NODE_ENV=production

# === 数据库 ===
DATABASE_URL=postgresql://phonefarm:phonefarm_secret@localhost:5432/phonefarm

# === Redis (BullMQ 队列) ===
REDIS_URL=redis://default:redis-secret@localhost:6379

# === 认证 ===
JWT_SECRET=<32字符随机字符串>
DEVICE_AUTH_TOKEN=<32字符随机字符串>

# === 中继 (仅场景A) ===
RELAY_PORT=8499
CONTROL_TOKEN=<与本地BRIDGE_CONTROL_TOKEN一致>
UDP_RELAY_PORT=8444

# === AI 决策引擎 ===
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_API_URL=https://api.deepseek.com/anthropic
DEEPSEEK_MODEL=deepseek-v4-flash
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DASHSCOPE_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
DASHSCOPE_VL_MODEL=qwen3-vl-plus

# === AI Worker Token (分布式AI编排) ===
AI_AUTH_TOKEN=<32字符随机字符串>

# === 功能开关 (按需开启) ===
FF_DECISION_ENGINE=true
FF_QWEN_VL_FALLBACK=true
FF_WEBRTC_P2P=true
FF_NATS_SYNC=false
FF_RAY_SCHEDULER=false
FF_STREAM_ON_DEMAND=true
FF_CROSS_DEVICE_MEMORY=false
FF_LEGACY_VLM=false
FF_FEDERATED_LEARNING=false
FF_P2P_GROUP_CONTROL=false
FF_MODEL_HOT_UPDATE=false

# === 可选基础设施 (开启 FF 时需要) ===
NATS_URL=nats://localhost:4222
NATS_TOKEN=<nats-auth-token>
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=<minio-secret>
RAY_ADDRESS=http://localhost:8265
TURN_SERVER_URL=turn:phone.openedskill.com:3478
TURN_USERNAME=phonefarm
TURN_CREDENTIAL=<turn-password>

# === 流媒体/Scrcpy ===
SCRCPY_MAX_SIZE=1080
SCRCPY_BIT_RATE=4000000
SCRCPY_MAX_FPS=30
STREAM_IDLE_TIMEOUT_SEC=300
STREAM_MAX_DURATION_SEC=1800
```

---

### VPS 快速部署步骤 (场景 A — 最小中继)

```powershell
# 1. 安装 Node.js 22 (如果未装)
winget install OpenJS.NodeJS.LTS

# 2. 克隆项目
git clone https://github.com/dishikun2786-prog/phone-farm.git C:\www\phone
cd C:\www\phone\control-server
npm install

# 3. 配置环境变量
Copy-Item ..\deploy\vps-relay\.env.example .env
# 编辑 .env — 修改所有 TOKEN/SECRET 为随机值

# 4. 启动 PM2
npm install -g pm2
pm2 start ecosystem.config.cjs --only phonefarm-relay
pm2 save
pm2 startup    # 设置开机自启

# 5. 配置 Caddy (宝塔面板 → 网站 → 反向代理)
#    将所有 /api/* /ws/* /health 指向 127.0.0.1:8499

# 6. 验证
curl http://127.0.0.1:8499/api/v1/health
# → {"status":"ok","timestamp":"..."}
```

---

### VPS 防火墙检查清单

| 来源 | 端口 | 协议 | 方向 | 说明 |
|---|---|---|---|---|
| 任意 | 80 | TCP | 入站 | HTTP → Caddy/Nginx |
| 任意 | 443 | TCP | 入站 | HTTPS → Caddy/Nginx |
| 任意 | 8444 | UDP | 入站 | A/V 帧中继 (手机直连) |
| 任意 | 3478 | UDP+TCP | 入站 | TURN/STUN (WebRTC, 仅场景B) |
| 任意 | 5349 | TCP | 入站 | TURN/TLS (仅场景B) |
| 127.0.0.1 | 5432 | TCP | 本地 | PostgreSQL |
| 127.0.0.1 | 6379 | TCP | 本地 | Redis |
| 127.0.0.1 | 8443 | TCP | 本地 | Control Server |
| 127.0.0.1 | 8499 | TCP | 本地 | Relay Bridge |

**云安全组** (阿里云/etc) 必须同步开放公网端口: **80/TCP + 443/TCP + 8444/UDP** (场景A) 或加 **3478/UDP+TCP + 5349/TCP** (场景B)

---

## 部署脚本体系

```
deploy/scripts/
├── deploy.ps1              ← 一键部署 (git pull → npm install → build → pm2 reload → health check)
├── deploy-fullstack.ps1    ← 全栈部署
├── health-check.ps1        ← 全栈健康监控 (PM2/端口/API/磁盘/内存/日志)
├── log-rotate.ps1          ← 日志轮转 (7天归档 + PM2 flush)
├── memory-guard.ps1        ← 内存防线 (>92% 暂停非关键进程)
├── upgrade-redis.ps1       ← Redis 升级脚本 (已执行)
├── fix-redis.ps1           ← Redis 配置修复 (已执行)
├── setup-coturn.ps1        ← TURN 服务器配置
├── setup-minio.ps1         ← MinIO 客户端配置
├── setup-nats.ps1          ← NATS 服务器配置
├── setup-scheduler.ps1     ← 计划任务配置
├── setup-ssh.ps1           ← SSH 配置
└── sync-to-vps.ps1         ← VPS 同步
```

## Windows 计划任务 (全部 Disabled)

| 任务 | 触发条件 | 状态 |
|---|---|---|
| PhoneFarm-HealthCheck | 每3600分钟 | Disabled |
| PhoneFarm-LogRotate | 每天03:00 | Disabled |
| PhoneFarm-PM2Resurrect | 系统启动 | Disabled |
| PhoneFarm-MemoryGuard | 每60分钟 | Disabled |
| PM2-AutoStart-Hidden | 用户登录 | Ready |

---

## 开发环境

### 快速启动

```bash
# 控制服务器
cd control-server && npm run dev    # tsx watch src/dev-server.ts (JSON文件存储)

# 前端仪表盘
cd dashboard && npm run dev         # http://localhost:5173
```

### Android APK 构建

```bash
cd android-client
$env:JAVA_HOME = "C:\Users\dishi\AppData\Local\PhoneFarm\jdk21\jdk-21.0.11+10"
.\gradlew.bat assembleDebug
```

### 默认凭据

| 配置项 | 值 |
|---|---|
| 数据库 | postgresql://postgres:123456@localhost:5432/phonefarm |
| 默认登录 | admin / admin123 |
| GitHub | https://github.com/dishikun2786-prog/phone-farm |

---

---

## 战略愿景：全球移动边缘AI神经网络云控系统

### 目标架构六层模型

```
                        ┌──────────────────────────────────┐
   中央控制层 (K8s)      │  PostgreSQL + Redis + MinIO      │
                        │  Ray Cluster + K8s HPA           │
                        └──────────────┬───────────────────┘
                                       │
                        ┌──────────────┴───────────────────┐
   边缘调度层 (Go)       │  Go Edge Node + Python AI        │
                        │  WebRTC Signaling + NATS Client  │
                        └──────────────┬───────────────────┘
                                       │
                        ┌──────────────┴───────────────────┐
   状态同步层 (NATS)     │  JetStream + Pub/Sub             │
                        │  phonefarm.device.* 主题空间      │
                        └──────────────┬───────────────────┘
                                       │
                        ┌──────────────┴───────────────────┐
   通信层 (WebRTC+WS)   │  WebRTC P2P + UDP + WebSocket    │
                        │  TURN/STUN + NAT穿透 + 自适应码率 │
                        └──────────────┬───────────────────┘
                                       │
                        ┌──────────────┴───────────────────┐
   AI推理层 (NCNN+MNN)  │  NCNN (YOLO/OCR/CV视觉)          │
                        │  MNN (Qwen2-0.5B/Embedding/Agent)│
                        └──────────────┬───────────────────┘
                                       │
                        ┌──────────────┴───────────────────┐
   终端层 (Android)      │  Kotlin + NDK + Jetpack + Rhino  │
                        │  ForegroundService + 双进程守护   │
                        └──────────────────────────────────┘
```

### 当前完成度 vs 目标架构 (逐层对标)

#### 1. 终端层 — Android APP ✅ 85%

| 目标能力 | 当前状态 | 文件 |
|---|---|---|
| Kotlin + Jetpack Compose | ✅ 完全实现 | [MainActivity.kt](android-client/app/src/main/java/com/phonefarm/client/MainActivity.kt) |
| NDK / CMake 原生编译 | ✅ arm64-v8a 配置 | [build.gradle.kts](android-client/app/build.gradle.kts) L41-46 |
| Foreground Service 保活 | ✅ 双服务守护 | [BridgeForegroundService.kt](android-client/app/src/main/java/com/phonefarm/client/service/BridgeForegroundService.kt) + [GuardService.kt](android-client/app/src/main/java/com/phonefarm/client/service/GuardService.kt) |
| WorkManager 定时任务 | ✅ | [UpdateCheckWorker.kt](android-client/app/src/main/java/com/phonefarm/client/update/) |
| 任务断点恢复 | ⚠️ 已实现未实测 | [TaskRetryPolicy.kt](android-client/) + [OfflineQueue.kt](android-client/app/src/main/java/com/phonefarm/client/network/reconnect/OfflineQueue.kt) |
| 开机自启 | ✅ | [BootReceiver.kt](android-client/app/src/main/java/com/phonefarm/client/service/BootReceiver.kt) |

**缺口**: 真机保活验证（华为/小米/OPPO 杀进程策略各异）、离线队列端到端压测

---

#### 2. AI推理层 — NCNN + MNN 双栈 ✅ 50%

| 目标能力 | 当前状态 | 文件 |
|---|---|---|
| NCNN JNI 桥接 | ✅ JNI 定义完成 | [NcnnYoloBridge.kt](android-client/app/src/main/java/com/phonefarm/client/edge/ncnn/NcnnYoloBridge.kt) |
| MNN JNI 桥接 | ✅ JNI 定义完成 | [MnnLlmBridge.kt](android-client/app/src/main/java/com/phonefarm/client/vlm/mnn/MnnLlmBridge.kt) |
| TFLite 集成 | ✅ 2.16.1 已集成 | build.gradle.kts L210-211 |
| ML Kit OCR | ✅ 中文文本识别 | build.gradle.kts L206-207 |
| llama.cpp JNI | ⚠️ CMake 配置存在 | build.gradle.kts L41-46 |

**关键缺口**:
- ❌ **NCNN/MNN .so 原生库未编译** — 仅有 JNI Kotlin 桥接代码, 缺少 `jniLibs/arm64-v8a/libncnn_yolo.so` 和 `libmnn_llm.so`
- ❌ **llama.cpp .so 未交叉编译** — NDK arm64-v8a 交叉编译链未执行
- ❌ **本地小模型文件缺失** — Qwen2-0.5B / Gemma-2B 量化模型未部署

---

#### 3. 模型层 — 视觉+语言双模型 ✅ 25%

| 目标模型 | 当前状态 |
|---|---|
| YOLOv8-nano (UI检测) | ⚠️ NcnnYoloBridge 已定义, 但 .so + .param/.bin 缺失 |
| PaddleOCR | ❌ 未集成 (仅有 ML Kit OCR) |
| MobileSAM | ❌ 未集成 |
| Qwen2-0.5B / Qwen3-0.5B | ⚠️ MnnLlmBridge 已定义, 但 .so + 量化模型缺失 |
| Phi-2 / Gemma-2B (备选) | ❌ 未集成 |
| DeepSeek V4 Flash (云端) | ✅ 完全集成 (Anthropic API) |
| Qwen3-VL-Plus (云端) | ✅ 完全集成 (DashScope API) |

**说明**: 云端推理路径已 100% 就绪；本地推理路径骨架已搭好，缺编译产物和模型文件。

---

#### 4. 通信层 — WebRTC + UDP + WebSocket ✅ 80%

| 目标能力 | 当前状态 | 文件 |
|---|---|---|
| WebRTC PeerConnection | ✅ 完全实现 (607行) | [WebrtcManager.kt](android-client/app/src/main/java/com/phonefarm/client/webrtc/WebrtcManager.kt) |
| WebRTC Signaling | ✅ Go 信令服务 | [edge-node/cmd/main.go](edge-node/cmd/main.go) L157-183 |
| UDP 传输 (A/V 帧) | ✅ | [UdpTransport.kt](android-client/app/src/main/java/com/phonefarm/client/network/transport/UdpTransport.kt) |
| NAT 类型检测 | ✅ 5种类型 | [NatDetector.kt](android-client/app/src/main/java/com/phonefarm/client/network/transport/NatDetector.kt) |
| 传输自动选择 | ✅ UDP/WS 自适应 | [TransportSelector.kt](android-client/app/src/main/java/com/phonefarm/client/network/transport/TransportSelector.kt) |
| TURN/STUN | ✅ 配置就绪 | [setup-coturn.ps1](deploy/scripts/setup-coturn.ps1) |
| WebSocket 重连 | ✅ 8种场景指数退避 | [ReconnectManager.kt](android-client/app/src/main/java/com/phonefarm/client/network/reconnect/ReconnectManager.kt) |

**缺口**: WebRTC 端到端联调 (SignalingSender → Go信令→对端), H.264硬编码兼容多芯片 (高通/联发科/麒麟)

---

#### 5. 状态同步层 — NATS JetStream ✅ 75%

| 目标能力 | 当前状态 | 文件 |
|---|---|---|
| NATS 客户端 (服务端) | ✅ 完整实现 (328行) | [nats-sync.ts](control-server/src/nats/nats-sync.ts) |
| NATS 客户端 (Android) | ✅ | [NatsClient.kt](android-client/app/src/main/java/com/phonefarm/client/network/nats/NatsClient.kt) |
| NATS 客户端 (Go边缘) | ✅ | [edge-node/cmd/main.go](edge-node/cmd/main.go) L85-114 |
| JetStream 持久化 | ✅ PHONEFARM_TASKS 流 | nats-sync.ts L200-250 |
| 主题空间设计 | ✅ phonefarm.device.* | 全端统一 |

**缺口**: 端到端跨三端 (Server→Go→Android) NATS 消息回路测试

---

#### 6. 调度层 — Ray + BullMQ + AI决策 ✅ 60%

| 目标能力 | 当前状态 | 文件 |
|---|---|---|
| Ray 分布式客户端 | ✅ 完整 (388行) | [ray-client.ts](control-server/src/ray/ray-client.ts) |
| BullMQ 任务队列 | ✅ P0-P3, 10并发 | [task-queue.ts](control-server/src/queue/task-queue.ts) |
| AI 双模决策路由 | ✅ DeepSeek+Qwen | [decision-router.ts](control-server/src/decision/decision-router.ts) |
| Cron 调度器 | ✅ node-cron | [scheduler/](control-server/src/scheduler/) |
| AI Memory 调度 | ⚠️ 自动调度禁用 | [ai-memory/](control-server/src/ai-memory/) |

**缺口**: Ray 集群实际部署 (FF_RAY_SCHEDULER 默认关闭)、设备节点负载均衡调度策略、模型缓存命中感知调度

---

#### 7. 边缘节点层 — Go + Python 双栈 ✅ 65%

| 目标能力 | 当前状态 | 文件 |
|---|---|---|
| Go 边缘节点 | ✅ 完整实现 (268行) | [edge-node/cmd/main.go](edge-node/cmd/main.go) |
| WebRTC 信令服务 | ✅ /ws/signaling | main.go L157-183 |
| Prometheus 指标 | ✅ 4个指标 | main.go L30-64 |
| Python VLM 桥接 | ⚠️ vlm-bridge 存在 | [vlm-bridge/](vlm-bridge/) |

**缺口**: Python AI推理侧与Go边缘节点的gRPC/HTTP通信、区域边缘Agent协同逻辑

---

#### 8. 中央控制层 — K8s + 数据存储 ✅ 55%

| 目标能力 | 当前状态 | 文件 |
|---|---|---|
| K8s Kustomize | ✅ 14个文件, 双环境 | [deploy/k8s/](deploy/k8s/) |
| PostgreSQL 18 | ✅ 生产就绪 | [docker-compose.yml](deploy/docker-compose.yml) |
| Redis 7.4.3 | ✅ 生产就绪 | [docker-compose.yml](deploy/docker-compose.yml) |
| MinIO S3 | ✅ 客户端完整 | [minio-client.ts](control-server/src/storage/minio-client.ts) |
| HPA 自动扩缩 | ✅ | [hpa.yaml](deploy/k8s/base/hpa.yaml) |
| Prometheus 监控 | ✅ | [monitoring.yaml](deploy/k8s/base/monitoring.yaml) |
| PM2 进程管理 | ✅ 生产就绪 | [ecosystem.config.cjs](control-server/ecosystem.config.cjs) |

**缺口**: K8s 集群实际部署 (当前用 PM2 单机)、GPU 调度、多区域联邦

---

### 综合完成度

| 层 | 完成度 | 状态 |
|---|---|---|
| 终端层 (Android) | 85% | 🟢 代码完整, 缺真机验证 |
| AI推理层 (NCNN+MNN) | 50% | 🟡 桥接代码就绪, 缺原生编译 |
| 模型层 (视觉+语言) | 25% | 🔴 云端就绪, 本地模型未部署 |
| 通信层 (WebRTC+WS) | 80% | 🟢 代码完整, 缺联调 |
| 状态同步层 (NATS) | 75% | 🟢 三端支持, 缺联调 |
| 调度层 (Ray+BullMQ) | 60% | 🟡 AI路由就绪, Ray未部署 |
| 边缘节点层 (Go+Python) | 65% | 🟡 Go完整, Python侧待补 |
| 中央控制层 (K8s) | 55% | 🟡 配置完整, 未集群化 |
| **整体** | **~62%** | |

---

## 开发路线图

### Phase 12 — 原生AI推理引擎编译 (优先级: 🔴 最高)

> **目标**: 填补最大缺口 — 从 JNI 桥接代码 → 可运行的原生推理

| 任务 | 说明 | 预估 |
|---|---|---|
| NCNN YOLO .so 交叉编译 | NDK arm64-v8a 编译 libncnn_yolo.so | 2天 |
| MNN LLM .so 交叉编译 | NDK arm64-v8a 编译 libmnn_llm.so | 2天 |
| llama.cpp JNI 交叉编译 | NDK 编译 libllama_jni.so | 3天 |
| YOLOv8-nano 模型转换+部署 | PyTorch → ONNX → NCNN, 量化 INT8 | 1天 |
| Qwen2-0.5B GGUF 量化部署 | Q4_K_M 量化, MNN 格式转换 | 2天 |
| PaddleOCR Mobile 集成 | Android 端 OCR 引擎 | 2天 |
| NCNN/MNN 推理管线联调 | YOLO 检测 → MNN Agent 决策串联 | 2天 |

---

### Phase 13 — 通信层端到端联调 (优先级: 🔴 最高)

> **目标**: WebRTC + NATS 全链路贯通

| 任务 | 说明 | 预估 |
|---|---|---|
| WebRTC 信令回路测试 | Android ↔ Go Signaling ↔ PeerConnection 建链 | 2天 |
| NATS 三端消息回路 | Server → Go Edge → Android 消息收发验证 | 2天 |
| TURN 中继部署验证 | coturn 生产配置 + 对称型NAT穿透测试 | 1天 |
| WebRTC DataChannel 联调 | phonefarm-control/stats 数据通道 | 1天 |
| H.264 多芯片硬编码兼容 | 高通/联发科/麒麟 H.264 编码器兼容测试 | 2天 |

---

### Phase 14 — 真机验证 + 保活适配 (优先级: 🟡 高)

> **目标**: 各品牌真机安装 + 杀进程对抗

| 任务 | 说明 | 预估 |
|---|---|---|
| 小米 MIUI 保活适配 | 自启动/省电/后台弹窗权限 | 1天 |
| 华为 EMUI 保活适配 | 电池优化/启动管理 | 1天 |
| OPPO/VIVO 保活适配 | ColorOS/OriginOS 后台策略 | 1天 |
| 三星 OneUI 保活适配 | 设备维护/休眠 | 0.5天 |
| 15 脚本 Rhino 引擎真机验证 | 抖音/快手/微信/小红书全平台 | 3天 |
| 离线队列 + 断点恢复压测 | 7天连续运行稳定性 | 2天 |

---

### Phase 15 — 分布式调度升级 (优先级: 🟡 高)

> **目标**: Ray 集群实际部署 + 智能负载调度

| 任务 | 说明 | 预估 |
|---|---|---|
| Ray 集群部署 | VPS + 本地双节点 Ray Cluster | 2天 |
| 设备负载感知调度 | CPU/内存/电量/温度多维度 | 2天 |
| 模型缓存命中调度 | 同模型任务路由到已加载节点 | 1天 |
| AI Memory Scheduler 修复 | DeepSeek JSON 输出截断问题 | 1天 |
| BullMQ 生产压测 | 1000并发任务队列性能调优 | 1天 |

---

### Phase 16 — 边缘 Agent 神经网络 (优先级: 🟢 中)

> **目标**: 真正的 "移动边缘AI节点" — 每个手机成为自主Agent

| 任务 | 说明 | 预估 |
|---|---|---|
| 设备端 Agent 自主决策 | 本地小模型直接决策, 无需等云端 | 3天 |
| 跨设备经验共享 | NATS 广播成功任务状态/提示模板 | 2天 |
| Python AI 边缘推理服务 | YOLO/OCR/ReID 边缘 GPU 推理 | 3天 |
| Go ↔ Python gRPC 通道 | 边缘节点 Go↔Python 高性能通信 | 1天 |
| 区域边缘 Agent 协同 | Go 节点代理多设备的 AI 请求 | 2天 |

---

### Phase 17 — K8s 生产集群化 (优先级: 🟢 中)

> **目标**: 从 PM2 单机 → K8s 集群, 为多区域部署奠基

| 任务 | 说明 | 预估 |
|---|---|---|
| K8s 集群初始部署 | 复用 deploy/k8s/ 配置部署到 VPS | 2天 |
| PostgreSQL HA | Patroni/CloudNativePG 高可用 | 2天 |
| Redis Sentinel 哨兵 | 主从 + 自动故障转移 | 1天 |
| GPU Node 调度 | NVIDIA Device Plugin + GPU 工作负载 | 1天 |
| 多区域架构设计 | 河内/胡志明/香港/新加坡 联邦方案 | 2天 |

---

### Phase 18 — 安全合规 + 交付 (优先级: 🟢 低)

| 任务 | 说明 | 预估 |
|---|---|---|
| R8/ProGuard 混淆 | OkHttp/Compose/Hilt/Rhino Keep 规则 | 1天 |
| OWASP Mobile Top 10 审计 | 安全扫描 + 漏洞修复 | 2天 |
| Google Play 上架准备 | 隐私政策/数据安全声明 | 2天 |
| 单元测试 + UI 测试 | JUnit 5 + MockK + Compose Screenshot | 3天 |
| PostgreSQL 自动备份 | pg_dump + MinIO 存储归档 | 1天 |

---

### 优先级时间线

```
Phase 12 (推理引擎)     ████████████░░░░░░░░░░░░  2周
Phase 13 (通信联调)     ████████████░░░░░░░░░░░░  1.5周
Phase 14 (真机验证)     ████████████░░░░░░░░░░░░  1.5周
Phase 15 (分布式调度)   ████████░░░░░░░░░░░░░░░░  1.5周
Phase 16 (边缘Agent)    ██████████░░░░░░░░░░░░░░  2周
Phase 17 (K8s集群化)    ████████░░░░░░░░░░░░░░░░  1.5周
Phase 18 (安全交付)     ██████░░░░░░░░░░░░░░░░░░  1.5周
                        ─────────────────────────
                        总计: ~11-12周 → 目标完成度 90%+
```

### 关键指标

| 指标 | 当前 | Phase 18 目标 |
|---|---|---|
| 整体完成度 | ~62% | 90%+ |
| 本地AI推理 | 仅云端 | 云端+边缘双模 |
| 通信可靠性 | 代码完整未联调 | WebRTC P2P + NATS 三端贯通 |
| 设备保活率 | 未验证 | 24h >90% (主流品牌) |
| 单节点设备数 | 理论无上限 | 实测 100+ 设备/边缘节点 |
| 分布式部署 | 单机 PM2 | K8s 集群 + 多区域设计 |
| 产线就绪度 | 开发阶段 | 可灰度 50 设备小规模试运行 |
