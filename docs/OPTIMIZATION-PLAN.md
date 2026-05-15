# PhoneFarm 全栈优化开发计划

> 共计 117 个问题，分 4 个 Phase 修复 | 2026-05-14

---

## 问题分级定义

| 级别 | 定义 | 数量 |
|------|------|------|
| 🔴 CRITICAL | 内存泄漏、安全漏洞、数据丢失风险 | 8 |
| 🟠 HIGH | 性能瓶颈、功能缺陷、架构不一致 | 35 |
| 🟡 MEDIUM | 代码质量、缓存缺失、错误处理不足 | 42 |
| 🟢 LOW | 代码风格、微优化、废弃 API | 32 |

---

## Phase 1: CRITICAL 修复 (8 个问题, 预估 2 天)

### 后端 CRITICAL (3)

| # | 文件 | 行 | 问题 | 修复方案 |
|---|------|----|------|---------|
| B-C1 | `auth/auth-middleware.ts` | 40-49 | JWT 签名验证缺失，任何三段 base64url 字符串都能通过认证 | 替换为 `@fastify/jwt` 插件验证，或手动验证 HMAC 签名 |
| B-C2 | `ws-hub.ts` | 68-74 | 设备断开时不清理 #taskTimeouts，timer 泄漏 | 在 `ws.on('close')` 中遍历清理该设备关联的 timeout |
| B-C3 | `index.ts` | 453-459 | 优雅关闭缺失: 无 pool.end()、NATS drain、WsHub dispose | 补全关闭流程，添加 10s 超时保护 |

### Android CRITICAL (3)

| # | 文件 | 行 | 问题 | 修复方案 |
|---|------|----|------|---------|
| A-C1 | `P2pConnectionManager.kt` | 104, 108 | 两个 EglBase.create() 匿名实例泄漏，永不释放 | 创建单个 eglBase 字段，共享给 encoder/decoder，在 shutdown() 中 release() |
| A-C2 | `WebrtcManager.kt` | 94 | `android.app.Application()` 裸构造导致 WebRTC 无真实 Context | 注入 `@ApplicationContext`，传入 `builder(appContext)` |
| A-C3 | `WebrtcManager.kt` | 442 | ICE candidate deviceId 硬编码 `"self"`，多设备路由错误 | 从构造函数或 SignalingSender 获取真实 deviceId |

### 数据库 CRITICAL (2)

| # | 文件 | 行 | 问题 | 修复方案 |
|---|------|----|------|---------|
| D-C1 | `drizzle.config.ts` | 4 | 遗漏 billing-schema.ts (5表) 和 config-schema.ts (5表) | 添加两个 schema 文件到 drizzle.config.ts schema 数组 |
| D-C2 | `auth/api-key-routes.ts` | 27-28 | API Key 纯内存存储，服务器重启全部失效 | 改为从 api_keys 表读取，内存做缓存层，CRUD 操作写入 DB |

---

## Phase 2: HIGH 修复 (35 个问题, 预估 5 天)

### 后端 HIGH (11)

| # | 文件 | 行 | 问题 | 修复方案 |
|---|------|----|------|---------|
| B-H1 | `db.ts` | 5-7 | pg Pool 零配置 (无 max/idleTimeout/connectionTimeout) | 配置 max:20, idleTimeoutMillis:30000, connectionTimeoutMillis:10000 |
| B-H2 | `db.ts` | - | 缺少 pool.on('error') 处理器 | 注册错误处理器，防止 idle client 错误导致进程崩溃 |
| B-H3 | `decision-router.ts` | 112, 210 | session.history 包含 base64 截图，无限增长 | 添加 maxHistoryEntries 上限，超出移除最旧条目 |
| B-H4 | `decision-router.ts` | 78 | zombie session 永不清理 (设备断开不调用 stopSession) | 添加 session TTL (如 30 分钟)，定期扫描清理过期 session |
| B-H5 | `config-resolver.ts` | 45-46, 52-55 | resolve() 每次全表扫描 4 张表 | 添加内存缓存 (TTL 30s)，resolveKey 直接从缓存查找 |
| B-H6 | `index.ts` | 79, 84, 242-244 | 使用 `as any` 附加单例到 Fastify 实例 | 改为 `app.decorate()` 或创建 DI 容器 |
| B-H7 | `ws-hub.ts` | 180, 344, 353 | 热路径中使用 require() 动态加载 | 改为顶层 import (条件使用通过功能开关控制) |
| B-H8 | `index.ts` | 334 | `req.body as any` 绕过类型检查 | 定义准确的 Zod schema，使用 Fastify schema 验证 |
| B-H9 | `cron-store.ts` | 19 | cron jobs 纯内存 Map，重启丢失所有定时任务 | 启动时从 cron_jobs 表加载，CRUD 同步写入 DB |
| B-H10 | `alert-engine.ts` | 45-47 | 告警规则纯内存，无法运行时更新 | 启动时从 alert_rules 表加载，提供 reload API |
| B-H11 | `drizzle.config.ts` | - | schema.ts 中 19 张表没有任何 Drizzle 索引定义 | 为所有外键列和时间戳列添加 index() |

