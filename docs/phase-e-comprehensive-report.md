# PhoneFarm 全栈综合评估报告 — Phase E

> 生成日期: 2026-05-15 | 涵盖: Android UI 交互逻辑 / 全栈技术功能 / 功能完整性

---

## 一、Android APP UI 交互逻辑

### 1.1 屏幕导航全景图 (29 屏)

```
Splash → Activation → PermissionGuide → Login/Register
                                                    ↓
                                              MainActivity (3-Tab)
                                              ┌────────┼────────┐
                                            Home    Tasks   Settings
                                              │        │        │
                                     ┌────────┤   TaskHub    AccountCenter
                                   VlmAgent  │   TaskLog    UpgradePlan
                                   ScriptMgr │             UsageStats
                                   ScriptEditor│           SupportCenter
                                   EpisodeReplay│          AgentDashboard
                                   ModelManager │         PluginSetup
                                   AccountManager│       Diagnostics
                                   Notifications │      Notifications
                                   LocalCronScheduler│  DataUsage
                                   FloatingWindow  │  Privacy/Help
                                                   │
                                              AssistantActivity (AI对话)
```

### 1.2 核心 UI 组件

| 组件 | 文件 | 功能 |
|------|------|------|
| MainActivity | `MainActivity.kt` | 3-Tab 主页 (Home/Tasks/Settings)，Jetpack Compose + Material 3 |
| PhoneFarmAccessibilityService | `PhoneFarmAccessibilityService.kt` | 无障碍服务 — 截图/手势/滚动/点击注入 |
| BridgeForegroundService | `BridgeForegroundService.kt` | 前台服务 — WebSocket 保活 + onTrimMemory |
| FloatWindowService | `floating/FloatWindowService.kt` | 悬浮窗 — 系统级 overlay 聊天界面 |
| PhoneFarmInputMethodService | `service/PhoneFarmInputMethodService.kt` | 自定义输入法 — 稳定文本输入 |
| PhoneFarmDeviceAdminReceiver | `service/PhoneFarmDeviceAdminReceiver.kt` | 设备管理员 — 锁屏/策略管理 |
| AssistantActivity | `assistant/AssistantActivity.kt` | 全屏 AI 助手聊天 |

### 1.3 VLM 适配器体系 (5 个)

| 适配器 | 实现 `VlmAdapter` |
|--------|-------------------|
| AutoGLMAdapter | ✅ |
| QwenVLAdapter | ✅ |
| MaiuiAdapter | ✅ |
| GuiOwlAdapter | ✅ |
| CustomAdapter | ✅ |

### 1.4 边缘计算分析器 (2 个)

- `ScreenAnalyzer.kt` — 白屏检测 + 相似度
- `ScreenAnalyzerV2.kt` — 升级版

### 1.5 28 个 ViewModel

全部 28 个 ViewModel → Compose Screen 映射完整，每个屏幕都有真实实现。无孤立路由。

### 1.6 Android UI 缺口

| 问题 | 文件 | 严重度 |
|------|------|--------|
| PermissionRationale 4 个 TODO | `PermissionRationale.kt:34,67,96,125` | 中 — Toast 代替 AlertDialog |
| NotificationHelper 占位图标 | `NotificationHelper.kt:79,93,107` | 低 — 使用系统默认图标 |
| JsEngines 占位符 | `JsEngines.kt:131` | 低 — "place holder for future use" |
| GDPR 账户删除流未连接 | Android 端 | 中 — 后端表存在但无前端触发 |

---

## 二、全栈技术功能矩阵

### 2.1 后端 API (150+ 端点，10 个功能域)

| 域 | 端点数 | 核心文件 |
|----|--------|---------|
| 设备管理 | ~12 | `routes.ts`, `ws-hub.ts` |
| 任务调度 | ~15 | `routes.ts`, `queue/task-queue.ts` |
| 账户管理 | ~8 | `routes.ts` |
| VLM AI Agent | ~12 | `vlm/`, `decision/` |
| 脚本管理 | ~8 | `scripts-manifest-routes.ts` |
| 认证/RBAC | ~10 | `auth/` |
| 卡密激活 | ~8 | `activation/` |
| 计费/订阅 | ~10 | `billing/` |
| 配置管理 | ~10 | `config-manager/` |
| 管理面板 | ~20 | `admin/` 相关路由 |
| 租户/白标 | ~8 | `tenant/`, `whitelabel/` |
| 代理商/佣金 | ~6 | `agent/` |
| Webhook | ~5 | `webhook/` |
| 告警 | ~5 | `alerts/` |
| 审计日志 | ~3 | `audit/` |
| 开放 API | ~5 | `openapi/` |
| 支持工单 | ~5 | `support/` |
| 流媒体/Scrcpy | ~5 | `scrcpy/`, `stream/` |

