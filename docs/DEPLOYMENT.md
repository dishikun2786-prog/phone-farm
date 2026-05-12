# PhoneFarm 部署手册

> 本地开发 → GitHub → VPS 生产环境的全链路同步部署

## 部署架构总览

```
本地开发机 (Windows 11)                  VPS (47.243.254.248)
┌──────────────────────────┐            ┌──────────────────────────────┐
│  dashboard/  (React SPA) │ ─build→   │  Caddy :443                  │
│  control-server/         │ ─push→    │  ├─ /api/* → :8443           │
│  android-client/ (APK)   │           │  ├─ /ws/*  → :8443 / :8499   │
│                          │           │  └─ /      → dashboard dist/ │
│  GitHub: phone-farm.git  │ ─pull→    │                              │
└──────────────────────────┘           │  phonefarm-control :8443     │
                                       │  phonefarm-relay   :8499     │
                                       │  PostgreSQL :5432            │
                                       │  Redis :6379                 │
                                       └──────────────────────────────┘
```

| 组件 | 本地开发 | VPS 生产 | 部署方式 |
|------|---------|---------|---------|
| Dashboard | `npm run dev` :5173 | Caddy 静态文件 | `vite build` → dist/ → VPS |
| Control Server | `npm run dev` :8445 | PM2 `phonefarm-control` :8443 | git pull + PM2 restart |
| Relay Server | 无需 | PM2 `phonefarm-relay` :8499 | git pull + PM2 restart |
| PostgreSQL | 无需 | :5432 phonefarm 库 | 迁移脚本 psql 执行 |
| Android APK | `gradlew assembleDebug` | APK 下载分发 | 本地构建 → HTTP 分发 |

## 部署端口清单

```
:80    → Nginx (shengri 两个站点 HTTP)
:443   → Caddy (HTTPS 终端 + 路由分流)
:3000  → shengri-api (PM2)
:3001  → shengri-web (PM2)
:3002  → shengri-admin (PM2)
:5432  → PostgreSQL 18
:6379  → Redis
:3306  → MySQL 5.5
:8443  → ★ PhoneFarm Control Server (PM2)
:8499  → ★ PhoneFarm Relay Server (PM2)
:8444  → ★ UDP Relay (音视频帧中转)
```

---

## 一、Git 工作流规范

### 1.1 提交规范

```powershell
# 在本地开发机操作
cd e:\Program Files\www\phone

# 查看变更
git status
git diff --stat

# 分模块提交（推荐）
git add dashboard/src/                          # Dashboard 前端变更
git commit -m "feat(dashboard): 暗色主题 + 响应式布局 + UI 专业化"

git add control-server/src/                     # 后端服务变更
git commit -m "feat(server): 配置管理 API + 边缘决策引擎"

git add control-server/migrations/              # 数据库迁移
git commit -m "feat(db): 新增 config_management + edge_memory 表"

git add android-client/                         # Android 客户端变更
git commit -m "feat(android): WebSocket 消息分发器 + 生产环境适配"

# 推送
git push origin master
```

### 1.2 Commit Message 格式

```
<type>(<scope>): <简短描述>

类型: feat / fix / refactor / style / docs / chore
范围: dashboard / server / relay / android / db / deploy
```

---

## 二、VPS 环境初始化（首次部署）

仅在首次部署或 VPS 重建时执行。

### 2.1 基础环境

```powershell
# === VPS 上以管理员身份执行 ===

# 1. Node.js (如果尚未安装)
node --version
# 预期: v24.x

# 2. PM2
npm install -g pm2
npm install -g pm2-windows-startup
pm2-startup install

# 3. Git (如果尚未安装)
git --version

# 4. 克隆仓库
cd D:\
git clone https://github.com/dishikun2786-prog/phone-farm.git phone
cd phone\control-server

# 5. 安装依赖
npm install

# 6. 配置 .env (仅首次，后续不改)
# 参考 deploy/vps-relay/.env.production
```

### 2.2 首次 .env 配置

