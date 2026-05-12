# PhoneFarm 边缘-云端重构 — 开发规范 & 并行开发计划

> **文档版本**: v1.0  
> **日期**: 2026-05-12  
> **状态**: 执行中  
> **前提**: 已授权完全自主审批，按本计划推进

---

## 目 录

- [Part A: 统一开发规范](#part-a-统一开发规范)
  - [A1. 命名规范](#a1-命名规范)
  - [A2. 项目结构规范](#a2-项目结构规范)
  - [A3. API 设计规范](#a3-api-设计规范)
  - [A4. WebSocket 协议规范](#a4-websocket-协议规范)
  - [A5. 数据库设计规范](#a5-数据库设计规范)
  - [A6. 错误处理规范](#a6-错误处理规范)
  - [A7. 测试规范](#a7-测试规范)
  - [A8. Git 工作流规范](#a8-git-工作流规范)
- [Part B: 多角色并行开发计划](#part-b-多角色并行开发计划)
  - [B1. 团队结构](#b1-团队结构)
  - [B2. 接口契约 (跨团队约定)](#b2-接口契约-跨团队约定)
  - [B3. Sprint 计划](#b3-sprint-计划)
  - [B4. 任务分解 (WBS)](#b4-任务分解-wbs)
  - [B5. 里程碑 & 验收标准](#b5-里程碑--验收标准)
  - [B6. 风险管理](#b6-风险管理)

---

# Part A: 统一开发规范

## A1. 命名规范

### A1.1 跨层统一规则

| 上下文 | 约定 | 示例 | 适用范围 |
|--------|------|------|---------|
| 文件名 | `kebab-case` | `decision-engine.ts`, `screen-analyzer.kt`, `stream-manager.tsx` | 全栈 |
| 目录名 | `kebab-case` | `edge/`, `decision/`, `memory/`, `orchestration/` | 全栈 |
| 类/接口/类型 | `PascalCase` | `DecisionRouter`, `EdgePipeline`, `StreamManager` | 全栈 |
| 函数/方法/变量 | `camelCase` | `determineRoute()`, `sendToDevice()`, `handleClick()` | 全栈 |
| 常量/枚举值 | `SCREAMING_SNAKE_CASE` | `MAX_RETRY_COUNT`, `DEFAULT_TIMEOUT_MS` | 全栈 |
| 私有字段 | `#`前缀 (TS) / `_`前缀无 backing (Kotlin) | `#devices`, `_uiState` | 按语言 |

### A1.2 TypeScript 服务端

```
文件:       kebab-case.ts          → decision-engine.ts, qwen-vl-client.ts
类:         PascalCase             → DecisionRouter, MemoryRetriever
接口:       PascalCase             → DecisionInput, TaskResult
类型别名:   PascalCase             → DeviceAction, PageType
函数:       camelCase              → determineRoute(), buildPrompt()
变量:       camelCase              → deviceId, sessionCount
枚举值:     SCREAMING_SNAKE_CASE   → DEEPSEEK_API_KEY
数据库表:   snake_case 复数        → device_memories, experience_rules
数据库列:   snake_case             → public_ip, current_app
API路径:    kebab-case 单/复数     → /api/v1/task-templates, /api/v1/stream/start
WS消息类型: snake_case             → device_heartbeat, task_status_update
环境变量:   SCREAMING_SNAKE_CASE   → DASHSCOPE_API_KEY, DEEPSEEK_MODEL
```

### A1.3 Kotlin Android

```
文件:         PascalCase.kt           → EdgePipeline.kt, ScreenAnalyzer.kt
类/对象:      PascalCase              → EdgePipeline, UiDetector
接口:         PascalCase              → ReactionRuleRepository
数据类:       PascalCase              → ChangeAnalysis, DetectionResult
函数:         camelCase               → analyze(), extract(), compile()
变量:         camelCase               → prevGray, stableFrameCount
常量:         SCREAMING_SNAKE_CASE    → ANALYSIS_WIDTH, STABLE_THRESHOLD
Composable:   PF前缀 + PascalCase     → PFButton, PFStatusBadge
Screen:       PascalCase + Screen     → LoginScreen, SettingsScreen
ViewModel:    PascalCase + ViewModel  → LoginViewModel, SettingsViewModel
UiState:      PascalCase + UiState    → LoginUiState, HomeUiState
Entity:       PascalCase + Entity     → ActivationEntity, TaskLogEntity
Dao:          PascalCase + Dao        → ActivationDao, EpisodeDao
Repository:   PascalCase + Repository → TaskRepository, DeviceRepository
资源文件:     snake_case               → login_title, settings_server_url
布局ID:       snake_case               → notif_channel_task
```

### A1.4 React 前端

```
文件:         PascalCase.tsx           → DeviceList.tsx, ScrcpyPlayer.tsx
组件:         PascalCase (默认导出)     → DeviceList, StatusBadge
Hook:         camelCase + use前缀      → useWebSocket, useToast
Store:        camelCase + Store        → useStore, useToastState
API方法:      camelCase                → getDevices(), createTask()
接口:         PascalCase               → Device, Task, LiveInfo
类型联合:     PascalCase + 描述后缀    → StatusVariant, FilterKey
Props:        PascalCase + Props       → SearchBarProps, ConfirmDialogProps
路由路径:     kebab-case               → /admin/card-keys, /vlm/episodes
CSS类:        Tailwind原生 (无自定义)   → bg-blue-600, rounded-xl
自定义动画:   kebab-case               → slide-in-right, fade-in
```

---

## A2. 项目结构规范

### A2.1 服务端 (control-server/src/)

```
src/
├── index.ts                 # 生产入口 (Fastify + PG)
├── dev-server.ts            # 开发入口 (JSON文件存储)
├── config.ts                # Zod环境变量校验 (唯一入口)
├── db.ts                    # Drizzle ORM实例 + 连接池
├── schema.ts                # 所有数据库表定义
├── ws-hub.ts                # WebSocket Hub (设备/前端连接管理)
│
├── [domain]/                # 按领域分包 (kebab-case)
│   ├── [domain]-routes.ts   # Fastify路由注册
│   ├── [domain]-types.ts    # 领域类型定义
│   └── [feature].ts         # 领域内功能模块
│
├── decision/                # ★ 新增: 双模型决策
│   ├── decision-router.ts   # 路由网关
│   ├── decision-engine.ts   # 决策主循环
│   ├── deepseek-client.ts   # DeepSeek V4 Flash
│   ├── qwen-vl-client.ts    # Qwen3-VL-Flash (百炼)
│   ├── prompt-builder.ts    # 双模式提示词
│   ├── safety-guard.ts      # 安全护栏
│   ├── decision-routes.ts   # REST + WS集成
│   └── types.ts             # 决策领域类型
│
├── edge/                    # ★ 新增: 边缘状态处理
│   ├── state-ingestor.ts    # Protobuf解析 + 校验
│   └── state-store.ts       # Redis设备状态缓存
│
├── memory/                  # ★ 新增: 跨设备记忆
│   ├── memory-store.ts      # pgvector持久化
│   ├── memory-retriever.ts  # 三级检索
│   └── experience-compiler.ts # 经验自动编译
│
├── stream/                  # ★ 重构: 按需音视频流
│   └── stream-manager.ts    # 流生命周期管理
│
├── orchestration/           # ★ 新增: 多设备编排
│   ├── campaign-engine.ts
│   └── device-coordinator.ts
│
├── auth/                    # 已有
├── vlm/                     # 将被decision/替代 (Phase E移除)
├── relay/                   # 已有 (BridgeServer/BridgeClient)
├── scrcpy/                  # 保留 (被stream/包装)
├── activation/              # 已有
├── scheduler/               # 已有
├── queue/                   # 已有
├── webhook/                 # 已有
├── alerts/                  # 已有
├── stats/                   # 已有
├── remote/                  # 已有
├── crash/                   # 已有
├── proto/                   # 已有
├── account/                 # 已有
└── migrations/              # SQL迁移文件
    ├── 0000_initial.sql
    ├── 0001_vlm.sql
    └── 0002_edge_memory.sql # ★ 新增
```

**规则**:
- 每个领域目录包含 `-routes.ts` 用于 Fastify 注册
- 领域对外暴露类型通过 `-types.ts`
- 跨领域依赖通过接口注入 (如 `WsHubLike`)，避免直接 import 具体类
- 禁止循环依赖

### A2.2 Android (android-client/.../client/)

```
client/
├── PhoneFarmApp.kt          # Application (Hilt入口)
├── MainActivity.kt          # 单Activity
│
├── di/
│   └── AppModule.kt         # Hilt @Module (所有@Provides)
│
├── [domain]/                # 按领域分包
│   ├── [Feature].kt         # 核心类
│   ├── [Feature]Controller.kt # 控制器 (如需)
│   └── model/
│       └── [Domain]Models.kt # 领域数据类
│
├── edge/                    # ★ 新增: 边缘CV管线
│   ├── EdgePipeline.kt      # 管线编排器
│   ├── ScreenAnalyzer.kt    # OpenCV分析
│   ├── TextExtractor.kt     # ML Kit OCR
│   ├── UiDetector.kt        # YOLO-nano TFLite
│   ├── StateCompiler.kt     # 状态编译
│   ├── StateProtobuf.kt     # Protobuf序列化
│   ├── LocalReactor.kt      # 本地快速反应
│   └── model/
│       ├── EdgeModels.kt    # ChangeAnalysis, OcrResult等
│       └── ReactionRule.kt  # 反应规则模型
│
├── stream/                  # ★ 新增: 按需流控制
│   └── StreamController.kt
│
├── network/                 # 已有 (保留)
├── data/local/              # 已有 (Room, DAO合并在Daos.kt, Entity合并在Entities.kt)
├── data/repository/         # 已有
├── ui/theme/                # 已有
├── ui/screens/              # 已有 (Screen + ViewModel + UiState同文件)
├── ui/components/           # 已有 (PF前缀组件)
├── ui/navigation/           # 已有
├── service/                 # 已有
├── bridge/                  # 已有
├── vlm/                     # 将被简化 (移除LocalVlmClient/InferenceRouter/MemoryManager)
├── engine/                  # 已有
├── floating/                # 已有
└── scrcpy/                  # 已有 (保留ScreenEncoder)
```

**规则**:
- Screen + ViewModel + UiState 必须在同一文件
- DAO 全部合并在 `Daos.kt`
- Entity 全部合并在 `Entities.kt`
- 网络 DTO 全部合并在 `ApiService.kt`
- 可复用 Compose 组件以 `PF` 前缀命名
- 每行不超过 140 字符

### A2.3 前端 (dashboard/src/)

```
src/
├── main.tsx                 # 入口 + ErrorBoundary
├── App.tsx                  # 路由 + WebSocket + 认证
├── index.css                # Tailwind 导入 + 自定义动画
│
├── lib/
│   └── api.ts               # 唯一 API 客户端 (fetch封装)
│
├── store/
│   └── index.ts             # 唯一 Zustand store (AppState)
│
├── hooks/
│   ├── useWebSocket.ts      # WebSocket hook
│   └── useToast.ts          # Toast store + 工具函数
│
├── components/              # 可复用组件 (PascalCase文件名)
│   ├── Layout.tsx
│   ├── PageWrapper.tsx      # 加载/错误/空状态统一处理
│   ├── Skeleton.tsx         # 骨架屏
│   ├── SearchBar.tsx
│   ├── FilterBar.tsx
│   ├── Pagination.tsx
│   ├── ConfirmDialog.tsx
│   ├── Toast.tsx
│   ├── ErrorBoundary.tsx
│   ├── StatusBadge.tsx
│   ├── ConnectivityBadge.tsx
│   ├── StatsDashboard.tsx
│   ├── ScrcpyPlayer.tsx     # 视频播放器 (保留)
│   └── ...
│
└── pages/                   # 页面级组件
    ├── Login.tsx
    ├── DeviceList.tsx
    ├── DeviceDetail.tsx     # ★ 修改: + 查看实时画面按钮
    ├── TaskList.tsx
    ├── TaskCreate.tsx
    └── admin/
        └── ...
```

**规则**:
- 组件默认导出，不命名导出
- Store 领域使用 `{items, loading, error}` 三元组
- API 调用统一通过 `api` 对象
- 401 自动跳转 `/login`
- Toast 用 `toast(type, message)` 函数 (不是 hook)
- 所有路由扁平 (不嵌套)
- Tailwind 类直接使用，无自定义 CSS (除动画关键帧)

---

## A3. API 设计规范

### A3.1 URL 结构

```
/api/v1/<resource>[/:id][/action]

示例:
  GET    /api/v1/devices                   # 列表
  GET    /api/v1/devices/:id               # 详情
  POST   /api/v1/devices/:id/command       # 操作
  POST   /api/v1/decision/start            # ★ 启动决策
  POST   /api/v1/decision/stop             # ★ 停止决策
  GET    /api/v1/decision/status/:deviceId # ★ 决策状态
  POST   /api/v1/stream/start              # ★ 开启视频流
  POST   /api/v1/stream/stop               # ★ 停止视频流
  GET    /api/v1/stream/status/:deviceId   # ★ 流状态
  GET    /api/v1/stream/stats              # ★ 流统计
  GET    /api/v1/memory/stats              # ★ 记忆统计
```

### A3.2 请求/响应格式

**成功响应**:
```typescript
// 列表
GET /api/v1/devices → Device[]

// 详情
GET /api/v1/devices/:id → Device | { error: "Not found" }

// 创建
POST /api/v1/devices → 201 + Device

// 操作
POST /api/v1/decision/start → { status: "started", deviceId }
```

**错误响应**:
```typescript
{ error: "Human-readable error message" }
// HTTP 状态码: 400 验证错误, 401 未授权, 404 未找到, 500 服务器错误
```

**验证**: 使用 Zod schema 校验请求体
```typescript
const schema = z.object({
  deviceId: z.string().min(1),
  taskPrompt: z.string().min(1).max(500),
  maxSteps: z.number().int().min(1).max(100).optional(),
});
const body = schema.parse(req.body);
```

### A3.3 新 API 端点清单

| 方法 | 路径 | 描述 | 模块 |
|------|------|------|------|
| POST | `/api/v1/decision/start` | 开始 AI 决策任务 | decision |
| POST | `/api/v1/decision/stop` | 停止 AI 决策任务 | decision |
| GET | `/api/v1/decision/status/:deviceId` | 查询决策状态 | decision |
| GET | `/api/v1/decision/stats` | 双模型路由统计 | decision |
| POST | `/api/v1/stream/start` | 开启音视频流 | stream |
| POST | `/api/v1/stream/stop` | 停止音视频流 | stream |
| GET | `/api/v1/stream/status/:deviceId` | 查询流状态 | stream |
| GET | `/api/v1/stream/stats` | 全局流统计 | stream |
| GET | `/api/v1/memory/stats` | 记忆系统统计 | memory |
| POST | `/api/v1/memory/rules/sync` | 下发经验规则到设备 | memory |

---

## A4. WebSocket 协议规范

### A4.1 消息类型命名

所有消息类型使用 `snake_case`，格式: `{domain}_{action}`。

```
已有消息 (保留):
  auth, auth_ok, auth_error
  heartbeat, device_online, device_offline
  task_status, task_result, task_status_update
  screenshot, device_screenshot
  command, start_task, stop_task
  subscribe, unsubscribe

新增消息:
  ★ EdgeState (二进制帧 0x10)        # APK → Server, Protobuf
  ★ execute_decision                 # Server → APK, JSON
  ★ decision_complete                # Server → APK, JSON
  ★ step_result                      # APK → Server, JSON (success/fail)
  ★ start_stream                     # Server → APK, JSON
  ★ stop_stream                      # Server → APK, JSON
  ★ stream_started                   # APK → Server, JSON
  ★ stream_stopped                   # APK → Server, JSON
  ★ reaction_rules_update            # Server → APK, JSON (经验规则下发)
```

### A4.2 二进制帧类型

| 帧标识 | 类型 | 内容 | 编码 |
|--------|------|------|------|
| `0x02` | VideoNAL | H.264 NAL 单元 | 二进制 (已有,保留) |
| `0x05` | AudioFrame | AAC 音频帧 | 二进制 (已有,保留) |
| `0x10` | EdgeState | 设备结构化状态 | **Protobuf** (新增) |

### A4.3 新增 JSON 消息 Schema

```jsonc
// execute_decision (Server → APK)
{
  "type": "execute_decision",
  "payload": {
    "decisionId": "qwen-vl-1715500000-5",
    "action": { "type": "tap", "x": 540, "y": 800 },
    "confidence": 0.95,
    "finished": false,
    "needScreenshot": false,
    "modelUsed": "qwen-vl",           // 实际使用的模型
    "nextStepHint": "点击关注按钮"
  }
}

// step_result (APK → Server)
{
  "type": "step_result",
  "payload": {
    "decisionId": "qwen-vl-1715500000-5",
    "deviceId": "abc123",
    "outcome": "success",             // "success" | "fail"
    "errorReason": null,
    "elapsedMs": 350,
    "newScreenshot": true             // 有新截图可用
  }
}
```

---

## A5. 数据库设计规范

### A5.1 通用规则

| 规则 | 说明 |
|------|------|
| 表名 | `snake_case` 复数 |
| 列名 | `snake_case` |
| 主键 | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` |
| 外键 | `uuid REFERENCES table(id) ON DELETE [cascade|set null]` |
| 时间戳 | `TIMESTAMPTZ DEFAULT NOW()` |
| 审计列 | 每个表含 `created_at`, `updated_at` (如需要) |
| 枚举 | Drizzle `pgEnum('name', [...values])` |
| JSON | `JSONB DEFAULT '{}'` |
| 索引 | 外键 + 高频查询列 + 向量列 (ivfflat) |
| 迁移 | 编号递增: `0000_`, `0001_`, `0002_` |

### A5.2 新增表 DDL

```sql
-- 0002_edge_memory.sql

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE device_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    page_type TEXT,
    scenario TEXT NOT NULL,
    state_signature TEXT NOT NULL,
    observation TEXT NOT NULL,
    action_taken JSONB NOT NULL,
    outcome TEXT NOT NULL,
    error_reason TEXT,
    embedding vector(1024),
    success_count INTEGER DEFAULT 1,
    fail_count INTEGER DEFAULT 0,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    UNIQUE (device_id, state_signature)
);

CREATE INDEX idx_memory_embedding ON device_memories
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_memory_signature ON device_memories (state_signature, platform);
CREATE INDEX idx_memory_platform ON device_memories (platform, page_type);

CREATE TABLE experience_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL,
    scenario TEXT NOT NULL,
    conditions JSONB NOT NULL,
    auto_action JSONB NOT NULL,
    confidence FLOAT DEFAULT 0.5,
    verified_by_devices INTEGER DEFAULT 0,
    total_successes INTEGER DEFAULT 0,
    total_trials INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rules_platform ON experience_rules (platform, enabled, confidence DESC);
```

---

## A6. 错误处理规范

### A6.1 服务端

```typescript
// 1. Zod验证 → Fastify自动400
const body = schema.parse(req.body);

// 2. 业务错误 → 带状态码
if (!device) return reply.status(404).send({ error: 'Device not found' });

// 3. 前置处理器 → throw
throw { statusCode: 401, message: 'Invalid token' };

// 4. 全局try-catch (WebSocket)
try { const msg = JSON.parse(raw); handle(msg); } catch { /* ignore malformed */ }

// 5. 启动错误 → process.exit(1)
try { await app.listen(...) } catch (err) { app.log.error(err); process.exit(1); }
```

### A6.2 Android

```kotlin
// ViewModel: 错误存入UiState
try { ... } catch (e: HttpException) { _uiState.value = _uiState.value.copy(errorMessage = "...") }

// Repository: 返回null
fun getById(id: String): TaskEntity? = try { dao.get(id) } catch (e: Exception) { null }

// Edge管线: 降级处理
val ocr = try { textExtractor.extract(screenshot) } catch (e: Exception) { null }
```

### A6.3 前端

```typescript
// Store action 模式
try {
  const data = await api.getDevices();
  set({ devices: data, devicesLoading: false });
} catch (err: any) {
  set({ devicesLoading: false, devicesError: err.message });
  toast('error', err.message);
}

// PageWrapper 统一处理
<PageWrapper loading={loading} error={error} empty={list.length === 0}>
```

---

## A7. 测试规范

### A7.1 测试框架

| 层 | 框架 | 覆盖率目标 |
|----|------|-----------|
| 服务端 | Vitest | >80% (核心模块) |
| Android | JUnit 5 + MockK + Turbine | >70% (核心模块) |
| 前端 | Vitest + React Testing Library | >60% (关键页面) |

### A7.2 命名规范

```
服务端: src/[domain]/__tests__/[feature].test.ts
Android: app/src/test/java/.../ [domain]/[Feature]Test.kt
前端:   src/__tests__/[Component].test.tsx
```

### A7.3 必测用例

| 模块 | 优先级 | 最小用例数 |
|------|--------|-----------|
| DecisionRouter (路由逻辑) | P0 | 10 (6种路由条件 + 4种回退) |
| DeepSeekClient (API调用) | P0 | 3 (成功/重试/超时) |
| QwenVLClient (API调用) | P0 | 3 (成功/重试/图片解析) |
| SafetyGuard (安全校验) | P0 | 5 (越界/黑名单/文本/重复/频率) |
| ScreenAnalyzer (变化检测) | P1 | 5 (稳定/变化/弹窗/键盘/白屏) |
| StateCompiler (状态合并) | P1 | 3 (正常/异常/空值) |
| MemoryRetriever (记忆检索) | P1 | 4 (精确/语义/规则/空结果) |
| EdgePipeline (端到端) | P1 | 3 (正常/本地反应/异常截图) |

---

## A8. Git 工作流规范

### A8.1 分支策略

```
master                          # 生产分支 (永远可部署)
  ├── develop                   # 集成分支
  │   ├── feat/decision-engine  # Phase A: 决策引擎
  │   ├── feat/edge-pipeline    # Phase B: 边缘CV管线
  │   ├── feat/cross-memory     # Phase C: 跨设备记忆
  │   ├── feat/on-demand-stream # Phase D: 按需音视频流
  │   └── feat/orchestration    # Phase E: 编排+清理
  └── hotfix/*                  # 紧急修复
```

### A8.2 提交规范

```
<type>(<scope>): <subject>

类型: feat, fix, refactor, test, docs, chore
范围: server, android, dashboard, docs
主题: 中文, 不超过50字

示例:
  feat(server): 实现DecisionRouter双模型路由网关
  feat(android): 添加EdgePipeline边缘CV管线
  fix(server): 修复QwenVLClient图片base64编码问题
  test(server): DecisionRouter 6种路由条件单元测试
  chore(server): 添加pgvector扩展 + 0002迁移
```

### A8.3 Code Review 要求

- 每个 PR 必须至少 1 人 review
- PR 描述必须包含: 变更摘要、测试计划、截图(如有UI变更)
- CI 通过 (lint + typecheck + test) 才能合并
- 禁止直接 push 到 master/develop

---

# Part B: 多角色并行开发计划

## B1. 团队结构

```
┌─────────────────────────────────────────────────────────────┐
│                      架构 & 技术负责人                        │
│           (Architect) — 接口契约, 代码审查, 集成              │
└────────────────────────┬────────────────────────────────────┘
                         │
     ┌───────────────────┼───────────────────┐
     │                   │                   │
┌────▼─────┐    ┌───────▼───────┐    ┌──────▼──────┐
│ 后端开发  │    │  Android 开发   │    │  前端开发    │
│ (2人)    │    │   (2人)        │    │   (1人)     │
│          │    │                │    │             │
│ ·决策引擎 │    │ ·边缘CV管线     │    │ ·Dashboard  │
│ ·记忆系统 │    │ ·状态编译       │    │  流控UI     │
│ ·流管理   │    │ ·流控制器       │    │ ·API对接    │
│ ·API路由  │    │ ·本地反应器     │    │ ·设备详情页 │
└──────────┘    └────────────────┘    └─────────────┘
     │                   │                   │
     └───────────────────┼───────────────────┘
                         │
              ┌──────────▼──────────┐
              │    QA & 集成测试     │
              │      (1人)          │
              │ · E2E测试            │
              │ · 性能基准测试       │
              │ · 真机验收           │
              └─────────────────────┘
```

### 角色分配 (5人团队)

| 角色 | 人数 | 职责 | 技术栈 |
|------|------|------|--------|
| **架构师** (兼后端1) | 1 | 接口契约定义, 架构决策, DecisionRouter, MemoryRetriever, 代码审查 | TypeScript, pgvector |
| **后端开发2** | 1 | DeepSeekClient, QwenVLClient, StreamManager, decision-routes, 迁移脚本 | TypeScript, Fastify, Redis |
| **Android 开发1** | 1 | EdgePipeline, ScreenAnalyzer, UiDetector, StateCompiler | Kotlin, OpenCV, TFLite |
| **Android 开发2** | 1 | TextExtractor, LocalReactor, StateProtobuf, StreamController, WebSocketDispatcher 改造 | Kotlin, ML Kit, Protobuf |
| **前端开发** | 1 | Dashboard 流控UI, DeviceDetail 改造, 新API对接, toast/loading | React, Zustand, Tailwind |

---

## B2. 接口契约 (跨团队约定)

> **关键**: 各团队在开发前必须先确认接口契约, 按契约并行开发, 集成时零冲突。

### B2.1 Protobuf 契约 (Android ↔ 服务端)

```protobuf
// ★ 由架构师定义, Android和服务端共同遵守
// 文件位置: android-client/app/src/main/proto/edge_state.proto
//           control-server/src/proto/edge_state.proto (副本)

syntax = "proto3";
package phonefarm.edge;

message EdgeState {
  int64 timestamp_ms = 1;
  string device_id = 2;
  string current_app = 3;
  string app_label = 4;
  PageType page_type = 5;
  bool page_stable = 6;
  int32 screen_width = 7;
  int32 screen_height = 8;
  repeated UiElement interactive_elements = 9;
  repeated TextBlock text_blocks = 10;
  repeated Detection detections = 11;
  float change_ratio = 12;
  repeated Rect change_regions = 13;
  int32 stable_frames = 14;
  bool keyboard_visible = 15;
  repeated string anomaly_flags = 16;
  optional TaskState task_state = 17;
  optional bytes screenshot_jpeg = 18;
}
// (完整定义见 EDGE_CLOUD_ARCHITECTURE_SPEC.md 第6章)
```

### B2.2 WebSocket 消息契约 (Android ↔ 服务端)

```
★ 由架构师定义, Android和服务端共同遵守

JSON消息 (所有新增消息):
  execute_decision:  { type: "execute_decision", payload: DecisionOutput }
  step_result:       { type: "step_result", payload: StepResult }
  start_stream:      { type: "start_stream", payload: StreamConfig }
  stop_stream:       { type: "stop_stream", payload: { reason: string } }
  stream_started:    { type: "stream_started", payload: { resolution: ... } }
  stream_stopped:    { type: "stream_stopped", payload: { reason: string } }
  reaction_rules_update: { type: "reaction_rules_update", payload: ReactionRule[] }

二进制帧:
  0x10 EdgeState (Protobuf序列化)

DecisionOutput:
  { decisionId, action: DeviceAction, confidence: number,
    finished: boolean, needScreenshot: boolean,
    nextStepHint: string, modelUsed: "deepseek"|"qwen-vl"|"rule"|"none" }
```

### B2.3 REST API 契约 (前端 ↔ 服务端)

```
★ 由架构师定义, 前端和后端共同遵守

POST /api/v1/decision/start
  Request:  { deviceId: string, taskPrompt: string, maxSteps?: number, platform?: string }
  Response: { status: "started", deviceId: string }

POST /api/v1/decision/stop
  Request:  { deviceId: string, reason?: string }
  Response: { status: "stopped", deviceId: string }

GET /api/v1/decision/status/:deviceId
  Response: { deviceId: string, state: EdgeState | null }

POST /api/v1/stream/start
  Request:  { deviceId: string, options?: { maxSize?, bitRate?, maxFps?, audio? } }
  Response: { status: "ok", deviceId: string, session: { status, resolution } }

POST /api/v1/stream/stop
  Request:  { deviceId: string }
  Response: { status: "stopped", deviceId: string }

GET /api/v1/stream/status/:deviceId
  Response: { deviceId, status, resolution, subscribers, startedAt, bytesTransferred }

GET /api/v1/stream/stats
  Response: { totalStreams, streamingCount, totalBytesTransferred, totalSubscribers }

GET /api/v1/memory/stats
  Response: { totalMemories, totalRules, compiledToday, matchRate }
```

### B2.4 数据契约 (决策引擎输入/输出)

```typescript
// ★ 架构师定义, 所有后端模块遵守
// 文件: control-server/src/decision/types.ts

export interface DecisionInput {
  deviceId: string;
  currentApp: string;
  appLabel: string;
  pageType: string;
  pageStable: boolean;
  textBlocks: TextBlock[];
  interactiveElements: UiElement[];
  detections: Detection[];
  changeRatio: number;
  keyboardVisible: boolean;
  anomalyFlags: string[];
  screenshotBase64?: string;
  screenshotWidth?: number;
  screenshotHeight?: number;
}

export interface DecisionOutput {
  decisionId: string;
  thinking: string;
  action: DeviceAction;
  confidence: number;
  finished: boolean;
  needScreenshot: boolean;
  nextStepHint: string;
  modelUsed: 'deepseek' | 'qwen-vl' | 'rule' | 'none';
}

export type DeviceAction =
  | { type: 'tap'; x: number; y: number }
  | { type: 'long_press'; x: number; y: number; durationMs?: number }
  | { type: 'swipe'; x1: number; y1: number; x2: number; y2: number; durationMs?: number }
  | { type: 'type'; text: string }
  | { type: 'back' } | { type: 'home' }
  | { type: 'launch'; packageName: string }
  | { type: 'wait'; durationMs: number }
  | { type: 'terminate'; message?: string };
```

---

## B3. Sprint 计划

```
Sprint 1 (Week 1-2)         Sprint 2 (Week 3-4)         Sprint 3 (Week 5-6)         Sprint 4 (Week 7-8)
══════════════════          ══════════════════          ══════════════════          ══════════════════

后端1 (架构师):              后端1:                       后端1:                       后端1:
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│ DecisionRouter   │        │ MemoryRetriever │        │ Experience      │        │ CampaignEngine  │
│ decision-types   │        │ MemoryStore     │        │   Compiler      │        │ DeviceCoordinator
│ PromptBuilder    │        │ 0002_migration  │        │ 集成测试         │        │ 代码审查         │
│ SafetyGuard      │        │                 │        │                 │        │ 旧代码清理       │
└─────────────────┘        └─────────────────┘        └─────────────────┘        └─────────────────┘

后端2:                      后端2:                       后端2:                       后端2:
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│ DeepSeekClient  │        │ decision-routes │        │ StreamManager   │        │ E2E测试          │
│ QwenVLClient    │        │ state-ingestor  │        │ stream API      │        │ 性能调优         │
│ config.ts更新    │        │ state-store     │        │ ws-hub集成       │        │ 旧代码清理       │
│ 单元测试         │        │ edge_state.proto│        │ 单元测试         │        │                 │
└─────────────────┘        └─────────────────┘        └─────────────────┘        └─────────────────┘

Android 1:                 Android 1:                 Android 1:                 Android 1:
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│ ScreenAnalyzer  │        │ StateCompiler   │        │ EdgePipeline    │        │ 集成调试         │
│ UiDetector      │        │ StateProtobuf   │        │   集成           │        │ 真机测试         │
│ YOLO模型准备     │        │ Protobuf生成     │        │ WS 对接          │        │ 性能优化         │
│ OpenCV集成       │        │ 单元测试         │        │ 单元测试         │        │ 旧VLM代码清理    │
└─────────────────┘        └─────────────────┘        └─────────────────┘        └─────────────────┘

Android 2:                 Android 2:                 Android 2:                 Android 2:
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│ TextExtractor   │        │ LocalReactor    │        │ StreamController│        │ 集成调试         │
│ (ML Kit OCR)    │        │ (6内置规则)      │        │ WS Dispatcher   │        │ 真机兼容测试     │
│ TFLite集成       │        │ 单元测试         │        │   改造           │        │ APK构建验证      │
│ 模型文件导入     │        │                 │        │ 单元测试         │        │ 旧VLM代码清理    │
└─────────────────┘        └─────────────────┘        └─────────────────┘        └─────────────────┘

前端:                       前端:                       前端:                       前端:
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│ DeviceDetail    │        │ 决策状态面板     │        │ 流控制 UI       │        │ 整体UI打磨       │
│   改造           │        │ 路由统计展示     │        │ 自动关闭提示     │        │ 响应式适配       │
│ 新API对接       │        │ 记忆统计页面     │        │ 视频播放器适配   │        │ E2E 验收         │
│ 状态类型定义     │        │                │        │                 │        │                 │
└─────────────────┘        └─────────────────┘        └─────────────────┘        └─────────────────┘

QA:                        QA:                        QA:                        QA:
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│ 接口契约验证     │        │ 集成测试用例     │        │ 性能基准测试     │        │ 真机E2E测试      │
│ 测试环境搭建     │        │ Mock服务搭建     │        │ 压力测试         │        │ 回归测试         │
│                 │        │                 │        │                 │        │ 验收报告         │
└─────────────────┘        └─────────────────┘        └─────────────────┘        └─────────────────┘
```

---

## B4. 任务分解 (WBS)

### Sprint 1 — 核心基础设施 (Week 1-2)

| ID | 任务 | 负责人 | 工时 | 依赖 | 优先级 |
|----|------|--------|------|------|--------|
| **S1-BE-01** | 定义所有接口契约 (types.ts, proto, WS消息, REST API) | 架构师 | 6h | - | P0 |
| **S1-BE-02** | 实现 DeepSeekClient (API调用 + 重试 + 解析) | 后端2 | 8h | S1-BE-01 | P0 |
| **S1-BE-03** | 实现 QwenVLClient (百炼API + 图片Base64 + 解析) | 后端2 | 8h | S1-BE-01 | P0 |
| **S1-BE-04** | 实现 PromptBuilder (双模式提示词) | 架构师 | 6h | S1-BE-01 | P0 |
| **S1-BE-05** | 实现 SafetyGuard (5项校验) | 架构师 | 4h | S1-BE-01 | P0 |
| **S1-BE-06** | 实现 DecisionRouter (6种路由条件 + 会话管理) | 架构师 | 10h | S1-BE-02..05 | P0 |
| **S1-BE-07** | config.ts 新增双模型配置 + Feature Flags | 后端2 | 2h | - | P0 |
| **S1-BE-08** | DeepSeekClient + QwenVLClient 单元测试 | 后端2 | 6h | S1-BE-02,03 | P1 |
| **S1-BE-09** | DecisionRouter 路由逻辑单元测试 (10用例) | 架构师 | 6h | S1-BE-06 | P1 |
||||||
| **S1-AN-01** | 集成 OpenCV Android SDK + 验证 | Android1 | 4h | - | P0 |
| **S1-AN-02** | 实现 ScreenAnalyzer (帧间差分 + 感知哈希 + 弹窗模板) | Android1 | 12h | S1-AN-01 | P0 |
| **S1-AN-03** | 准备 YOLO-nano TFLite 模型 + 标签文件 | Android1 | 6h | - | P0 |
| **S1-AN-04** | 实现 UiDetector (TFLite加载 + 推理 + NMS) | Android1 | 12h | S1-AN-03 | P0 |
| **S1-AN-05** | 激活 ML Kit OCR + 实现 TextExtractor | Android2 | 6h | - | P0 |
| **S1-AN-06** | ScreenAnalyzer + UiDetector 单元测试 | Android1 | 6h | S1-AN-02,04 | P1 |
||||||
| **S1-FE-01** | DeviceDetail 页面改造 (新增结构化状态面板) | 前端 | 8h | S1-BE-01 | P0 |
| **S1-FE-02** | 新增决策控制 hooks (useDecisionAPI) | 前端 | 4h | S1-BE-01 | P0 |
| **S1-FE-03** | 新 API 类型定义 + 对接 | 前端 | 4h | S1-BE-01 | P0 |

**Sprint 1 交付物**: DecisionRouter 可独立运行 (模拟EdgeState输入 → 正确路由 → 正确决策输出), ScreenAnalyzer+UiDetector+TextExtractor 单元测试通过

---

### Sprint 2 — 状态管线 + API集成 (Week 3-4)

| ID | 任务 | 负责人 | 工时 | 依赖 | 优先级 |
|----|------|--------|------|------|--------|
| **S2-BE-01** | 实现 decision-routes.ts (REST API + WS消息处理) | 后端2 | 8h | S1-BE-06 | P0 |
| **S2-BE-02** | 实现 state-ingestor.ts (Protobuf解析 + 校验) | 后端2 | 6h | S1-BE-01 | P0 |
| **S2-BE-03** | 实现 state-store.ts (Redis设备状态缓存) | 后端2 | 4h | S2-BE-02 | P1 |
| **S2-BE-04** | edge_state.proto 服务端副本 + 代码生成 | 后端2 | 2h | S1-BE-01 | P0 |
| **S2-BE-05** | 实现 MemoryStore (pgvector upsert + embed) | 架构师 | 8h | - | P0 |
| **S2-BE-06** | 实现 MemoryRetriever (三级检索) | 架构师 | 8h | S2-BE-05 | P0 |
| **S2-BE-07** | 0002_edge_memory.sql 迁移脚本 | 架构师 | 3h | S2-BE-05 | P0 |
| **S2-BE-08** | MemoryRetriever 单元测试 | 架构师 | 4h | S2-BE-06 | P1 |
||||||
| **S2-AN-01** | 实现 StateCompiler (CV+OCR+YOLO+A11y合并) | Android1 | 12h | S1-AN-02,04,05 | P0 |
| **S2-AN-02** | 实现 StateProtobuf (序列化/反序列化) | Android1 | 6h | S2-AN-01 | P0 |
| **S2-AN-03** | edge_state.proto + protobuf gradle 插件 | Android1 | 3h | S1-BE-01 | P0 |
| **S2-AN-04** | 实现 LocalReactor (6内置规则) | Android2 | 8h | S1-AN-02 | P0 |
| **S2-AN-05** | TextExtractor + LocalReactor 单元测试 | Android2 | 6h | S1-AN-05, S2-AN-04 | P1 |
| **S2-AN-06** | StateCompiler + StateProtobuf 单元测试 | Android1 | 4h | S2-AN-01,02 | P1 |
||||||
| **S2-FE-01** | 决策状态面板 (deviceDetail内嵌) | 前端 | 6h | S1-FE-01 | P0 |
| **S2-FE-02** | 双模型路由统计展示 | 前端 | 4h | S1-FE-02 | P1 |
| **S2-FE-03** | 记忆系统统计页面 | 前端 | 4h | - | P1 |

**Sprint 2 交付物**: DecisionRouter + StateIngestor 端到端可工作 (模拟Protobuf → 决策), StateCompiler + Protobuf 序列化完整链路通过

---

### Sprint 3 — 流管理 + 管线集成 (Week 5-6)

| ID | 任务 | 负责人 | 工时 | 依赖 | 优先级 |
|----|------|--------|------|------|--------|
| **S3-BE-01** | 实现 StreamManager (流生命周期 + 自动关闭) | 后端2 | 12h | - | P0 |
| **S3-BE-02** | stream API 路由注册 | 后端2 | 4h | S3-BE-01 | P0 |
| **S3-BE-03** | ws-hub.ts 集成 DecisionRouter + StreamManager | 后端2 | 6h | S2-BE-01, S3-BE-01 | P0 |
| **S3-BE-04** | 实现 ExperienceCompiler (定时编译) | 架构师 | 8h | S2-BE-06 | P1 |
| **S3-BE-05** | StateIngestor + DecisionRouter 集成测试 | 架构师 | 6h | S3-BE-03 | P1 |
||||||
| **S3-AN-01** | 实现 EdgePipeline (管线编排 + 三阶段执行) | Android1 | 12h | S2-AN-01,02,04 | P0 |
| **S3-AN-02** | 改造 WebSocketMessageDispatcher (截图上报→EdgeState上报) | Android2 | 8h | S3-AN-01 | P0 |
| **S3-AN-03** | 实现 StreamController (按需启停ScreenEncoder) | Android2 | 6h | S3-BE-01 | P0 |
| **S3-AN-04** | BridgeForegroundService 集成 EdgePipeline + StreamController | Android2 | 4h | S3-AN-02,03 | P0 |
| **S3-AN-05** | EdgePipeline 单元测试 | Android1 | 6h | S3-AN-01 | P1 |
||||||
| **S3-FE-01** | 实现视频流控制 UI (开始/停止按钮 + 自动关闭提示) | 前端 | 8h | S3-BE-02 | P0 |
| **S3-FE-02** | ScrcpyPlayer 适配新 API 路径 | 前端 | 4h | S3-FE-01 | P0 |
| **S3-FE-03** | 流状态实时展示 (码率/时长/订阅者数) | 前端 | 4h | S3-FE-01 | P1 |

**Sprint 3 交付物**: 全链路打通 — APK EdgePipeline → Protobuf → WebSocket → StateIngestor → DecisionRouter → DeepSeek/Qwen3-VL → 决策 → 设备执行

---

### Sprint 4 — 编排 + 清理 + 验收 (Week 7-8)

| ID | 任务 | 负责人 | 工时 | 依赖 | 优先级 |
|----|------|--------|------|------|--------|
| **S4-BE-01** | 实现 CampaignEngine (批量设备营销编排) | 架构师 | 10h | S3-BE-05 | P1 |
| **S4-BE-02** | 实现 DeviceCoordinator (多设备协同调度) | 架构师 | 8h | S4-BE-01 | P1 |
| **S4-BE-03** | 移除 vlm-orchestrator.ts + vlm-client.ts | 后端2 | 2h | S3-BE-05 | P0 |
| **S4-BE-04** | 移除旧 VLM 路由 + 重定向到 decision API | 后端2 | 2h | S4-BE-03 | P0 |
| **S4-BE-05** | E2E 测试 + 性能调优 | 后端2 | 8h | S4-BE-01..04 | P1 |
||||||
| **S4-AN-01** | 移除 LocalVlmClient + InferenceRouter + MemoryManager | Android1 | 3h | S3-AN-05 | P0 |
| **S4-AN-02** | 移除 llama.cpp JNI CMake 配置 | Android1 | 2h | S4-AN-01 | P0 |
| **S4-AN-03** | 真机集成调试 (小米/华为/OPPO 3台) | Android1+2 | 16h | S3-AN-04 | P0 |
| **S4-AN-04** | APK 构建验证 + 体积检查 | Android2 | 4h | S4-AN-03 | P0 |
| **S4-AN-05** | 性能基准测试 (pipeline p95 < 150ms) | Android1 | 4h | S4-AN-03 | P1 |
||||||
| **S4-FE-01** | 整体 UI 打磨 + 响应式适配 | 前端 | 8h | S3-FE-01..03 | P1 |
| **S4-FE-02** | E2E 验收 (Dashboard → API → 决策 → 设备执行) | 前端 | 6h | 全部 | P1 |
||||||
| **S4-QA-01** | 全链路 E2E 测试 (4平台 × 5场景) | QA | 12h | S4-BE-05, S4-AN-03 | P0 |
| **S4-QA-02** | 回归测试 (已有功能不受影响) | QA | 8h | - | P0 |
| **S4-QA-03** | 性能基准验收报告 | QA | 4h | S4-AN-05 | P1 |

**Sprint 4 交付物**: 全部模块集成完毕, 旧代码清理, E2E 通过, 性能达标, **可合并到 master**

---

## B5. 里程碑 & 验收标准

| 里程碑 | 时间点 | 验收标准 |
|--------|--------|---------|
| **M0: 规范冻结** | Week 0 | 本文档评审通过, 接口契约全员确认 |
| **M1: 核心决策链路** | Week 2 末 | DecisionRouter 6种路由条件测试通过, 三模型可独立调用 |
| **M2: 边缘CV管线** | Week 4 末 | ScreenAnalyzer/UiDetector/TextExtractor/StateCompiler 单元测试 >80% |
| **M3: 全链路打通** | Week 6 末 | APK EdgePipeline → Protobuf → WebSocket → StateIngestor → DecisionRouter → Decision → 设备执行 端到端可工作 |
| **M4: 流管理就绪** | Week 6 末 | 视频流按需启停 + 自动关闭 + Dashboard UI 可操作 |
| **M5: 代码清理** | Week 7 末 | 旧 vlm-orchestrator/VlmAgent/LocalVlmClient 代码移除, 编译通过 |
| **M6: 生产就绪** | Week 8 末 | E2E 通过, 性能达标, 回归测试通过, 可合并到 master |

### M3 验收用例 (端到端全链路)

```
1. APK 截图 → EdgePipeline.process() → Protobuf 序列化 < 5KB
2. WebSocket 二进制帧 0x10 → 服务端 StateIngestor 接收 → 解析成功
3. 正常页面 (pageType=FEED, 无异常) → DecisionRouter → DeepSeek (文本)
4. 异常页面 (anomalyFlags=[popup]) → DecisionRouter → Qwen3-VL (视觉)
5. DeepSeek 返回决策 → WebSocket execute_decision → APK 执行
6. APK 回报 step_result { outcome: "success" } → 服务端记录
7. 循环 10 步完成任务 → DecisionRouter 返回 finished=true
```

---

## B6. 风险管理

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| DeepSeek API 不稳定/限流 | 中 | 高 | 3次重试 + 指数退避, 备用模型切换 (DeepSeek→Qwen3-VL文本模式) |
| Qwen3-VL API 延迟 >3s | 中 | 中 | 超时 15s, 回退到 DeepSeek 文本模式 |
| YOLO-nano 模型精度不足 | 中 | 中 | 保留 A11yService UI 树作为主要可交互元素来源, YOLO 作为辅助 |
| OpenCV 集成导致 APK 体积 >10MB 增量 | 低 | 低 | 仅引入所需模块 (imgproc + features2d), 其他 strip |
| pgvector 兼容性问题 | 低 | 高 | 回退方案: 用 Redis 的 HNSW 索引替代 |
| 旧代码删除引入回归 bug | 中 | 高 | Feature Flag 控制新旧切换, Phase E 之前不删除, 充分回归测试 |
| 团队并行开发导致接口不一致 | 中 | 高 | 架构师在 Sprint 1 第1天冻结所有接口契约, 各团队 mock 接口先行开发 |
| 真机兼容性问题 (不同品牌) | 中 | 中 | Sprint 4 安排 3 品牌真机测试, 保留品牌兼容层 |

---

> **下一步**: 各团队负责人确认各 Sprint 任务, 架构师冻结接口契约文件, 开始 Sprint 1。
