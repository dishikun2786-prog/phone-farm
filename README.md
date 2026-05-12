# PhoneFarm — 远程手机群控自动化平台

## 项目定位

通过 Web 仪表盘可视化控制多台分布在不同网络的 Android 手机，自动执行微信视频号、抖音、快手、小红书的营销任务（浏览、点赞、评论、关注、私信等）。

**当前战略**：从依赖第三方 DeekeScript/AutoX v7 运行时 + Tailscale VPN → 自研 PhoneFarm Native Android APK + 自建 NAT 穿透通信，实现自主品牌、内置 VLM AI Agent、浮窗 AI 交互、模块化后安装的完整闭环。

## 架构概览

### 单机部署（开发/测试）

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
  - Redis (ioredis)
  - UDP Relay :8444
```

### 分裂部署（生产 — 本地控制 + 公网中继）

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

**隧道流向**：手机 → VPS BridgeServer → WebSocket 隧道 → 本地 BridgeClient → VirtualWS → 本地 Hub → 正常业务处理。本地服务器出站连接 VPS（无需公网 IP），手机入站连接 VPS（中继转发）。

**双运行时过渡策略**：

- **新方案（主力）**：PhoneFarm Native APK — Kotlin/Compose + Rhino JS 引擎，内嵌 AutoX v7 API 兼容层
- **旧方案（兼容）**：DeekeScript + ad-deeke 脚本，通过 `android-bridge/remote-bridge.js` 桥接

## 技术栈

| 层                   | 技术                                 | 版本                 |
| -------------------- | ------------------------------------ | -------------------- |
| 控制服务器           | Node.js + Fastify + TypeScript       | node 26.1, fastify 5 |
| 数据库               | PostgreSQL (Drizzle ORM)             | PG 18                |
| 缓存/队列            | Redis (ioredis)                      | 待装                 |
| 前端                 | React + Vite + TailwindCSS + Zustand | react 19, vite 8     |
| **Android APP 语言** | **Kotlin 2.1.0**                     |                      |
| **Android UI**       | **Jetpack Compose + Material 3**     | BOM 2024.12.01       |
| **Android 构建**     | **Gradle 8.7 + AGP 8.7 + KSP**       | JDK 21               |
| **JS 引擎**          | **Mozilla Rhino 1.7.15**             |                      |
| **WebSocket**        | **OkHttp 4.12.0**                    |                      |
| **本地存储**         | **Room 2.6.1 (SQLite)**              |                      |
| **DI**               | **Hilt 2.55 (Dagger + KSP)**         |                      |
| 最低 SDK             | 24 (Android 7.0)                     |                      |
| 目标 SDK             | 36                                   |                      |
| 传输                 | WebSocket TCP + UDP NAT 穿透         | 自建中继             |
| 部署                 | Docker Compose + Nginx               |                      |

## 目录结构

```
phone/
├── CLAUDE.md                   # ← 本文件
├── README.md
├── .gitignore
├── .github/workflows/          # CI/CD pipeline
│
├── control-server/             # 后端控制服务器
│   ├── .env
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   ├── migrations/
│   │   ├── 0000_initial.sql
│   │   └── 0001_vlm.sql
│   └── src/
│       ├── index.ts            # 生产入口 (PostgreSQL)
│       ├── dev-server.ts       # 开发入口 (JSON 文件存储)
│       ├── config.ts           # 环境变量 Zod 校验
│       ├── db.ts               # PG 连接 (drizzle-orm)
│       ├── schema.ts           # 数据库表定义
│       ├── ws-hub.ts           # WebSocket Hub
│       ├── routes.ts           # REST API 路由
│       ├── activation/         # 卡密验证系统
│       ├── vlm/                # VLM AI Agent 子系统
│       │   ├── vlm-orchestrator.ts
│       │   ├── action-parser.ts
│       │   ├── episode-recorder.ts
│       │   ├── script-compiler.ts
│       │   ├── vlm-client.ts
│       │   └── vlm-routes.ts
│       ├── auth/               # RBAC + API Key
│       ├── scheduler/          # Cron 定时调度
│       ├── queue/              # Redis 任务队列
│       ├── webhook/            # Webhook 通知
│       ├── alerts/             # 告警规则引擎
│       ├── stats/              # 统计计算
│       ├── remote/             # 远程命令
│       ├── crash/              # 崩溃上报
│       ├── scrcpy/             # 屏幕流中继
│       ├── proto/              # Protobuf 编解码
│       └── account/            # 账号数据删除
│
├── dashboard/                  # 前端仪表盘
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── lib/api.ts
│       ├── hooks/useWebSocket.ts
│       ├── store/index.ts
│       ├── components/         # 通用组件（含 ScrcpyPlayer/EpisodePlayer 等）
│       └── pages/
│           ├── Login.tsx
│           ├── DeviceList.tsx / DeviceDetail.tsx
│           ├── TaskList.tsx / TaskCreate.tsx
│           ├── AccountList.tsx
│           ├── VlmTaskPage.tsx
│           ├── admin/          # 管理面板（CardKey/DeviceGroup/BatchOp...）
│           └── ...
│
├── android-bridge/             # DeekeScript 桥接（旧方案，保留兼容）
│   ├── remote-bridge.js        # WebSocket 桥接模块
│   ├── autox-v7/               # AutoX v7 版 15 个任务脚本
│   ├── app-automation.js       # 自动化框架脚本
│   └── version.json
│
├── android-client/             # ★ PhoneFarm Native APK（新方案）
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   ├── gradle.properties
│   ├── gradle/libs.versions.toml
│   └── app/
│       ├── build.gradle.kts
│       └── src/main/
│           ├── AndroidManifest.xml
│           ├── res/
│           └── java/com/phonefarm/client/
│               ├── PhoneFarmApp.kt          # Application (Hilt 入口)
│               ├── MainActivity.kt          # 单 Activity
│               ├── ui/                      # Compose UI
│               │   ├── theme/               # Color/Type/Theme
│               │   ├── navigation/NavGraph.kt
│               │   ├── screens/             # 15+ 页面
│               │   └── components/          # 15+ 通用组件
│               ├── service/                 # AccessibilityService + 前台服务
│               ├── floating/                # 浮窗 AI 交互（13 个文件）
│               ├── bridge/                  # JS 桥接层（AutoX v7 兼容）
│               ├── engine/                  # Rhino 脚本引擎
│               ├── vlm/                     # VLM AI Agent
│               ├── model/                   # 本地 AI 模型管理
│               ├── network/                 # OkHttp/WebSocket/安全
│               ├── activation/              # 卡密激活
│               ├── permissions/             # 权限管理
│               ├── plugin/                  # 插件管理
│               ├── privilege/               # 高权限操作
│               ├── hardening/               # 加固与品牌兼容
│               ├── account/                 # 平台账号管理
│               ├── remote/                  # 远程命令
│               ├── update/                  # APK 自更新
│               ├── maintenance/             # 缓存/存储/流量
│               ├── crash/                   # 崩溃上报
│               ├── scrcpy/                  # 屏幕流编码
│               ├── data/local/              # Room DB + DAO
│               ├── data/repository/         # 数据仓库
│               └── di/AppModule.kt          # Hilt 模块
│
├── vlm-bridge/                 # Python VLM 微服务（ClawGUI 桥接）
├── deploy/                     # Docker Compose + Nginx 配置
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
# 终端1：控制服务器
cd control-server
npm run dev          # tsx watch src/dev-server.ts (JSON 文件，无需 PG)
npm run prod         # tsx src/index.ts (PostgreSQL)