```powershell
cd D:\phone\control-server

# 生成随机密钥
$JwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
$DeviceToken = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
$ControlToken = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
$AiToken = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })

@"
PORT=8443
JWT_SECRET=$JwtSecret
DEVICE_AUTH_TOKEN=$DeviceToken
CONTROL_TOKEN=$ControlToken
AI_AUTH_TOKEN=$AiToken
DATABASE_URL=postgresql://postgres:123456@localhost:5432/phonefarm
REDIS_URL=redis://localhost:6379
UDP_RELAY_PORT=8444
RELAY_PORT=8499
RELAY_HOST=0.0.0.0
"@ | Out-File -Encoding UTF8 .env

Write-Host "Tokens saved to .env — 请复制保存到安全位置"
```

### 2.3 初始化数据库

```powershell
# 创建数据库 (如果首次)
psql -U postgres -c "CREATE DATABASE phonefarm;"

# 执行所有迁移
Get-ChildItem migrations/*.sql | Sort-Object Name | ForEach-Object {
    Write-Host "Running: $_"
    psql -U postgres -d phonefarm -f $_.FullName
}
```

### 2.4 首次启动服务

```powershell
pm2 start ecosystem.config.cjs
pm2 save
```

---

## 三、日常部署流程（核心）

每次代码更新后，按以下步骤同步到 VPS。

### 3.1 Dashboard 前端部署

Dashboard 是纯静态 SPA，构建后上传 `dist/` 到 VPS 即可。

```powershell
# === 本地开发机 ===

# 1. 构建
cd e:\Program Files\www\phone\dashboard
npm run build
# 产出: dist/ (index.html + assets/)

# 2. 压缩
Compress-Archive -Path dist\* -DestinationPath dashboard-dist.zip -Force

# 3. 上传到 VPS (选择一种方式)
# 方式 A: scp (推荐)
scp dashboard-dist.zip Administrator@47.243.254.248:C:\phonefarm-dashboard-dist.zip

# 方式 B: 通过 GitHub (适合无法直连的场景)
# 将 dist/ 提交到 GitHub Release，VPS 下载解压

# === VPS ===

# 4. 解压到 Caddy 静态目录
Expand-Archive -Path C:\phonefarm-dashboard-dist.zip -DestinationPath C:\phonefarm-dashboard\ -Force

# 5. Caddy 自动 reload (Caddyfile 已配置 file_server)
# 无需重启，直接刷新浏览器即可看到新版本
```

**Caddyfile 静态文件配置**（首次需添加）:

```caddy
phone.openedskill.com {
    # 静态文件根目录
    root * C:\phonefarm-dashboard

    # SPA fallback — 所有非 API/WS 请求回退到 index.html
    @api {
        path /api/* /ws/* /health
    }
    route {
        # API + WebSocket 路由
        reverse_proxy /api/* localhost:8443
        reverse_proxy /ws/device localhost:8443
        reverse_proxy /ws/frontend localhost:8443
        reverse_proxy /ws/phone localhost:8499
        reverse_proxy /ws/control localhost:8499
        reverse_proxy /ws/ai/* localhost:8499
        reverse_proxy /api/v1/relay/* localhost:8499
        reverse_proxy /api/v1/ai/* localhost:8499
        reverse_proxy /health localhost:8443

        # SPA: 所有其他路径返回 index.html
        file_server {
            index index.html
        }
    }
}
```

### 3.2 Control Server 服务端部署

```powershell
# === VPS 上操作 ===

# 1. 拉取最新代码
cd D:\phone
git pull origin master

# 2. 安装新依赖 (如有)
cd control-server
npm install

# 3. 执行新数据库迁移 (如有新的 .sql 文件)
Get-ChildItem migrations/*.sql | Sort-Object Name | ForEach-Object {
    Write-Host "Checking: $_"
    # 检查迁移是否已执行（通过注释表或手动确认）
    psql -U postgres -d phonefarm -f $_.FullName
}

# 4. 编译检查 (可选，确保无 TS 错误)
npx tsc --noEmit
# 输出为空 = 0 错误

# 5. 重启服务 (零停机 reload)
pm2 reload ecosystem.config.cjs

# 6. 查看日志确认正常
pm2 logs phonefarm-control --lines 20
pm2 logs phonefarm-relay --lines 20
```

