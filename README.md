# PhoneFarm — 远程手机群控自动化平台

## 项目定位

通过 Web 仪表盘可视化控制多台分布在不同网络的 Android 手机，自动执行微信视频号、抖音、快手、小红书的营销任务（浏览、点赞、评论、关注、私信等）。

**当前战略**: 从依赖第三方 DeekeScript/AutoX v7 运行时 + Tailscale VPN → 自研 PhoneFarm Native Android APK + 自建 NAT 穿透通信，实现自主品牌、内置 VLM AI Agent、浮窗 AI 交互、模块化后安装的完整闭环。

## 架构概览

### 单机部署 (开发/测试)

```
浏览器 (React SPA)           PhoneFarm Native APK (手机1..N)
     │                              │
     ▼                              │
  Nginx :80                         │
     │                              │
     ▼                              ▼
  控制服务器 :8443 ◄────────── WebSocket (wss://) + UDP :8444
  (Node.js/Fastify)
  - REST API
  - WebSocket Hub
  - PostgreSQL 18
  - Redis 7.4.3 (BullMQ)
  - UDP Relay :8444
  - AI 决策引擎 (DeepSeek V4 + Qwen3-VL)
```

### 分裂部署 (生产 — 本地控制 + 公网中继)

```
┌────────────────────────────┐     ┌──────────────────────────────┐
│       公网 VPS (中继)       │     │      本地机器 (控制端)         │
│                            │     │                              │
│  Nginx :80/:443            │     │  Control Server :8443        │
│    ├─ /ws/phone → 手机入口  │     │  ├─ REST API                 │
│    ├─ /ws/control → 隧道    │◄────│  ├─ BridgeClient (出站→VPS)  │
│    └─ /ws/frontend → 前端   │     │  ├─ WebSocket Hub            │
│                            │     │  ├─ PostgreSQL :5432         │
│  BridgeServer :8499        │     │  ├─ Redis :6379              │
│  UDP Relay :8444           │     │  └─ Dashboard :5173          │
└────────┬───────────────────┘     └──────────────────────────────┘
         │
         │ 手机出站连接 (wss://vps:443/ws/phone)
         ▼
┌──────────────────────┐
│  手机 1..N            │
│  PhoneFarm APK       │
│  WebSocket + UDP A/V │
└──────────────────────┘
```

**隧道流向**: 手机 → VPS BridgeServer → WebSocket 隧道 → 本地 BridgeClient → VirtualWS → 本地 Hub → 正常业务处理。本地服务器出站连接 VPS（无需公网 IP），手机入站连接 VPS（中继转发）。

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 控制服务器 | Node.js + Fastify + TypeScript | node 26.1, fastify 5.8 |
| 数据库 | PostgreSQL + Drizzle ORM | PG 18 |
| 缓存/队列 | Redis + BullMQ (ioredis) | Redis 7.4.3 |
| 前端 | React + Vite + TailwindCSS + Zustand | react 19, vite 8 |
| Android 语言 | Kotlin + Jetpack Compose + Material 3 | Kotlin 2.1.0 |
| Android 构建 | Gradle + AGP + KSP | Gradle 8.11, JDK 21 |
| JS 引擎 | Mozilla Rhino 1.7.15 | |
| WebSocket | OkHttp 4.12.0 | |
| 本地存储 | Room 2.6.1 (SQLite) | |
| DI | Hilt 2.55 (Dagger + KSP) | |
| 最低 SDK | 24 (Android 7.0) | |
| 目标 SDK | 36 | |
| 边缘节点 | Go 1.21 + NATS + WebRTC | |
| 部署 | PM2 + Caddy + Docker Compose + K8s | |

## 目录结构