### 2.2 Dashboard 前端 (40+ 页面)

| 分组 | 页面数 | 技术栈 |
|------|--------|--------|
| 主页面 | 13 | React 19 + Vite 8 + Tailwind 4 + Zustand 5 |
| 管理面板 | 21 | 同上 |
| 配置管理 | 5 | 同上 |
| 门户(Portal) | 17 | 同上 |
| AI 助手组件 | 5 | AdminAIChatPanel 等 |

### 2.3 数据库 (33 表)

| 位置 | 表数 | 说明 |
|------|------|------|
| `schema.ts` (主) | 21 | 设备/任务/用户/卡密/分组/平台账户/API密钥/cron/崩溃/GDPR/记忆/经验/定价等 |
| `tenant/schema.ts` | 1 | tenants |
| `audit/audit-schema.ts` | 1 | auditLogs |
| `agent/agent-schema.ts` | 3 | agents, cardBatches, agentCommissions |
| `openapi/openapi-schema.ts` | 2 | apiApps, apiUsageLogs |
| `whitelabel/whitelabel-schema.ts` | 1 | whitelabelConfigs |
| `support/ticket-schema.ts` | 2 | supportTickets, supportTicketReplies |
| `billing/billing-schema.ts` | 5 | billingPlans, subscriptions, orders, usageRecords, invoices |

### 2.4 中间件/基础设施

| 组件 | 技术 | 状态 |
|------|------|------|
| 消息队列 | BullMQ + Redis 7.4.3 | ✅ 生产就绪 |
| WebSocket Hub | ws + gzip | ✅ 设备+前端双连接池 |
| JWT 认证 | @fastify/jwt + RBAC | ✅ 4角色20资源 |
| 安全头 | CSP/X-Frame/HSTS/XSS | ✅ Phase D 已加固 |
| 频率限制 | @fastify/rate-limit | ✅ 200req/min 全局 + auth 严格 |
| CORS | 白名单域名 | ✅ Phase D 已修复 |
| AI 双模路由 | DeepSeek V4 Flash + Qwen3-VL-Plus | ✅ 90%/10% 分流 |
| NATS 同步 | JetStream | ⚠️ 默认禁用 |
| MinIO 存储 | S3 兼容 | ⚠️ 默认禁用 |
| Ray 调度 | HTTP 客户端 | ⚠️ 默认禁用 |
| WebRTC P2P | 信令中继 | ⚠️ FF_WEBRTC_P2P=false |

---

## 三、功能完整性分析

### 3.1 完成度总览

| 状态 | 功能域数 | 占比 |
|------|---------|------|
| ✅ 完成 | 27 | 56% |
| ⚠️ 部分完成 | 8 | 17% |
| 🔴 Stub/缺失 | 8 | 17% |
| 🔵 禁用(有代码) | 5 | 10% |

### 3.2 各功能域详细状态

#### ✅ 完全实现 (27 项)

设备管理、任务调度执行、社交媒体账户管理、VLM Agent 决策引擎、VLM 剧集录制回放、脚本编译(经验学习)、模型配置 A/B 测试、屏幕镜像(Scrcpy)、文件管理 APK 安装、WebSocket Hub 实时通信、用户认证(JWT+SMS)、多租户(后端+前端完整)、卡密激活、设备分组、批量操作、审计日志、告警规则、Webhook 引擎、订阅管理、积分系统、Token 定价、AI 助手会话、支持工单、API Key 管理、开放 API、白标/品牌定制、代理商/佣金系统、跨设备记忆

#### ⚠️ 部分完成 (8 项)

| 功能 | 缺失部分 |
|------|---------|
| 键位映射 | Android 端硬件键映射未完全连接 |
| 多租户 AI 助手 | `tenant_management` 工具返回"即将上线" |
| 支付(微信/支付宝) | Gateway 已编码但回调 webhook 未注册到路由 |
| Admin AI 助手 | 3 个动态导入指向错误 schema 文件 |
| WebRTC P2P | 信令完整但默认禁用，无前端集成 |
| Android 计费 | UpgradePlanScreen 存在但无实际支付采集 |
| GDPR 账户删除 | 表+路由存在但无 UI 触发 |
| Android 权限引导 | 4 个 TODO: Toast 代替 AlertDialog |

#### 🔴 Stub/缺失 (8 项)

| 功能 | 详情 |
|------|------|
| AI Memory Scheduler | 路由已注册但 `start()` 被注释 — DeepSeek JSON 解析问题 |
| vlmModelConfigs 表 | admin-assistant-executor 引用但不存在的表 |
| Federated Learning | 仅有 `FF_FEDERATED_LEARNING=false` 标志 |
| Edge Node 启动 | 仅有 `EDGE_NODE_ENABLED=false` 标志，无初始化代码 |
| P2P Group Control | 仅有 `FF_P2P_GROUP_CONTROL=false` 标志 |
| NATS 同步 | 完整代码但 `NATS_ENABLED=false`，`.catch(() => {})` 吞错误 |
| MinIO 存储 | 完整代码但 `MINIO_ENABLED=false`，`.catch(() => {})` 吞错误 |
| Ray 调度 | 完整 HTTP 客户端但 `RAY_ENABLED=false` |