### 3.3 Android APK 构建与分发

```powershell
# === 本地开发机 ===

# 1. 设置 JDK 21
$env:JAVA_HOME = "C:\Users\dishi\AppData\Local\PhoneFarm\jdk21\jdk-21.0.11+10"

# 2. 构建
cd e:\Program Files\www\phone\android-client
.\gradlew.bat assembleDebug      # Debug 版 (快速测试)
# .\gradlew.bat assembleRelease  # Release 版 (需签名)

# 3. APK 位置
# app/build/outputs/apk/debug/app-debug.apk
# 或通过 ADB 直接安装到 USB 连接的手机:
# adb install app\build\outputs\apk\debug\app-debug.apk

# 4. 上传到 HTTP 分发 (可选)
# 将 APK 复制到 VPS dashboard 静态目录供手机下载:
scp app\build\outputs\apk\debug\app-debug.apk Administrator@47.243.254.248:C:\phonefarm-dashboard\phonefarm.apk
# 手机访问: https://phone.openedskill.com/phonefarm.apk
```

---

## 四、数据库迁移规范

### 4.1 迁移文件命名

```
control-server/migrations/
├── 0000_initial.sql              # 基础表结构
├── 0001_vlm.sql                  # VLM AI 相关表
├── 0002_edge_memory.sql          # 边缘决策 + 记忆
├── 0002_persistent_stores.sql    # 持久化存储
├── 0003_config_management.sql    # 配置管理系统
└── NNNN_<描述>.sql               # 未来迁移
```

### 4.2 迁移执行原则

- **幂等性**：迁移必须使用 `CREATE TABLE IF NOT EXISTS`、`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- **不可逆操作**：删除列/表需先在注释中标注，手动确认后再执行
- **执行时机**：在 `pm2 reload` 之前执行
- **回滚方案**：保留旧表数据，新增 `_backup` 表

### 4.3 当前迁移状态

```powershell
# 查看已执行的迁移
psql -U postgres -d phonefarm -c "\dt"
# 应看到 9+ 张表

# 查看迁移文件
ls D:\phone\control-server\migrations\
```

---

## 五、VPS 服务一键更新脚本

将以下脚本保存为 VPS 上的 `D:\phone\deploy.ps1`，一键完成所有更新：

```powershell
# deploy.ps1 — PhoneFarm VPS 一键部署
param(
    [switch]$SkipBuild = $false,
    [switch]$SkipMigration = $false
)

$ErrorActionPreference = "Stop"
Set-Location D:\phone

Write-Host "=== PhoneFarm Deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" -ForegroundColor Cyan

# 1. Git Pull
Write-Host "[1/3] git pull..." -ForegroundColor Yellow
git pull origin master
if ($LASTEXITCODE -ne 0) { throw "git pull failed" }

# 2. Dependencies
Write-Host "[2/3] npm install..." -ForegroundColor Yellow
Set-Location control-server
npm install --no-audit --no-fund