### 前端 HIGH (9)

| # | 文件 | 行 | 问题 | 修复方案 |
|---|------|----|------|---------|
| F-H1 | `App.tsx` | 7-37 | 35+ 页面组件全量 eager import | React.lazy() + Suspense 路由级代码分割 |
| F-H2 | `store/index.ts` | 234-604 | 604 行单体 Zustand store (13 个领域) | 拆分为独立 slice: auth/devices/tasks/vlm/system/infra |
| F-H3 | `lib/api.ts` | 20-58 | request() 返回 Promise\<any\> | 改为泛型 `request<T>()`，所有 API 方法显式返回类型 |
| F-H4 | `lib/api.ts` | 47-50 | 401 使用 window.location.href 硬重定向 | 使用 React Router navigate() 或全局 auth state |
| F-H5 | `lib/api.ts` | 52-56 | HTTP 错误粗糙映射 (仅 SERVER/UNKNOWN) | 添加 403/404/409/422 细分错误码处理 |
| F-H6 | `hooks/useKeyboardShortcuts.ts` | 44 | [handlers] 依赖每帧变化导致重复注册 | 改为 useRef 存储 handlers，effect 只运行一次 |
| F-H7 | `components/ScrcpyPlayer.tsx` | 248 | URL.createObjectURL 永不 revoke | 在 cleanup 中添加 URL.revokeObjectURL() |
| F-H8 | `components/ScrcpyPlayer.tsx` | 116 | JWT token 通过 WebSocket URL 查询参数传递 | 改为连接后发送 auth 消息 |
| F-H9 | `App.tsx` | 281-282 | localStorage.getItem('token') 双重读取 | 合并为单次读取 |

### Android HIGH (7)

| # | 文件 | 行 | 问题 | 修复方案 |
|---|------|----|------|---------|
| A-H1 | `ScriptEngine.kt` | 154 | stop() 不能中断运行中的 Rhino 脚本 | 设置 Context 中断标志 + Context.exit() |
| A-H2 | `ReconnectManager.kt` | 50 | CoroutineScope 无 destroy() 取消方法 | 添加 destroy() 调用 scope.cancel() |
| A-H3 | `GuardService.kt` | 502 | WakeLock 10 秒超时后设备可休眠 | 使用无超时 acquire() 或循环重新获取 |
| A-H4 | `ScriptEngine.kt` | 95 | 并发 execute() 覆盖 executionJob，首个 job 泄漏 | 添加执行锁，已有任务运行时拒绝新执行 |
| A-H5 | `proguard-rules.pro` | 285 | -repackageclasses 破坏 Manifest 组件引用 | 移除该规则或验证所有组件类名正确 |
| A-H6 | `AnrWatchdog.kt` | 179 | 原始 Thread 调用 suspend DAO 方法 | 改为使用 CoroutineScope 调用 |
| A-H7 | `CrashReporter.kt` | 218 | logcat 在 Android 8+ 返回空输出 | 实现应用内日志环形缓冲区 |

### 数据库 HIGH (8)