# 终端2：前端仪表盘
cd dashboard
npm run dev          # http://localhost:5173
```

### 5. Android APK 构建

```bash
cd android-client
# 设置 JDK 21
$env:JAVA_HOME = "C:\Users\dishi\AppData\Local\PhoneFarm\jdk21\jdk-21.0.11+10"
.\gradlew.bat assembleDebug    # Debug APK
.\gradlew.bat assembleRelease  # Release APK
```

## Android APK 构建环境

| 配置项      | 值                                                                         |
| ----------- | -------------------------------------------------------------------------- |
| JDK         | 21.0.11+10 (`C:\Users\dishi\AppData\Local\PhoneFarm\jdk21\jdk-21.0.11+10`) |
| Gradle      | 8.7 (wrapper)                                                              |
| Kotlin      | 2.1.0                                                                      |
| KSP         | 2.1.0-1.0.29                                                               |
| Hilt        | 2.55                                                                       |
| Compile SDK | 36                                                                         |
| Min SDK     | 24                                                                         |
| Target SDK  | 36                                                                         |

## 当前运行状态

| 组件        | 地址            | 状态           |
| ----------- | --------------- | -------------- |
| 控制服务器  | localhost:8443  | 运行中         |
| 前端仪表盘  | localhost:5173  | 运行中         |
| PostgreSQL  | localhost:5432  | 运行中         |
| UDP Relay   | :8444           | 运行中         |
| Android APK | android-client/ | **编译通过 ✓** |

## 数据库表

| 表             | 说明         |
| -------------- | ------------ |
| devices        | 设备注册信息 |
| accounts       | 平台账号     |
| task_templates | 任务模板     |
| tasks          | 任务实例     |
| executions     | 执行记录     |
| users          | 用户认证     |
| vlm_episodes   | VLM 任务记录 |
| vlm_steps      | VLM 步骤详情 |
| vlm_scripts    | 编译后脚本   |

## 关键配置值

| 配置项         | 值                                              |
| -------------- | ----------------------------------------------- |
| UDP Relay 端口 | 8444                                            |
| 数据库密码     | 123456                                          |
| 默认登录       | admin / admin123                                |
| GitHub 仓库    | https://github.com/dishikun2786-prog/phone-farm |

## PhoneFarm Native APK 架构

### 核心设计

APK 内嵌 Rhino JS 引擎，将 AutoX v7 全部原生 API 注册为 Kotlin 对象，现有 15 个任务脚本无需修改即可运行。采用 MVVM + Repository + Kotlin Coroutines + Flow 架构。

### JS 桥接层（AutoX v7 完整兼容）

**全局函数 (11 个)**：`sleep`, `click`, `swipe`, `press`, `back`, `home`, `toast`, `log`, `inputText`, `currentPackage`, `selector`

**AutoX v7 原生对象 (8 个)**：`device`, `app`, `auto`, `events`, `images`, `files`, `engines`, `storages`

**selector() 链式 API**：`text()/desc()/id()/className()/clickable()` → `findOnce()/find()/findOne()` → UiObject 操作

### VLM AI Agent（9 步闭环）

```
截图 → 记忆检索 → 历史组装 → VLM 推理 → 动作解析 → 坐标归一化 → 执行 → Episode 录制 → 记忆更新
```

支持 5 种模型：AutoGLM-Phone-9B / UI-TARS / Qwen2.5-VL / MAI-UI / GUI-Owl

双模推理路由：云端 API（优先）+ 本地模型（llama.cpp JNI，离线场景），服务端可远程热切换。

### 浮窗 AI 交互（核心入口）

4 态状态机：Collapsed (56dp 气泡) → Expanded (280×400 对话) → Executing (执行进度) → SaveScript (命名保存)

功能：语音输入、附件上传、快捷指令 chips（云端下发）、对话历史持久化、任务队列

### 模块化后安装

核心 APK 轻量，VLM/Script/Task 组件通过 PluginManager 从服务端下载 → SHA-256 校验 → 静默安装（DeviceOwner/Shizuku/Root 自动选择）

### 网络韧性

8 种断线场景差异化处理 + 指数退避状态机 + 离线消息队列 + 网络类型感知（WiFi/4G/5G 自适应带宽）

### 通信安全 (4 层纵深)

TLS 1.3 + CertificatePinner → JWT + 设备指纹 → AES-256-GCM 载荷加密 → 流量混淆

## 任务脚本映射（15 个）

| 脚本                      | 平台   | 功能           |
| ------------------------- | ------ | -------------- |
| task_dy_toker.js          | 抖音   | 推荐营销       |
| task_dy_toker_city.js     | 抖音   | 同城营销       |
| task_dy_toker_comment.js  | 抖音   | 评论区互动     |
| task_dy_search_user.js    | 抖音   | 搜索用户营销   |
| task_dy_live_barrage.js   | 抖音   | 直播间弹幕     |
| task_dy_fans_inc_main.js  | 抖音   | 涨粉操作       |
| task_dy_ai_back.js        | 抖音   | AI 智能回复    |
| task_ks_toker.js          | 快手   | 推荐营销       |
| task_ks_search_user.js    | 快手   | 搜索用户营销   |
| task_wx_toker.js          | 微信   | 视频号推荐营销 |
| task_wx_search_inquiry.js | 微信   | 视频号搜索     |
| task_xhs_toker.js         | 小红书 | 推荐营销       |
| task_xhs_fans.js          | 小红书 | 涨粉           |
| task_xhs_yanghao.js       | 小红书 | 养号           |
| task_xhs_ai_back.js       | 小红书 | AI 智能回复    |

## 服务端 API 端点

```
# 卡密激活
POST /api/v1/activation/verify|bind|generate
GET  /api/v1/activation/status/:id
DELETE /api/v1/activation/unbind/:id