# 3. Migrations (if any new .sql files)
if (-not $SkipMigration) {
    Write-Host "[3/5] Running migrations..." -ForegroundColor Yellow
    Get-ChildItem migrations/*.sql | Sort-Object Name | ForEach-Object {
        Write-Host "  → $_"
        psql -U postgres -d phonefarm -f $_.FullName -q 2>&1 | Out-Null
    }
}

# 4. TypeScript check
Write-Host "[4/5] tsc --noEmit..." -ForegroundColor Yellow
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "TypeScript errors — aborting deploy" }

# 5. PM2 reload
Write-Host "[5/5] PM2 reload..." -ForegroundColor Yellow
pm2 reload ecosystem.config.cjs
pm2 save

# 6. Verify
Start-Sleep -Seconds 3
Write-Host "=== Verification ===" -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod -Uri "http://localhost:8443/health" -TimeoutSec 5
    Write-Host "Control: $($health.status) (uptime: $([math]::Round($health.uptime, 1))s)" -ForegroundColor Green
} catch {
    Write-Host "Control health check FAILED: $_" -ForegroundColor Red
}
try {
    $relay = Invoke-RestMethod -Uri "http://localhost:8499/health" -TimeoutSec 5
    Write-Host "Relay: $($relay.status) (uptime: $([math]::Round($relay.uptime, 1))s)" -ForegroundColor Green
} catch {
    Write-Host "Relay health check FAILED: $_" -ForegroundColor Red
}

Write-Host "=== Done ===" -ForegroundColor Green
```

**使用方式**:

```powershell
# VPS 上完整更新
powershell -ExecutionPolicy Bypass -File D:\phone\deploy.ps1

# 跳过迁移
powershell -ExecutionPolicy Bypass -File D:\phone\deploy.ps1 -SkipMigration

# 仅重启
pm2 reload ecosystem.config.cjs
```

---

## 六、本地开发机一键部署脚本

将以下脚本保存为本地 `e:\Program Files\www\phone\deploy.ps1`：

```powershell
# deploy.ps1 — 本地构建 + 上传到 VPS
param(
    [switch]$DashboardOnly = $false,
    [switch]$ServerOnly = $false,
    [switch]$ApkOnly = $false
)

$ErrorActionPreference = "Stop"
$VPS = "Administrator@47.243.254.248"
$RepoRoot = "e:\Program Files\www\phone"

function Deploy-Dashboard {
    Write-Host "=== Building Dashboard ===" -ForegroundColor Cyan
    Set-Location "$RepoRoot\dashboard"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Dashboard build failed" }

    Write-Host "Uploading to VPS..." -ForegroundColor Yellow
    Compress-Archive -Path dist\* -DestinationPath "$env:TEMP\dashboard-dist.zip" -Force
    scp "$env:TEMP\dashboard-dist.zip" "${VPS}:C:\phonefarm-dashboard-dist.zip"

    Write-Host "VPS: extracting..." -ForegroundColor Yellow
    ssh $VPS "Expand-Archive -Path C:\phonefarm-dashboard-dist.zip -DestinationPath C:\phonefarm-dashboard\ -Force"

    Write-Host "Dashboard deployed → https://phone.openedskill.com" -ForegroundColor Green
}

function Deploy-Server {
    Write-Host "=== Pushing server code ===" -ForegroundColor Cyan
    Set-Location $RepoRoot
    git push origin master
    if ($LASTEXITCODE -ne 0) { throw "git push failed" }

    Write-Host "VPS: pulling + restarting..." -ForegroundColor Yellow
    ssh $VPS "cd D:\phone ; git pull origin master ; cd control-server ; npm install ; pm2 reload ecosystem.config.cjs"

    Write-Host "Server deployed" -ForegroundColor Green
}

function Deploy-Apk {
    Write-Host "=== Building APK ===" -ForegroundColor Cyan
    $env:JAVA_HOME = "C:\Users\dishi\AppData\Local\PhoneFarm\jdk21\jdk-21.0.11+10"
    Set-Location "$RepoRoot\android-client"
    .\gradlew.bat assembleDebug
    if ($LASTEXITCODE -ne 0) { throw "APK build failed" }

    $apkSource = "$RepoRoot\android-client\app\build\outputs\apk\debug\app-debug.apk"

    Write-Host "Uploading APK to VPS..." -ForegroundColor Yellow
    scp $apkSource "${VPS}:C:\phonefarm-dashboard\phonefarm.apk"

    Write-Host "APK available at: https://phone.openedskill.com/phonefarm.apk" -ForegroundColor Green
}

# --- Main ---
if ($ApkOnly) {
    Deploy-Apk
} elseif ($DashboardOnly) {
    Deploy-Dashboard
} elseif ($ServerOnly) {
    Deploy-Server
} else {
    # Full deploy
    Deploy-Dashboard
    Deploy-Server
}
```

**使用方式**:

```powershell
# 本地一键全量部署 (Dashboard + Server)
powershell -ExecutionPolicy Bypass -File deploy.ps1

# 仅仪表盘
powershell -ExecutionPolicy Bypass -File deploy.ps1 -DashboardOnly

# 仅服务端
powershell -ExecutionPolicy Bypass -File deploy.ps1 -ServerOnly

# 仅 APK
powershell -ExecutionPolicy Bypass -File deploy.ps1 -ApkOnly
```

---

## 七、部署验证清单

每次部署后执行以下验证：

### 7.1 健康检查

```powershell
# VPS 本地检查
Invoke-RestMethod http://localhost:8443/health
# → {"status":"ok","uptime":123.4,"version":"2.1.0"}

Invoke-RestMethod http://localhost:8499/api/v1/relay/health
# → {"status":"ok","uptime":...}

# 公网检查
Invoke-RestMethod https://phone.openedskill.com/health
# → {"status":"ok","uptime":...}

Invoke-RestMethod https://phone.openedskill.com/api/v1/relay/stats
# → {"controlConnected":...,"activePhones":...,"activeFrontends":...}
```

### 7.2 Dashboard 页面检查

| 页面 | URL | 检查点 |
|------|-----|--------|
| 登录页 | `/login` | 登录表单正常，暗色主题切换 |
| 设备列表 | `/devices` | 设备卡片加载，搜索/过滤工作 |
| 设备详情 | `/devices/:id` | 截图显示，操作按钮响应 |
| 任务管理 | `/tasks` | 任务列表加载，搜索/过滤 |
| VLM AI | `/vlm` | 表单可选设备，episode 历史 |
| 账号管理 | `/accounts` | 账号列表加载 |
| 服务面板 | `/settings` | 健康仪表盘，实时日志 |
| 管理面板 | `/admin` | 8 个子模块可访问 |
| 配置中心 | `/config` | 5 个子模块可访问 |
| 键位映射 | `/keymaps` | 可视化编辑器 |

### 7.3 WebSocket 验证

```powershell
npm install -g wscat

# 前端 WebSocket
wscat -c wss://phone.openedskill.com/ws/frontend
# 发送: {"type":"auth","token":"<JWT>"}
# 预期: {"type":"auth_ok"}

# 手机 WebSocket
wscat -c wss://phone.openedskill.com/ws/device
# 发送: {"type":"auth","token":"<DEVICE_AUTH_TOKEN>","deviceId":"test-001"}
```

### 7.4 PM2 状态

```powershell
pm2 list
# phonefarm-control  → online, 0 restarts
# phonefarm-relay    → online, 0 restarts

pm2 logs --lines 10
# 无异常错误
```

---

## 八、回滚流程

如果部署后发现问题：

```powershell
# === VPS 上操作 ===

# 1. 回退到上一个提交
cd D:\phone
git log --oneline -5          # 找到目标 commit
git revert <bad-commit>       # 创建反向提交 (推荐，保留历史)
# 或
git reset --hard <good-commit> # 强制回退 (需谨慎)

# 2. 重启服务
cd control-server
pm2 reload ecosystem.config.cjs

# 3. 验证
Invoke-RestMethod http://localhost:8443/health
```

**Dashboard 回滚**:

```powershell
# Dashboard 是静态文件，只需重新构建旧版本并上传
# 或从 VPS 备份恢复
Copy-Item -Path C:\phonefarm-dashboard-backup\* -Destination C:\phonefarm-dashboard\ -Recurse -Force
```

---

## 九、日常运维速查

### 9.1 PM2 管理

```powershell
pm2 list                              # 进程列表
pm2 logs phonefarm-control --lines 50 # 实时日志
pm2 logs phonefarm-relay --lines 50
pm2 restart phonefarm-control         # 重启主控制端
pm2 restart phonefarm-relay           # 重启中继
pm2 reload ecosystem.config.cjs       # 零停机重载
pm2 stop all                          # 停止所有
pm2 save                              # 保存进程列表
pm2 resurrect                         # 恢复进程列表
```

### 9.2 数据库管理

```powershell
psql -U postgres -d phonefarm -c "\dt"                    # 列出所有表
psql -U postgres -d phonefarm -c "SELECT COUNT(*) FROM devices"  # 设备数
psql -U postgres -d phonefarm -c "SELECT * FROM devices LIMIT 5" # 设备列表
```

### 9.3 日志分析

```powershell
# PM2 日志
pm2 logs phonefarm-control --lines 100 --nostream | Select-String "ERROR"
pm2 logs phonefarm-relay --lines 100 --nostream | Select-String "disconnect"

# Caddy 日志
Get-Content C:\caddy\logs\phone.openedskill.com.log -Tail 50

# PostgreSQL 日志
Get-Content "C:\Program Files\PostgreSQL\18\data\log\postgresql-*.log" -Tail 50
```

### 9.4 常见故障处理

| 现象 | 检查 | 解决 |
|------|------|------|
| Dashboard 白屏 | 检查浏览器 Console | 确认 Caddy root 指向正确 dist 目录 |
| API 502/503 | `pm2 list` | `pm2 restart phonefarm-control` |
| 手机连不上 | `pm2 logs phonefarm-control` | 检查 DEVICE_AUTH_TOKEN 是否一致 |
| WebSocket 断开 | `pm2 logs phonefarm-relay` | 检查 Caddy 反向代理超时设置 |
| 数据库错误 | `psql -U postgres -d phonefarm -c "SELECT 1"` | 检查 PG 服务是否运行 |
| SSL 证书过期 | 浏览器访问查看证书 | Cloudflare → 重新生成 Origin CA 证书 → 替换 → `caddy reload` |

---

## 十、当前变更同步指南 (2026-05-13)

本次 UI/UX 专业化优化的变更范围及部署步骤：

### 变更清单

| 模块 | 文件数 | 主要变更 |
|------|--------|---------|
| Dashboard | ~50 文件 | 暗色主题、响应式布局、SystemControlPanel、KeyMapVisualizer、动画系统、SearchBar/FilterBar 统一 |
| Control Server | ~10 文件 | 配置管理 API、边缘决策引擎、持久化存储、activation store 重构 |
| Android Client | ~20 文件 | WebSocket 消息分发器、生产环境适配、网络韧性增强 |
| 数据库 | 3 新迁移 | `0002_edge_memory.sql`、`0002_persistent_stores.sql`、`0003_config_management.sql` |

### 首次同步步骤

```powershell
# === 本地 ===

# 1. 提交所有变更
cd e:\Program Files\www\phone
git add .
git commit -m "feat: Dashboard UI/UX 专业化 + 暗色主题 + 响应式 + 配置管理 + 边缘决策"

# 2. 推送到 GitHub
git push origin master

# 3. 构建 Dashboard
cd dashboard
npm run build

# 4. 上传 Dashboard
Compress-Archive -Path dist\* -DestinationPath "$env:TEMP\dashboard-dist.zip" -Force
scp "$env:TEMP\dashboard-dist.zip" Administrator@47.243.254.248:C:\phonefarm-dashboard-dist.zip

# === VPS ===

# 5. 拉取代码
ssh Administrator@47.243.254.248
cd D:\phone
git pull origin master

# 6. 安装依赖 + 迁移 + 重启
cd control-server
npm install
Get-ChildItem migrations/*.sql | Sort-Object Name | ForEach-Object { psql -U postgres -d phonefarm -f $_.FullName }
pm2 reload ecosystem.config.cjs

# 7. Dashboard 解压
Expand-Archive -Path C:\phonefarm-dashboard-dist.zip -DestinationPath C:\phonefarm-dashboard\ -Force

# 8. 验证
Invoke-RestMethod https://phone.openedskill.com/health
```

---

## 十一、安全注意事项

- **`.env` 文件绝不提交到 Git**（已在 `.gitignore` 中）
- **JWT_SECRET / DEVICE_AUTH_TOKEN / CONTROL_TOKEN** 在 VPS 和本地使用不同值
- **数据库密码** 生产环境避免使用默认 `123456`
- **Caddy SSL 证书** 私钥仅存储在 VPS，不进入 Git
- **PM2 `--no-daemon` 模式** 仅用于调试，生产使用 PM2 daemon
- **防火墙** 仅开放 80/443/8444(udp)，8443 和 8499 仅 localhost 访问