| # | 文件 | 行 | 问题 | 修复方案 |
|---|------|----|------|---------|
| D-H1 | `schema.ts` | 25, 163 | accounts 和 platform_accounts 功能重复 | 合并为统一的 platform_accounts 表，迁移 accounts 数据 |
| D-H2 | `migrations/` | - | billing 表 (5张) 无 Drizzle 迁移 | 为 billing-schema.ts 生成迁移 |
| D-H3 | `billing-schema.ts` | - | 5 张 billing 表无任何索引 | 添加 FK 索引和时间戳索引 |
| D-H4 | `schema.ts` | - | executions/vlm_episodes/vlm_steps 无时间戳索引 | 添加 created_at/started_at/finished_at 索引 |
| D-H5 | `config-schema.ts` | - | config 表在 Drizzle 模式中无索引声明 | 添加与迁移一致的 index() 声明 |
| D-H6 | `config-resolver.ts` | 52-55 | 全量加载 deviceGroups 后 JS 端过滤 | 添加 WHERE 子句，按 deviceId 精确查询 |
| D-H7 | `billing-schema.ts` | 56 | usage_records.device_id 无 FK 约束 | 添加 .references(() => devices.id) |
| D-H8 | `migrations/` | - | 0002 编号重复 (edge_memory / persistent_stores) | 重命名为 0002 和 0003 |

---

## Phase 3: MEDIUM 修复 (42 个问题, 预估 4 天)

### 后端 MEDIUM (12)

| # | 文件 | 问题 | 修复方案 |
|---|------|------|---------|
| B-M1 | `ws-hub.ts` | WsHub 无 dispose() 方法 | 添加 dispose(): 清理 taskTimeouts, 关闭所有 WS, 清空 subscriptions |
| B-M2 | `index.ts` | 关闭无超时保护 | 添加 10s 超时 + process.exit(1) fallback |
| B-M3 | `index.ts` | 无 MinIO disconnect 调用 | 关闭时调用 minio 清理 |
| B-M4 | `decision-router.ts` | DecisionSession screenshotBase64 常驻内存 | session 结束后删除截图引用，仅保留文本 |
| B-M5 | `auth-middleware.ts` | 双 JWT 系统 (@fastify/jwt 注册但未使用) | 统一使用 @fastify/jwt |
| B-M6 | `auth-middleware.ts` | `req.user` 需要 `as any` 类型断言 | 扩展 FastifyRequest 类型 |
| B-M7 | `vlm-routes.ts` | activeTasks/completedTasks 内存 Map 重启丢失 | 启动时从 vlm_episodes 恢复 |
| B-M8 | `model-routes.ts` | models Map 无持久化 | 若无对应 DB 表则新建，否则改为 DB 存储 |
| B-M9 | `scripts-manifest-routes.ts` | uploadedScripts Map 重启丢失 | 存储到 DB 或 MinIO |
| B-M10 | `webhook-engine.ts` | webhook configs Map 重启丢失 | 启动时从 webhook_configs 加载 |
| B-M11 | `config-resolver.ts` | resolveKey 调用 resolve() 全扫描只为单个 key | 直接查询 config_values WHERE key = ? |
| B-M12 | `edge/state-store.ts` | 内存 fallback 重启丢失所有边缘设备状态 | 添加 Redis 重连机制，减少 fallback 窗口 |

### 前端 MEDIUM (18)

