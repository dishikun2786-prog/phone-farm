# PhoneFarm — 远程手机群控自动化平台

基于 DeekeScript + ad-deeke 的远程手机群控系统，支持通过 Web 仪表盘可视化控制多台 Android 手机，自动执行微信视频号、抖音、快手、小红书的营销任务。

## 架构

```
Web Dashboard (React) → Control Server (Node.js) → Tailscale VPN → Phone (DeekeScript + ad-deeke)
```

## 目录结构

```
phone-farm/
├── control-server/     # 控制服务器 (Node.js + Fastify + WebSocket)
│   ├── src/
│   │   ├── index.ts    # 入口
│   │   ├── ws-hub.ts   # WebSocket 管理
│   │   ├── routes.ts   # REST API
│   │   ├── schema.ts   # 数据库模型
│   │   ├── db.ts       # 数据库连接
│   │   └── config.ts   # 配置
│   ├── migrations/     # SQL 迁移
│   └── Dockerfile
├── dashboard/          # Web 仪表盘 (React + TypeScript + Vite + TailwindCSS)
│   └── src/
│       ├── pages/      # DeviceList, DeviceDetail, TaskList, TaskCreate, AccountList
│       ├── components/ # Layout
│       ├── store/      # Zustand 状态管理
│       ├── hooks/      # useWebSocket
│       └── lib/        # API 客户端
├── android-bridge/     # 手机端远程桥接
│   ├── remote-bridge.js    # DeekeScript 远程桥接模块
│   └── ad-deeke-tasks.json # 任务模板映射
└── deploy/             # 部署配置
    ├── docker-compose.yml
    ├── nginx.conf
    └── .env.example
```

## 快速开始

### 1. 服务器部署

```bash
# 克隆项目
git clone <repo-url> phone-farm
cd phone-farm/deploy

# 配置环境变量
cp .env.example .env
# 编辑 .env，修改 JWT_SECRET 和 DEVICE_AUTH_TOKEN

# 启动服务
docker-compose up -d

# 初始化数据库
docker exec -i phonefarm-postgres psql -U phonefarm -d phonefarm < ../control-server/migrations/0000_initial.sql

# 初始化任务模板
curl -X POST http://localhost:8443/api/v1/seed-templates
```

### 2. 手机部署

1. **安装 Tailscale APK**
   - 下载 Tailscale Android 客户端
   - 使用 Headscale 预授权密钥登录
   - 验证获得 Tailscale IP (100.64.x.x)

2. **安装 DeekeScript APK**
   - 从 https://deeke.cn 下载最新版
   - 安装后授予无障碍权限、悬浮窗权限、忽略电池优化

3. **导入脚本**
   - 将 ad-deeke 项目文件导入到 DeekeScript
   - 将 `remote-bridge.js` 复制到项目中

4. **配置并启动桥接**
   - 修改 `remote-bridge.js` 中的服务器地址为 Tailscale IP
   - 在 DeekeScript 中运行 `remote-bridge.js`

5. **(可选) 开启 ADB over TCP 用于屏幕流**
   ```bash
   adb tcpip 5555
   ```

### 3. 访问仪表盘

打开浏览器访问 `http://47.115.168.24`
- 默认账号: admin / admin123

## API 文档

### 设备管理
- `GET /api/v1/devices` — 设备列表
- `GET /api/v1/devices/:id` — 设备详情
- `POST /api/v1/devices/:id/command` — 发送指令

### 任务管理
- `GET /api/v1/tasks` — 任务列表
- `POST /api/v1/tasks` — 创建任务
- `PUT /api/v1/tasks/:id` — 更新任务
- `DELETE /api/v1/tasks/:id` — 删除任务
- `POST /api/v1/tasks/:id/run` — 立即执行
- `POST /api/v1/tasks/:id/stop` — 停止执行

### WebSocket
- `ws://host:8443/ws/device` — 设备连接
- `ws://host:8443/ws/frontend` — 前端订阅

## 开发

```bash
# 控制服务器
cd control-server
npm install
npm run dev

# 仪表盘
cd dashboard
npm install
npm run dev
```

## 许可证

ISC