### 3.3 关键缺陷

| # | 缺陷 | 严重度 | 位置 |
|---|------|--------|------|
| 1 | **admin-assistant-executor 动态导入错误** — 从 `../schema.js` 导入 `auditLogs`/`agents`，但这些表在 `audit/audit-schema.ts` 和 `agent/agent-schema.ts` 中，catch 块静默返回空数据 | 🔴 高 | `admin-assistant-executor.ts:631,647,715` |
| 2 | **vlmModelConfigs 表不存在** — 代码引用但无任何 schema 定义，始终走 catch 回退 | 🔴 高 | `admin-assistant-executor.ts:631` |
| 3 | **支付回调未接入** — `payment-webhook.ts` 存在但未在 `index.ts` 注册，微信/支付宝异步通知无法接收 | 🔴 高 | `payment-webhook.ts`, `index.ts` |
| 4 | **重复表定义** — `billingPlans`/`subscriptions`/`orders`/`usageRecords`/`invoices` 同时出现在 `schema.ts` 和 `billing-schema.ts`，迁移漂移风险 | 🟡 中 | `schema.ts`, `billing-schema.ts` |
| 5 | **AI Memory Scheduler 禁用** — start() 注释掉，原因: DeepSeek API JSON 解析 | 🟡 中 | `index.ts:528` |
| 6 | **Dashboard 重复路由** — `/portal/api-docs` 在 App.tsx 中注册两次 | 🟢 低 | `App.tsx:261,267` |
| 7 | **AgentCommissionPage 未路由** — 文件存在但未在 App.tsx 导入或注册 | 🟢 低 | `AgentCommissionPage.tsx` |
| 8 | **75+ 空 catch 块** — android-bridge 脚本全部吞异常无日志 | 🟡 中 | `autox-v7/` 脚本目录 |

### 3.4 TODO/FIXME 清单

| 位置 | 类型 | 内容 |
|------|------|------|
| `PermissionRationale.kt:34,67,96,125` | TODO | 4处需将 Toast 改为 AlertDialog |
| `NotificationHelper.kt:79,93,107` | 占位 | 通知图标使用系统默认 |
| `JsEngines.kt:131` | 占位 | "place holder for future use" |
| `admin-assistant-executor.ts:158` | Stub | 租户管理返回"即将上线" |
| `invoice-service.ts:2` | Stub | 发票 PDF 生成 |
| `redis-client.ts:2` | Stub | JSDoc 自称 stub |

---

## 四、综合指标

| 维度 | 完成度 | 说明 |
|------|--------|------|
| 后端 API | **92%** | 150+ 端点，8 个部分/缺失 |
| Dashboard 前端 | **95%** | 52 路由全部对应页面，1 个重复路由 |
| Android APP | **85%** | 29 屏完整，权限引导/计费/GDPR 有缺口 |
| 数据库 Schema | **90%** | 33 表，5 个重复定义，1 个不存在 |
| AI/决策引擎 | **80%** | 双模路由就绪，Memory Scheduler 禁用，3 个动态导入错误 |
| 基础设施 | **45%** | 核心(PG/Redis/BullMQ)就绪，NATS/MinIO/Ray 默认禁用 |
| 支付/商业化 | **65%** | 积分/订阅/定价完整，支付回调未接入 |
| **整体完成度** | **~78%** | 与 CLAUDE.md 战略评估一致 |

---

## 五、优先修复建议 (Top 10)

| 优先级 | 问题 | 预估 |
|--------|------|------|
| 🔴 P0 | 修复 admin-assistant-executor 动态导入路径 (3处) | 30min |
| 🔴 P0 | 注册 payment-webhook 路由到 index.ts | 15min |
| 🔴 P0 | 删除/迁移 schema.ts 中重复的 billing 表定义 | 30min |
| 🟡 P1 | 启用 AI Memory Scheduler (修复 DeepSeek JSON 解析) | 2h |
| 🟡 P1 | 实现 admin-assistant tenant_management 工具 | 1h |
| 🟡 P1 | Dashboard 修复重复 /api-docs 路由 | 5min |
| 🟡 P1 | Android PermissionRationale AlertDialog (4处) | 1h |
| 🟢 P2 | Android GDPR 账户删除流 | 2h |
| 🟢 P2 | 路由 AgentCommissionPage | 5min |
| 🟢 P2 | Android 空 catch 块添加日志 | 1h |
