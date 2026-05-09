# PhoneFarm — 远程手机群控自动化平台

## 项目定位

通过 Web 仪表盘可视化控制多台分布在不同网络的 Android 手机，自动执行微信视频号、抖音、快手、小红书的营销任务（浏览、点赞、评论、关注、私信等）。

## 架构概览

```
浏览器 (React SPA)          手机1  手机2  手机N (DeekeScript + ad-deeke 脚本)
     │                         │      │      │
     ▼                         ▼      ▼      ▼
  Nginx :80              Tailscale 内网 (100.64.x.x)
     │                         │      │      │
     ▼                         └──────┼──────┘
  控制服务器 :8443                    │
  (Node.js/Fastify)              Headscale :8080
  - REST API                   (47.115.168.24 Docker)
  - WebSocket Hub
  - PostgreSQL 18
  - Redis (待装)
```

**核心设计决策：不重复造轮子。** Android 端复用成熟的 DeekeScript 运行时 + ad-deeke 业务脚本（40+ 任务已写好），仅新增 `remote-bridge.js`（~280 行）作为手机到控制服务器的桥接。

## 技术栈

| 层 | 技术 | 版本 |
|----|------|------|
| 控制服务器 | Node.js + Fastify + TypeScript | node 26.1, fastify 5 |
| 数据库 | PostgreSQL (Drizzle ORM) | PG 18 |
| 缓存/队列 | Redis (ioredis) | 待装 |
| 前端 | React + Vite + TailwindCSS | react 19, vite 8 |
| 状态管理 | Zustand | |
| Android 运行时 | DeekeScript (企业级无障碍服务框架) | |
| APP 自动化 | ad-deeke 脚本 (GitHub: dishikun2786-prog/ad-deeke) | |
| VPN | Headscale + Tailscale | headscale 0.28 (Docker) |
| 部署 | Docker Compose + Nginx | |

## 目录结构

```
C:\www\phone-farm\
├── CLAUDE.md                   # ← 本文件，Claude Code 自动加载
├── README.md                   # 项目说明（面向人）
├── .gitignore
├── .vscode/
│   ├── settings.json           # VS Code 工作区配置
│   └── extensions.json         # 推荐扩展
├── .claude/
│   └── settings.json           # Claude Code 权限预设
│
├── control-server/             # 后端控制服务器
│   ├── .env                    # 环境变量（DATABASE_URL, JWT_SECRET 等）
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── drizzle.config.ts
│   ├── migrations/
│   │   └── 0000_initial.sql    # 数据库建表迁移
│   └── src/
│       ├── index.ts            # 生产入口（需 PostgreSQL + Redis）
│       ├── dev-server.ts       # 开发入口（JSON 文件存储，无需 PG）★
│       ├── config.ts           # 环境变量 Zod 校验
│       ├── db.ts               # PostgreSQL 连接 (drizzle-orm)
│       ├── schema.ts           # 数据库表定义 (6 张表)
│       ├── ws-hub.ts           # WebSocket Hub (设备+前端连接管理)
│       └── routes.ts           # REST API 路由（生产用）
│
├── dashboard/                  # 前端仪表盘
│   ├── package.json
│   ├── vite.config.ts          # Vite 配置（含 API 代理到 :8443）
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx             # 路由 + WebSocket 消息分发
│       ├── index.css           # TailwindCSS 入口
│       ├── lib/api.ts          # REST API 客户端封装
│       ├── hooks/useWebSocket.ts  # WebSocket hook（自动重连）
│       ├── store/index.ts      # Zustand 全局状态
│       ├── components/Layout.tsx  # 导航栏布局
│       └── pages/
│           ├── Login.tsx       # 登录页
│           ├── DeviceList.tsx  # 设备总览（网格卡片）
│           ├── DeviceDetail.tsx# 设备详情 + 实时画面 + 快捷操作
│           ├── TaskList.tsx    # 任务列表
│           ├── TaskCreate.tsx  # 创建/编辑任务
│           └── AccountList.tsx # 账号管理
│
├── android-bridge/             # 手机端远程桥接
│   ├── remote-bridge.js        # DeekeScript 模块：WebSocket/心跳/任务执行/截图
│   └── ad-deeke-tasks.json     # 15 个任务模板的参数定义
│
└── deploy/                     # 生产部署
    ├── docker-compose.yml      # headscale + postgres + redis + server + nginx
    ├── nginx.conf              # 前端静态文件 + API/WS 反向代理
    └── .env.example
```

## 环境搭建（在新机器上）

### 1. 克隆项目
```bash
git clone https://github.com/dishikun2786-prog/phone-farm.git
cd phone-farm
```

