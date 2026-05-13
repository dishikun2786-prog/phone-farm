```
→ 检查 PG 连接: DATABASE_URL 是否正确
→ 查看日志: pm2 logs phonefarm-control --lines 50
```

## 2026-05-13 生产环境更新记录

### 🔴 Redis 升级 5.0.10 → 7.4.3

- **原因**：BullMQ 要求 Redis ≥ 6.2.0，旧版5.0.10导致 `Worker.run crash: Cannot read properties of undefined (reading 'client')`
- **操作**：下载 [redis-windows/redis-windows](https://github.com/redis-windows/redis-windows/releases) 7.4.3，停止服务 → 备份 C:\BtSoft\redis → 替换二进制 → 更新 redis.conf（需 `maxmemory-policy noeviction`）→ 启动
- **文件**：`deploy/scripts/upgrade-redis.ps1`, `deploy/scripts/fix-redis.ps1`

### 🟢 BullMQ 兼容性修复

- **文件**：[redis-client.ts](src\queue\redis-client.ts) — `maxRetriesPerRequest: 3` → `null`
- **原因**：BullMQ Worker 要求此字段为 `null`，否则 `Cannot read properties of undefined (reading 'client')`
- **结果**：BullMQ 队列正常初始化 `[queue] BullMQ initialized`

### 🟢 PM2 配置增强（防止 OOM）

- **文件**：[ecosystem.config.cjs](control-server\ecosystem.config.cjs)
- `phonefarm-control`: heap 256→512MB, restart 300→600M, max_restarts 10→20
- `phonefarm-relay`: heap 128→512MB, restart 192→600M, max_restarts 10→20

### 🟢 6 个缺失 API 路由修复

| 修复                                    | 文件                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /api/v1/vlm/models` 404            | [index.ts](control-server\src\index.ts) — 注册 `registerVlmModelRoutes`             |
| `GET /api/v1/vlm/stats` 404             | [index.ts](control-server\src\index.ts) — 新增路由                                  |
| `GET /api/v1/scripts/version` 404       | [scripts-manifest-routes.ts](control-server\src\scripts-manifest-routes.ts) — 新增  |
| `GET /api/v1/scripts/version/:id` 404   | 同上 — 新增                                                                         |
| `POST /api/v1/scripts/deploy-batch` 404 | 同上 — 新增                                                                         |
| `POST /api/v1/seed-templates` 404       | [api.ts](dashboard\src\lib\api.ts) — 路径 `/seed-templates`→`/admin/seed-templates` |

### 🟢 前端路由修复

| 修复                         | 文件                                                   |
| ---------------------------- | ------------------------------------------------------ |
| `/login` 已登录重定向到首页  | [App.tsx](dashboard\src\App.tsx)                       |
| 移除未使用的 `WS_PATHS` 变量 | [useWebSocket.ts](dashboard\src\hooks\useWebSocket.ts) |

### 🟢 POST /api/v1/groups 400 修复

- **文件**：[scrcpy-routes.ts](control-server\src\scrcpy\scrcpy-routes.ts) — 允许创建空设备分组 `deviceIds: []`
- **文件**：[DeviceGroupManagement.tsx](dashboard\src\pages\admin\DeviceGroupManagement.tsx) — 数据格式修复（裸数组 vs `{groups, total}`）

### 🟡 AI Memory 智能内存调度（已禁用）

- **文件**：`src/ai-memory/` (anthropic-client.ts + deepseek-advisor.ts + memory-scheduler.ts + ai-memory-routes.ts)
- **设计**：DeepSeek V4 Flash (Anthropic API) 决策引擎 + 规则回退 + PM2 进程管理
- **API**：`/api/v1/ai-memory/status|stats|history`，`POST /api/v1/ai-memory/check` 手动触发
- **状态**：自动调度已禁用（DeepSeek API JSON 解析问题），REST API 可用

### 🔴 CMD 弹窗问题排查与修复

- **根因1**：`HKCU\Run` 注册表 PM2 自启调用 `.cmd` 弹出窗口 → 已移除，改为隐藏计划任务
- **根因2**：`Common Startup\宝塔面板.lnk` 开机弹窗 → 已移除
- **根因3**：`ShengRiStartup.bat` 计划任务 → 已改为 `.ps1` + `-WindowStyle Hidden`
- **结果**：所有计划任务均配置 `-WindowStyle Hidden` + `Settings -Hidden`，不再弹窗
- **注意**：所有 PhoneFarm 计划任务当前均为 **Disabled** 状态

### 🟢 DeepSeek API 配置更新

- **API 格式**：从 OpenAI 兼容格式 → Anthropic Messages API
- **Base URL**：`https://api.deepseek.com/anthropic`
- **模型**：`deepseek-v4-flash`（config.ts + deepseek-client.ts 同步更新）
- **认证**：`x-api-key`（Anthropic 标准）

## 部署脚本体系

```
d:\www\phone\deploy\scripts\
├── deploy.ps1           ← 一键部署（git pull → npm install → build → pm2 reload → health check）
├── health-check.ps1     ← 全栈健康监控（PM2/端口/API/磁盘/内存/日志）
├── log-rotate.ps1       ← 日志轮转（7天归档 + PM2 flush）
├── memory-guard.ps1     ← 内存防线（>92% 暂停非关键进程）
├── upgrade-redis.ps1    ← Redis 升级脚本（已执行）
└── fix-redis.ps1        ← Redis 配置修复（已执行）
```

## Windows 计划任务（全部 Disabled）

| 任务                   | 触发条件   | 状态     |
| ---------------------- | ---------- | -------- |
| PhoneFarm-HealthCheck  | 每3600分钟 | Disabled |
| PhoneFarm-LogRotate    | 每天03:00  | Disabled |
| PhoneFarm-PM2Resurrect | 系统启动   | Disabled |
| PhoneFarm-MemoryGuard  | 每60分钟   | Disabled |
| PM2-AutoStart-Hidden   | 用户登录   | Ready    |

## 待完成任务

### 高优先级

- [ ] **AI模型配置界面** — 服务控制面板的 AI 默认文本分析选择接口（DeepSeek V4 Pro）和视觉理解大模型选择（阿里云百炼 Qwen3-VL-Plus）
- [ ] **百炼 Qwen3-VL API 集成** — 按 Anthropic 统一接口规范实现 Qwen3 VL Plus 视觉分析客户端
- [ ] **系统健康检查** — 验证生产环境所有服务正常运行（当前 Redis 7.4.3 / PG 18 / Caddy 均正常）

### 中优先级

- [ ] AI Memory Scheduler JSON 解析修复 — DeepSeek API 返回被截断问题
- [ ] 升级 Redis Windows 服务自动恢复机制
- [ ] 设备分组功能前端/后端完整联调测试

### 低优先级

- [ ] 日志自动清理 — 控制日志文件大小
- [ ] Android APK 生产构建与分发
- [ ] PostgreSQL 自动备份脚本