```
phone/
├── CLAUDE.md                   # 项目文档 + 变更日志
├── README.md                   # ← 本文件
├── .gitignore
├── .github/workflows/          # CI/CD pipeline
│
├── control-server/             # 后端控制服务器 (Node.js/Fastify)
│   ├── package.json
│   ├── ecosystem.config.cjs    # PM2 配置
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   ├── migrations/
│   └── src/
│       ├── index.ts            # 生产入口 (PostgreSQL)
│       ├── dev-server.ts       # 开发入口 (JSON 文件存储)
│       ├── config.ts           # 环境变量 Zod 校验 (~50 个变量)
│       ├── db.ts               # PG 连接 (drizzle-orm)
│       ├── schema.ts           # 数据库表定义 (18 个表)
│       ├── ws-hub.ts           # WebSocket Hub
│       ├── routes.ts           # 核心 REST API
│       ├── auth/               # JWT 认证 + RBAC (4 角色 20 资源)
│       ├── decision/           # AI 决策引擎 (DeepSeek + Qwen3-VL 双路由)
│       ├── vlm/                # VLM AI Agent (执行/剧集/脚本/模型)
│       ├── queue/              # BullMQ 任务队列 (P0-P3, 10 并发)
│       ├── config-manager/     # DB 运行时配置 (env > DB > 默认值)
│       ├── relay/              # VPS 桥接隧道 (BridgeClient)
│       ├── nats/               # NATS JetStream 消息同步
│       ├── webrtc/             # WebRTC 信令中继
│       ├── edge/               # 边缘计算模块
│       ├── storage/            # MinIO S3 对象存储
│       ├── ai-memory/          # AI 内存调度器 (已禁用)
│       ├── scheduler/          # Cron 定时调度
│       ├── scrcpy/             # 屏幕流中继
│       ├── alerts/             # 告警规则引擎
│       ├── webhook/            # Webhook 通知
│       ├── stats/              # 统计计算
│       ├── crash/              # 崩溃上报
│       ├── activation/         # 卡密验证系统
│       ├── billing/            # 计费
│       └── account/            # 账号数据删除
│
├── dashboard/                  # 前端仪表盘 (React/Vite)
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── lib/api.ts          # API 客户端 (~100 个方法)
│       ├── hooks/useWebSocket.ts
│       ├── store/index.ts      # Zustand 统一状态管理
│       ├── components/         # 通用组件 (Layout/Toast/ErrorBoundary/EpisodePlayer...)
│       └── pages/
│           ├── Login.tsx
│           ├── DeviceList.tsx / DeviceDetail.tsx
│           ├── TaskList.tsx / TaskCreate.tsx
│           ├── AccountList.tsx
│           ├── VlmTaskPage.tsx / EpisodeListPage.tsx
│           ├── ScriptManager.tsx / ModelConfigPage.tsx
│           ├── GroupControlPanel.tsx
│           ├── SystemControlPanel.tsx
│           ├── admin/          # 管理面板 (11 个页面含基础设施监控)
│           └── config/         # 配置管理 (5 个页面)
│
├── android-client/             # PhoneFarm Native APK (Kotlin/Compose)
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   ├── gradle/libs.versions.toml
│   └── app/src/main/java/com/phonefarm/client/
│       ├── PhoneFarmApp.kt     # Application (Hilt 入口)
│       ├── MainActivity.kt     # 单 Activity + Compose Navigation
│       ├── ui/                 # Compose UI (主题/导航/页面/组件)
│       ├── service/            # AccessibilityService + 前台服务 + 守护进程
│       ├── engine/             # Rhino 脚本引擎 + DeekeScript 运行时
│       ├── floating/           # 浮窗 AI 交互 (13 个文件)
│       ├── network/            # OkHttp/WebSocket/安全/传输层
│       ├── vlm/                # 设备端 VLM AI Agent (5 模型适配器)
│       ├── scrcpy/             # 屏幕流编码 (H.264)
│       ├── bridge/             # JS 桥接层 (AutoX v7 兼容)
│       ├── hardening/          # 安全加固 + 品牌兼容
│       ├── activation/         # 卡密激活
│       ├── permissions/        # 权限管理
│       ├── plugin/             # 插件系统 (模块化后安装)
│       ├── privilege/          # 提权模块 (Shizuku/Root)
│       ├── update/             # APK OTA 自更新
│       ├── data/               # Room DB + DAO + Repository
│       └── di/                 # Hilt DI 模块
│
├── android-bridge/             # DeekeScript 桥接 (旧方案，保留兼容)
│   ├── remote-bridge.js
│   ├── autox-v7/               # AutoX v7 版 15 个任务脚本
│   └── version.json
│
├── edge-node/                  # Go 边缘节点 (WebRTC/NATS 信令)
│   └── cmd/main.go
│
├── vlm-bridge/                 # Python VLM 微服务 (ClawGUI 桥接)
│
├── deploy/                     # 部署配置
│   ├── docker-compose.yml      # 生产 Docker Compose
│   ├── nginx.conf
│   ├── scripts/                # 部署/健康检查/日志/内存脚本 (12 个)
│   ├── k8s/                    # Kubernetes Kustomize (base + production overlay)
│   ├── local/                  # 本地开发 Docker Compose
│   └── vps-relay/              # VPS 中继部署
│
└── test-e2e.mjs / test-vlm-e2e.mjs
```

## 环境搭建

### 1. 安装依赖

```bash
cd control-server && npm install
cd ../dashboard && npm install
```

### 2. 配置环境变量