### 2. 安装依赖
```bash
cd control-server && npm install
cd ../dashboard && npm install
```

### 3. 配置环境变量
```bash
# control-server/.env
PORT=8443
DATABASE_URL=postgresql://postgres:123456@localhost:5432/phonefarm
JWT_SECRET=change-me-in-production
DEVICE_AUTH_TOKEN=device-auth-token-change-me
```

### 4. 初始化数据库
```bash
# 创建数据库
psql -U postgres -c "CREATE DATABASE phonefarm;"
# 运行迁移
psql -U postgres -d phonefarm -f control-server/migrations/0000_initial.sql
```

### 5. 启动开发服务器
```bash
# 终端1：控制服务器（无 PG 时用 dev-server）
cd control-server
npm run dev          # tsx watch src/dev-server.ts (JSON 文件存储)
# 或
npm run prod         # tsx src/index.ts (需 PostgreSQL)

# 终端2：前端仪表盘
cd dashboard
npm run dev          # http://localhost:5173
```

### 6. 初始化任务模板
```bash
curl -X POST http://localhost:8443/api/v1/seed-templates
```

## 当前运行状态

| 组件 | 地址 | 状态 |
|------|------|------|
| 控制服务器 | localhost:8443 | 运行中 (PG 模式) |
| 前端仪表盘 | localhost:5173 | 运行中 (Vite dev) |
| PostgreSQL | localhost:5432 | 运行中 (postgres/123456) |
| Redis | localhost:6379 | 未安装 |
| Headscale | 47.115.168.24:8080 | 运行中 (Docker) |

## 数据库表

| 表 | 说明 |
|----|------|
| devices | 设备注册信息（id, name, tailscale_ip, status, 心跳数据） |
| accounts | 平台账号（platform, username, password_encrypted, device_id） |
| task_templates | 任务模板（name, platform, script_name, description） |
| tasks | 任务实例（template_id, device_id, config, cron_expr, enabled） |
| executions | 执行记录（task_id, device_id, status, stats, logs） |
| users | 用户（username, password_hash, role） |

## 关键配置值

| 配置项 | 值 | 位置 |
|--------|-----|------|
| Headscale 服务器 | 47.115.168.24:8080 | Docker |
| Headscale gRPC | 47.115.168.24:50443 | Docker |
| Headscale 预授权密钥 | `hskey-auth-0_78HunMq345-7r-0eXVtEIOKdkvwtHVkHTO3Zn-NKeM-OVMOhgq93XPwGnTsVWJXIr-uD0HseuHj` | 30天有效期 |
| 数据库密码 | 123456 | .env |
| 默认登录 | admin / admin123 | 开发环境 |
| 设备认证 Token | device-auth-token-change-me | .env |
| GitHub 仓库 | https://github.com/dishikun2786-prog/phone-farm | origin |

## ad-deeke 任务脚本映射

ad-deeke 源码在 `C:\www\wwwad-deeke\`（已 clone 到本地）。

| 脚本文件 | 平台 | 功能 |
|----------|------|------|
| task_dy_toker.js | 抖音 | 推荐营销（刷视频+评论+点赞+关注+私信） |
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

## 开发约定

1. **不要从零开发 Android 自动化** — 复用 DeekeScript + ad-deeke
2. **开发模式用 dev-server.ts**（JSON 文件存储），生产模式用 index.ts（PostgreSQL）
3. **前端代理**：Vite 自动将 `/api/*` 和 `/ws/*` 代理到 `localhost:8443`
4. **WebSocket 协议**：设备连 `/ws/device`，前端连 `/ws/frontend`
5. **不要提交 .env 文件** — 已在 .gitignore 中
6. **修改数据库 schema 后**：更新 `schema.ts` + `migrations/` + 运行迁移

## 手机部署步骤（待执行）

1. 安装 Tailscale APK → 用预授权密钥加入 Headscale
2. 安装 DeekeScript APK → 授予无障碍/悬浮窗/电池优化权限
3. 导入 ad-deeke 脚本到 DeekeScript
4. 修改 `remote-bridge.js` 中的 `serverUrl` 为 Tailscale IP
5. 在 DeekeScript 中运行 `remote-bridge.js`
6. Web 仪表盘应看到设备上线

## 已知待办

- [ ] Redis 安装和任务队列实现
- [ ] Cron 定时调度器（前端已支持 cron 表达式输入，后端未实现）
- [ ] 手机实际连接测试
- [ ] Headscale ACL 规则配置
- [ ] HTTPS/WSS 配置（生产环境）
- [ ] JWT 正式用户管理（当前仅 dev admin/admin123）
- [ ] scrcpy 屏幕流集成（可选）
- [ ] 提交 dev-server.ts / dev-db.ts 到 git