# 设备管理
GET  /api/v1/device/config?deviceId=
POST /api/v1/device/config

# 脚本 OTA
GET  /api/v1/scripts/manifest?runtime=
POST /api/v1/scripts/download|upload

# VLM AI
GET/POST/PUT/DELETE /api/v1/vlm/models
GET/POST/DELETE /api/v1/vlm/episodes
POST /api/v1/vlm/episodes/:id/compile
POST /api/v1/vlm/execute|/vlm/stop/:deviceId

# 插件管理
GET  /api/v1/plugins/manifest
GET  /api/v1/plugins/:id/download|versions

# 本地模型
GET  /api/v1/models/local/manifest
GET  /api/v1/models/local/:id/download|info
POST /api/v1/models/recommend
```

## 子模块任务脚本位置

- AutoX v7 版 15 个任务脚本：`android-bridge/autox-v7/`
- DeekeScript ad-deeke 任务脚本：`C:\www\wwwad-deeke\`（旧方案，保留兼容）

## 开发约定

1. **主力开发 PhoneFarm Native APK**（android-client/），不再依赖第三方运行时
2. **开发模式用 dev-server.ts**（JSON 文件存储），生产模式用 index.ts（PostgreSQL）
3. **前端代理**：Vite 自动将 `/api/*` 和 `/ws/*` 代理到 `localhost:8443`
4. **WebSocket 协议**：设备连 `/ws/device`（runtime=phonefarm-native），前端连 `/ws/frontend`
5. **不要提交 .env 文件** — 已在 .gitignore 中
6. **修改数据库 schema 后**：更新 `schema.ts` + `migrations/` + 运行迁移
7. **APK 构建前设置 JDK 21**：`$env:JAVA_HOME = "C:\Users\dishi\AppData\Local\PhoneFarm\jdk21\jdk-21.0.11+10"`

---

## 开发进度

### ✅ Phase 0 — 去 Tailscale + NAT 穿透通信基础设施 (100%)

- [x] **Android 端**：`NatDetector.kt` — STUN 式 NAT 类型检测（5 种类型）
- [x] **Android 端**：`UdpTransport.kt` — UDP 数据报传输（A/V 帧 1-byte 类型前缀）
- [x] **Android 端**：`TransportSelector.kt` — UDP/WebSocket 自动选择（OPEN→UDP, SYMMETRIC→WS）
- [x] **Android 端**：`WebSocketClient.sendBinaryFrame()` — 二进制帧发送（0x02 视频/0x05 音频）
- [x] **服务端**：`udp-relay.ts` — UDP :8444 中继（NAT 探测 + A/V 帧转发到前端 WS）
- [x] **服务端**：`ws-hub.ts` — `tailscaleIp` → `publicIp`，auth_ok 返回 `udpPort` + `natProbeEnabled`
- [x] **服务端**：`scrcpy-manager.ts` — `ScrcpyManager` → `AvRelayManager`（原生 A/V 中继，去除 ADB/Tailscale 依赖）
- [x] **服务端**：`config.ts` — `HEADSCALE_API_URL` → `UDP_RELAY_PORT`
- [x] **数据库**：`schema.ts` + `migrations/0000_initial.sql` — `tailscale_ip` → `public_ip`
- [x] **部署**：`docker-compose.yml` — 移除 headscale 服务，添加 UDP :8444 端口映射
- [x] **服务端**：`scrcpy-routes.ts` + `group-control.ts` + `dev-server.ts` — 全链路适配新架构
- [x] TypeScript 编译通过（`tsc --noEmit` 0 错误）
- [x] Android 编译通过（`BUILD SUCCESSFUL`）
- **架构变更**：双通道传输（WebSocket TCP 控制 + UDP A/V 优化），无需 Tailscale VPN

### ✅ Phase 1 — 项目骨架 + 基础架构 + UI 设计系统 (100%)

- Gradle 项目 + Kotlin/Compose/Hilt/Room/OkHttp/Rhino 依赖配置
- Compose 主题系统（Color/Type/Theme）+ 导航图 + 15+ 通用组件
- 9 个核心页面：Splash/Login/Activation/Home/PermissionGuide/PluginSetup/ScriptManager/TaskLog/Settings
- Room 数据库全表 + DAO + Entity
- 激活管理器 + 卡密验证逻辑
- **BUILD SUCCESSFUL ✓**

### ✅ Phase 2 — WebSocket + 网络韧性 + 安全 (95%)

- [x] WebSocketClient + WebSocketMessage 协议
- [x] ReconnectManager（8 种断线策略 + 指数退避）
- [x] ConnectionStateMonitor + OfflineQueue
- [x] CertificatePinner + MessageEncryptor + TokenRenewer
- [x] CloudConfigSyncer
- [x] BridgeForegroundService + BootReceiver
- [ ] 服务端 device-config-routes 联调

### ✅ Phase 3 — 无障碍服务 + JS 桥接层 (90%)

- [x] PhoneFarmAccessibilityService（节点查找/手势注入/全局动作/截图）
- [x] JsAutomation（UiSelector 链式 API + UiObject）
- [x] JsBridge + JsDevice/JsApp/JsAuto/JsEvents/JsImages/JsFiles/JsEngines/JsStorages/JsTask
- [x] ScriptEngine + ScriptManager + ScriptRepository
- [x] PermissionGuideScreen 完整实现
- [ ] 4 平台真机兼容性验证

### ✅ Phase 4 — 任务引擎 + 脚本管理 + OTA + 插件化 (70%)

- [x] PluginManager + PluginInstaller + PluginVerifier + PluginInfo
- [x] PluginSetupScreen
- [x] SilentInstallHelper + DeviceOwnerManager + RootPermissionChecker
- [x] ScriptManagerScreen + TaskLogScreen
- [x] TaskRepository + EpisodeRepository
- [ ] 15 个任务脚本 assets 打包
- [ ] 服务端 plugins-manifest-routes 联调

### ✅ Phase 5 — VLM AI Agent + 本地模型 + 浮窗交互 (80%)

- [x] VlmClient + 5 种模型适配器（AutoGLM/QwenVL/MAI-UI/GUI-Owl）
- [x] ActionParser + CoordinateNormalizer
- [x] VlmAgent + EpisodeRecorder + ScriptCompiler + MemoryManager
- [x] FloatWindowService + FloatTouchHandler + FloatChatView + FloatChatViewModel
- [x] SaveScriptDialog + QuickChipManager + FloatConversationRepo
- [x] FloatVoiceInput + FloatAttachmentHandler + FloatShareHelper
- [x] VlmAgentScreen + VlmConfig
- [x] ActionValidator + LoopDetector + PromptTemplateManager
- [x] ModelManager + LocalModelInfo + DeviceCapability
- [x] ModelManagerScreen
- [ ] llama.cpp JNI 编译 + LocalVlmClient
- [ ] 服务端 VLM 模型管理 API 联调

### ✅ Phase 7 — 加固 + 品牌兼容 (60%)

- [x] BrandConfig + MiuiCompat/EmuiCompat/ColorOsCompat/OriginOsCompat/OneUiCompat
- [x] EmulatorDetector
- [x] IntegrityChecker + AntiDebugDetector
- [ ] R8/ProGuard 混淆配置
- [ ] 多品牌真机安全引擎测试
- [ ] VirusTotal 扫描

### ✅ Phase 8 — 服务端补全 + 管理面板 (50%)

- [x] Cron 调度器 + Redis 任务队列 + RBAC + API Key
- [x] Webhook + 告警规则引擎
- [x] 设备分组 API + 统计 API
- [x] Dashboard 管理面板页面（CardKey/DeviceGroup/BatchOp/AuditLog/VlmUsage/AlertRule/ServerHealth）
- [ ] Redis 安装

### ✅ Phase 9 — 远程命令 + APP 自管理 + 任务增强 (80%)

- [x] RemoteCommandHandler + RemoteScreenshotCapture + RemoteFileManager + RemoteShellExecutor
- [x] SelfUpdater + AppUpdateChecker + UpdateCheckWorker
- [x] CacheCleaner + StorageMonitor + DataUsageTracker
- [x] CrashReporter + AnrWatchdog
- [x] TaskRetryPolicy + TaskTimeoutGuard + TaskPrecondition + TaskChainExecutor + TaskConcurrencyController
- [x] LocalCronScheduler + ScriptDryRunExecutor
- [x] PluginRollbackManager + PluginHealthChecker
- [x] AccountManager + AccountLoginHelper + AccountHealthCheck

### ✅ Phase 10 — UI 页面补全 + 浮窗增强 + VLM 质量 (90%)

- [x] AccountManagerScreen + ScriptEditorScreen + DiagnosticsScreen
- [x] NotificationsCenterScreen + LocalCronSchedulerScreen
- [x] PrivacyPolicyScreen + DataUsageScreen + HelpFaqScreen
- [x] PFDataUsageCard + PFDiagnosticsCard + PFSchedulerPicker + PFCodeEditor + PFEmptyState + PFExpandableSection + PFKeyValueRow
- [x] 批量选择模式 + 搜索过滤 + 排序切换
- [ ] 横屏/平板/分屏适配验证

### ✅ Phase 11 — 安全合规 + CI/CD + scrcpy + 交付 (40%)

- [x] ScreenEncoder (scrcpy H.264 推流)
- [x] SecurePreferences (EncryptedSharedPreferences)
- [x] CrashReporter + AnrWatchdog
- [x] AccountHealthCheckWorker
- [x] PermissionRationale
- [x] ScrcpyPlayer (Dashboard 端)
- [x] CI pipeline (GitHub Actions)
- [ ] 单元测试编写
- [ ] Compose UI 截图测试
- [ ] 安全审计 + OWASP Mobile Top 10
- [ ] Google Play 上架准备

### 整体进度：~72%

**当前焦点**：Phase 0 完成，双通道传输架构就绪。下一步进入真机安装测试和全链路联调。

## 分裂部署架构（本地控制 + 公网中继）

当本地机器无公网 IP 时，通过公网 VPS 作为中继桥接手机设备。

### 组件

| 组件             | 部署位置 | 说明                                       |
| ---------------- | -------- | ------------------------------------------ |
| **BridgeServer** | 公网 VPS | 接收手机/前端连接，通过隧道转发到本地      |
| **BridgeClient** | 本地机器 | 出站连接 VPS，创建 VirtualWS 注入本地 Hub  |
| **UDP Relay**    | 公网 VPS | 转发音视频帧到本地（通过控制隧道二进制帧） |

### 启动方式

**VPS 端**（`deploy/vps-relay/`）：

```bash
cd deploy/vps-relay
# 配置 .env（参考 .env.example）
docker compose up -d
# 或直接运行: npx tsx src/vps-relay.ts
```

**本地端**（`deploy/local/`）：

```bash
cd deploy/local
# 配置 .env（必须设置 BRIDGE_RELAY_URL 和 BRIDGE_CONTROL_TOKEN）
docker compose up -d
# 或开发模式: BRIDGE_RELAY_URL=ws://vps-ip:80/ws/control npx tsx src/dev-server.ts
```

### 环境变量

本地端额外需要：

```bash
BRIDGE_RELAY_URL=ws://your-vps-ip:80/ws/control   # VPS 桥接地址
BRIDGE_CONTROL_TOKEN=shared-secret-token           # 与 VPS CONTROL_TOKEN 一致
```

### 手机 APK 配置

手机端 WebSocket URL 指向 VPS：

```
wss://your-vps-domain/ws/phone  (生产 TLS)
ws://your-vps-ip:80/ws/phone    (测试)
```

### 数据流

```
手机 → VPS/ws/phone → BridgeServer → 隧道 → BridgeClient → VirtualWS → Hub → 业务逻辑
Hub → VirtualWS.send() → BridgeClient → 隧道 → BridgeServer → 手机
Dashboard → 本地 Hub (直连，无需经过 VPS)
UDP 帧 → VPS:8444 → 隧道二进制帧 → BridgeClient.onUdpFrame → 本地处理
```

## 已知待办（按优先级排列）

### 高优先级 — 核心功能验证

- [x] **分裂部署架构实现**（BridgeServer + BridgeClient + VPS deploy config）
- [ ] **真机安装测试**（APK → 激活 → 权限 → 连接 → WebSocket 通信）
- [ ] **15 个 AutoX v7 任务脚本** 在 Rhino 引擎中的实际执行验证（抖音/快手/微信/小红书 4 平台）
- [ ] **服务端与 APK 全链路联调**（device-config / VLM models / plugins-manifest / scripts-manifest API）

### 中优先级 — 关键模块补全

- [ ] **llama.cpp JNI NDK 交叉编译**（arm64-v8a + armeabi-v7a）+ LocalVlmClient 实现
- [ ] **R8/ProGuard 混淆规则**编写（含 Keep 规则：Rhino 反射/OkHttp/Compose/Hilt）
- [ ] **服务端 VLM 模型管理 API** 与 APK 联调
- [ ] **scrcpy 屏幕流端到端测试**（ScreenEncoder → UDP Relay → ScrcpyPlayer）
- [ ] **Redis 安装**和 BullMQ 任务队列实际部署

### 低优先级 — 测试与发布

- [ ] 单元测试编写（JUnit 5 + MockK + Turbine）
- [ ] Compose UI 截图测试（6 个关键页面 x 双主题）
- [ ] 多品牌真机兼容性测试（小米/华为/OPPO/VIVO/三星/Pixel）
- [ ] 安全审计 + OWASP Mobile Top 10 检查
- [ ] VirusTotal 扫描 + 安全厂商白名单备案
- [ ] HTTPS/WSS 生产配置
- [ ] Google Play 上架准备