```bash
# control-server/.env
PORT=8443
DATABASE_URL=postgresql://postgres:123456@localhost:5432/phonefarm
JWT_SECRET=change-me-in-production
DEVICE_AUTH_TOKEN=device-auth-token-change-me
```

### 3. 初始化数据库

```bash
psql -U postgres -c "CREATE DATABASE phonefarm;"
psql -U postgres -d phonefarm -f control-server/migrations/0000_initial.sql
```

### 4. 启动开发服务器

```bash
# 终端1: 控制服务器
cd control-server
npm run dev          # tsx watch src/dev-server.ts (JSON 文件，无需 PG)
npm run prod         # tsx src/index.ts (PostgreSQL)

# 终端2: 前端仪表盘
cd dashboard
npm run dev          # http://localhost:5173
```

### 5. Android APK 构建

```bash
cd android-client
$env:JAVA_HOME = "C:\Users\dishi\AppData\Local\PhoneFarm\jdk21\jdk-21.0.11+10"
.\gradlew.bat assembleDebug    # Debug APK
.\gradlew.bat assembleRelease  # Release APK
```

## 数据库表 (18 个)

| 表 | 说明 |
|---|---|
| devices | 设备注册信息 (ID/IP/型号/Android版本/电量/在线状态) |
| accounts | 平台账号 (平台/用户名/加密密码/设备关联) |
| task_templates | 预定义营销任务模板 (15 个, 4 平台) |
| tasks | 调度任务 (模板/设备/账户/cron/启用) |
| executions | 任务执行记录 |
| users | 用户认证 (用户名/密码哈希/角色) |
| vlm_episodes | VLM AI 运行记录 |
| vlm_steps | 每步截图/动作/思考 |
| vlm_scripts | 编译后自动化脚本 |
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

## 关键配置值

| 配置项 | 值 |
|---|---|
| 控制服务器端口 | 8443 |
| UDP Relay 端口 | 8444 |
| 数据库 | postgresql://postgres:123456@localhost:5432/phonefarm |
| 默认登录 | admin / admin123 |
| GitHub 仓库 | https://github.com/dishikun2786-prog/phone-farm |

## 任务脚本 (15 个, 4 平台)

| 脚本 | 平台 | 功能 |
|---|---|---|
| task_dy_toker.js | 抖音 | 推荐营销 |
| task_dy_toker_city.js | 抖音 | 同城营销 |
| task_dy_toker_comment.js | 抖音 | 评论区互动 |
| task_dy_search_user.js | 抖音 | 搜索用户营销 |
| task_dy_live_barrage.js | 抖音 | 直播间弹幕 |
| task_dy_fans_inc_main.js | 抖音 | 涨粉操作 |
| task_dy_ai_back.js | 抖音 | AI 智能回复 |
| task_ks_toker.js | 快手 | 推荐营销 |
| task_ks_search_user.js | 快手 | 搜索用户营销 |
| task_wx_toker.js | 微信 | 视频号推荐营销 |
| task_wx_search_inquiry.js | 微信 | 视频号搜索 |
| task_xhs_toker.js | 小红书 | 推荐营销 |
| task_xhs_fans.js | 小红书 | 涨粉 |
| task_xhs_yanghao.js | 小红书 | 养号 |
| task_xhs_ai_back.js | 小红书 | AI 智能回复 |

## 生产环境

| 组件 | 地址 | 状态 |
|---|---|---|
| 控制服务器 | localhost:8443 | 运行中 |
| 前端仪表盘 | localhost:5173 | 运行中 |
| PostgreSQL 18 | localhost:5432 | 运行中 |
| Redis 7.4.3 | localhost:6379 | 运行中 |
| BullMQ 队列 | phonefarm-tasks | 运行中 |
| UDP Relay | :8444 | 运行中 |

**域名**: `phone.openedskill.com` (Caddy HTTPS 反向代理)

## 开发约定

1. **主力开发 PhoneFarm Native APK** (android-client/)，不再依赖第三方运行时
2. **开发模式用 dev-server.ts** (JSON 文件存储)，生产模式用 index.ts (PostgreSQL)
3. **前端代理**: Vite 自动将 `/api/*` 和 `/ws/*` 代理到 `localhost:8443`
4. **WebSocket 协议**: 设备连 `/ws/device` (runtime=phonefarm-native)，前端连 `/ws/frontend`
5. **不要提交 .env 文件** — 已在 .gitignore 中
6. **修改数据库 schema 后**: 更新 `schema.ts` + `migrations/` + 运行迁移
7. **APK 构建前设置 JDK 21**: `$env:JAVA_HOME = "C:\Users\dishi\AppData\Local\PhoneFarm\jdk21\jdk-21.0.11+10"`