| # | 文件 | 问题 | 修复方案 |
|---|------|------|---------|
| F-M1 | `lib/api.ts` | 无请求缓存 | GET 请求添加 Map 缓存 + 5min TTL |
| F-M2 | `lib/api.ts` | 无请求去重 | 相同请求并发时共享同一个 Promise |
| F-M3 | `lib/api.ts` | 156-163 | scrcpyDownloadRecording 绕过统一 request() | 重构使用内部 request 方法 |
| F-M4 | `ScrcpyPlayer.tsx` | 260-265 | MediaSource 事件监听器未移除 | 在 cleanup 中移除所有监听器 |
| F-M5 | `ScrcpyPlayer.tsx` | 88, 183, 299, 305, 332 | 5 个空 catch 块吞掉错误 | 添加 console.warn 记录 |
| F-M6 | `ScrcpyPlayer.tsx` | 14 | @ts-ignore 禁用 mux.js 类型检查 | 创建 mux.js 类型声明文件 |
| F-M7 | `App.tsx` | 286 | useEffect 缺少 logout 依赖 | 使用 useCallback 包装或添加 eslint-disable 注释 |
| F-M8 | `useKeyboardShortcuts.ts` | 44 | 依赖数组使用内联对象引用 | 使用 useRef 存储 handlers |
| F-M9 | `store/index.ts` | 所有 API 调用无 loading/error 状态 | 为每个数据领域添加 loading/error 字段 |
| F-M10 | `store/index.ts` | 错误处理重复代码 | 提取 createAsyncThunk 包装器 |
| F-M11 | `DeviceList.tsx` | 列表虚拟化 (100+ 设备时卡顿) | 使用 @tanstack/react-virtual |
| F-M12 | `TaskList.tsx` | 分页在客户端内存进行 | 服务端分页 + 游标 |
| F-M13 | `InfrastructureMonitorPage.tsx` | 轮询间隔固定 5s | 根据页面可见性自动调整 (可见 5s, 隐藏 30s) |
| F-M14 | `GroupControlPanel.tsx` | 群控 WebSocket 消息无批处理 | 添加 debounce 批量发送 |
| F-M15 | `VlmTaskPage.tsx` | VLM 大响应 JSON 解析阻塞主线程 | 使用 Web Worker 或分批处理 |
| F-M16 | `login.tsx` | 错误信息直接显示 API 返回原始错误 | 用户友好的错误文案映射 |
| F-M17 | `api.ts` | 无 AbortController 管理 | 页面卸载时取消进行中的请求 |
| F-M18 | `App.tsx` | 无全局 ErrorBoundary | 添加 Root Error Boundary 组件 |

### Android MEDIUM (6)

| # | 文件 | 问题 | 修复方案 |
|---|------|------|---------|
| A-M1 | `WebrtcManager.kt` | 87-116 | init{} 中 eager 初始化 PeerConnectionFactory | 改为 lazy 或显式 initialize() |
| A-M2 | `P2pConnectionManager.kt` | 517 | ensureFactoryInitialized 无防重入保护 | 添加初始化锁 |
| A-M3 | `WebrtcManager.kt` | - | 与 P2pConnectionManager EglBase 管理模式不一致 | 统一为单例 EglBase 共享模式 |
| A-M4 | `AnrWatchdog.kt` | 43 | 未使用的 Handler 字段 | 移除 |
| A-M5 | `AnrWatchdog.kt` | 69 | setMessageLogging(Printer) 已弃用 | 条件使用新 API (API 30+) |
| A-M6 | `CrashReporter.kt` | 77 | runBlocking 可能阻塞进程死亡 | 使用 GlobalScope.launch 异步写入 |

### 数据库 MEDIUM (6)

| # | 文件 | 问题 | 修复方案 |
|---|------|------|---------|
| D-M1 | `schema.ts` | accounts/platform_accounts 未合并 | Phase 2 合并后清理旧表 |
| D-M2 | `config-schema.ts` | 迁移有索引但 Drizzle 无 | 同步 Drizzle 模式定义 |
| D-M3 | `billing-schema.ts` | 缺少 subscriptions.current_period_end 索引 | 添加 (用于过期检查) |
| D-M4 | `billing-schema.ts` | 缺少 usage_records (user_id, metric, recorded_at) 组合索引 | 添加 (用于计费聚合查询) |
| D-M5 | `billing-schema.ts` | 缺少 invoices (user_id, status) 索引 | 添加 |
| D-M6 | `schema.ts` | schema.ts 未定义 device_memories/experience_rules | 添加 Drizzle 定义 |

---

## Phase 4: LOW 修复 (32 个问题, 预估 2 天)

### 后端 LOW (7)

| # | 文件 | 问题 |
|---|------|------|
| B-L1 | `index.ts` | Fastify 插件注册分散，建议统一到 plugins/ 目录 |
| B-L2 | `ws-hub.ts` | #devices Map 可用 WeakMap (但 deviceId 是 string 不适用) |
| B-L3 | `decision-router.ts` | DecisionInput 类型应分离为 TextInput 和 VisionInput |
| B-L4 | `auth-middleware.ts` | signRefreshToken 结构手动维护，建议使用 jsonwebtoken |
| B-L5 | `config-definitions.ts` | 配置定义数组可用 Map 优化查询 |
| B-L6 | `task-queue.ts` | BullMQ Worker 配置项分散，建议集中到 config.ts |
| B-L7 | `index.ts` | 路由注册分布在 index.ts 中过长 (400+ 行)，建议拆分 |

### 前端 LOW (15)

| # | 文件 | 问题 |
|---|------|------|
| F-L1 | `App.tsx` | 6 | import 重复 (react-router-dom 两次) |
| F-L2 | `api.ts` | ApiError 类未使用继承 Error (丢失 stack trace) |
| F-L3 | `DeviceDetail.tsx` | useEffect 依赖数组不完整 |
| F-L4 | `TaskCreate.tsx` | 表单无验证状态 |
| F-L5 | `AccountList.tsx` | 密码明文显示无掩码开关 |
| F-L6 | `ScriptManager.tsx` | 代码编辑器无语法高亮 |
| F-L7 | `ModelConfigPage.tsx` | 模型配置保存后无成功反馈 |
| F-L8 | `SystemControlPanel.tsx` | PM2 命令无确认对话框 |
| F-L9 | `AdminPanel.tsx` | 管理面板导航重复代码 |
| F-L10 | `CardKeyManagement.tsx` | 卡密生成无批量模式 |
| F-L11 | `AuditLogViewer.tsx` | 日志列表无虚拟滚动 |
| F-L12 | `ServerHealthDashboard.tsx` | 健康数据无自动刷新开关 |
| F-L13 | `FeatureFlagsPage.tsx` | 功能开关切换无副作用说明 |
| F-L14 | `ConfigGlobalEditor.tsx` | 敏感字段显示明文 |
| F-L15 | `ConfigAuditLog.tsx` | 变更对比无差异高亮 |

### Android LOW (4)

| # | 文件 | 问题 |
|---|------|------|
| A-L1 | `VlmAgent.kt` | 51 | 未使用的 CoroutineScope 字段 |
| A-L2 | `VlmAgent.kt` | 203/228/317 | 截图环形缓冲代码重复 3 次 |
| A-L3 | `GuardService.kt` | 369 | ping/pong 轮询用 delay(250) 循环 20 次 |
| A-L4 | `CrashReporter.kt` | - | 设备信息收集代码可提取为 DeviceInfoCollector 工具类 |

### 数据库 LOW (6)

| # | 文件 | 问题 |
|---|------|------|
| D-L1 | `migrations/0000_initial.sql` | 枚举创建使用冗长的 DO $$ BEGIN 模式 |
| D-L2 | `migrations/0001_vlm.sql` | vlm_steps.screenshot_path 可为空但无默认值 |
| D-L3 | `schema.ts` | 部分表使用 text() 代替 varchar() 无长度限制 |
| D-L4 | `billing-schema.ts` | currency 字段为 text 而非专用货币类型 |
| D-L5 | `config-schema.ts` | config_values 无 (definition_id, scope, scope_id) 唯一约束 |
| D-L6 | `migrations/` | 缺少迁移回滚脚本 |

---

## 时间线总览

```
Phase 1 (CRITICAL 8个)   ████░░░░░░░░░░░░░░░░░░  2 天
Phase 2 (HIGH 35个)      ██████████░░░░░░░░░░░░  5 天
Phase 3 (MEDIUM 42个)    ████████░░░░░░░░░░░░░░  4 天
Phase 4 (LOW 32个)       ████░░░░░░░░░░░░░░░░░░  2 天
                          ──────────────────────
                          总计: 13 个工作日
```

### 各层修复统计

| 层 | CRITICAL | HIGH | MEDIUM | LOW | 总计 |
|----|----------|------|--------|-----|------|
| 后端 | 3 | 11 | 12 | 7 | 33 |
| 前端 | 0 | 9 | 18 | 15 | 42 |
| Android | 3 | 7 | 6 | 4 | 20 |
| 数据库 | 2 | 8 | 6 | 6 | 22 |
| **总计** | **8** | **35** | **42** | **32** | **117** |
