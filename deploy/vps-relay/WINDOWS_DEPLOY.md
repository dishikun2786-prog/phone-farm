# VPS 中继服务器 — Windows 自动化部署指南

> 目标 AI：在 Windows VPS 上阅读本文档，按顺序执行即可完成全自动部署。

## 架构

```
手机设备 → :80/ws/phone ─┐
本地控制端 → :80/ws/control ─┼→ BridgeServer (:8499) → 消息互转
Dashboard → :80/ws/frontend ─┘   UDP :8444 → A/V 帧中转
```

中继仅需 `BridgeServer + UDP Relay`，不需要 PostgreSQL/Redis。

## 端口清单

| 端口 | 协议 | 公网开放 | 用途 |
|------|------|---------|------|
| 80 | TCP | 是 | HTTP + WebSocket 入口 |
| 443 | TCP | 是 | HTTPS + WSS (生产) |
| 8499 | TCP | 否 (127.0.0.1) | BridgeServer 内部端口 |
| 8444 | UDP | 是 | 音视频帧中继 |

---

## Step 1 — 安装 Node.js 22

```powershell
# 检测是否已安装
node --version 2>$null
# 如果版本 < 22 或不存在，执行:
winget install OpenJS.NodeJS.LTS --version 22.15.0
# 或 nvm-windows:
winget install CoreyButler.NVMforWindows
# 重启终端后: nvm install 22 && nvm use 22
```

---

## Step 2 — 准备项目文件

在 VPS 上创建部署目录并拷贝必要源文件:

```powershell
$DeployDir = "D:\phonefarm-relay"
mkdir -p $DeployDir\src\relay
mkdir -p $DeployDir\src\transport
```

**需要拷贝的文件清单**（从开发机或 git clone 获取）:

```
control-server/
  package.json
  package-lock.json
  tsconfig.json
  src/
    vps-relay.ts          ← 入口
    relay/bridge-server.ts ← BridgeServer 核心
    transport/udp-relay.ts ← UDP 中继
```

```powershell
# 方式一: git clone (如果仓库已公开)
cd D:\
git clone <repo-url> phonefarm-code
cd phonefarm-code\control-server

# 方式二: 手动拷贝后 cd 到部署目录
cd D:\phonefarm-relay
```

---

## Step 3 — 安装 npm 依赖

```powershell
npm install
```

核心依赖 (自动安装):
- `fastify` + `@fastify/websocket` + `@fastify/cors` — HTTP/WS 框架
- `dotenv` — 环境变量
- `tsx` — TypeScript 运行时
- `jsonwebtoken` — 前端 JWT 验证

---

## Step 4 — 配置 .env

```powershell
# 生成随机 token
$ControlToken = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
$DeviceToken = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
$JwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })

@"
RELAY_PORT=8499
RELAY_HOST=0.0.0.0
CONTROL_TOKEN=$ControlToken
DEVICE_AUTH_TOKEN=$DeviceToken
JWT_SECRET=$JwtSecret
UDP_RELAY_PORT=8444
"@ | Out-File -Encoding UTF8 .env

Write-Host "=== 生成的 Token (请保存到安全位置) ==="
Write-Host "CONTROL_TOKEN: $ControlToken"
Write-Host "DEVICE_AUTH_TOKEN: $DeviceToken"
Write-Host "JWT_SECRET: $JwtSecret"
```

---

## Step 5 — 启动 Relay (测试模式)

```powershell
npx tsx src/vps-relay.ts
```

**预期输出**:
```
[VpsRelay] Listening on http://0.0.0.0:8499
[VpsRelay] WebSocket: ws://0.0.0.0:8499/ws/phone
[VpsRelay] UDP relay: :8444/udp
[BridgeServer] UDP relay listening on :8444
```

**验证** (新终端):
```powershell
curl http://127.0.0.1:8499/api/v1/relay/health
# → {"status":"ok","uptime":...}

curl http://127.0.0.1:8499/api/v1/relay/stats
# → {"controlConnected":false,"activePhones":0,"activeFrontends":0,"startedAt":"..."}
```

---

## Step 6 — 安装 Nginx (Windows)

```powershell
# 下载
$NginxVersion = "1.26.3"
Invoke-WebRequest -Uri "https://nginx.org/download/nginx-$NginxVersion.zip" -OutFile "$env:TEMP\nginx.zip"
Expand-Archive "$env:TEMP\nginx.zip" -DestinationPath "C:\" -Force

# 写入 nginx.conf
@'
events {
    worker_connections 1024;
}

http {
    include mime.types;
    default_type application/octet-stream;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    access_log logs/access.log;
    error_log logs/error.log;

    server {
        listen 80;
        server_name _;

        location /api/ {
            proxy_pass http://127.0.0.1:8499;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /ws/phone {
            proxy_pass http://127.0.0.1:8499;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_read_timeout 86400;
        }

        location /ws/frontend {
            proxy_pass http://127.0.0.1:8499;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_read_timeout 86400;
        }

        location /ws/control {
            proxy_pass http://127.0.0.1:8499;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_read_timeout 86400;
        }

        location /health {
            proxy_pass http://127.0.0.1:8499/api/v1/relay/health;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
        }
    }
}
'@ | Out-File -Encoding UTF8 "C:\nginx-$NginxVersion\conf\nginx.conf"

# 启动
cd "C:\nginx-$NginxVersion"
.\nginx.exe
```

---

## Step 7 — SSL 证书 (生产必须)

**有域名 (推荐)**:
```powershell
# 用 Let's Encrypt / certbot 获取免费证书
# Windows 版 certbot: https://certbot.eff.org/instructions?ws=nginx&os=windows
```

**无域名 (测试用自签名)**:
```powershell
# 需要先安装 OpenSSL
winget install OpenSSL.OpenSSL

mkdir "C:\nginx-$NginxVersion\ssl"
openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
  -keyout "C:\nginx-$NginxVersion\ssl\privkey.pem" `
  -out "C:\nginx-$NginxVersion\ssl\fullchain.pem" `
  -subj "/CN=VPS-PUBLIC-IP-OR-DOMAIN"
```

然后在 nginx.conf 中添加 443 server 块 (参考 `deploy/vps-relay/nginx.conf`)。

---

## Step 8 — Windows 防火墙

```powershell
# 以管理员身份运行
New-NetFirewallRule -DisplayName "PhoneFarm-HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "PhoneFarm-HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName "PhoneFarm-UDP-Relay" -Direction Inbound -Protocol UDP -LocalPort 8444 -Action Allow
```

**注意**: 如果 VPS 有云防火墙 (阿里云/腾讯云/Azure 安全组)，也需要在云控制台放行 80、443、8444/udp。

---

## Step 9 — 注册 Windows 服务 (开机自启)

**推荐方案 — PM2**:
```powershell
npm install -g pm2
pm2 start npx --name "phonefarm-relay" -- tsx src/vps-relay.ts
pm2 save

# 开机自启
pm2 startup
# 按提示复制并执行输出的 PowerShell 命令
```

**备用方案 — WinSW**:
```powershell
$DeployDir = "D:\phonefarm-relay"
Invoke-WebRequest -Uri "https://github.com/winsw/winsw/releases/download/v3.0.0/WinSW-x64.exe" -OutFile "$DeployDir\phonefarm-relay-service.exe"

@"
<service>
  <id>PhoneFarmRelay</id>
  <name>PhoneFarm Relay Server</name>
  <description>PhoneFarm VPS relay (WebSocket + UDP)</description>
  <workingdirectory>$DeployDir</workingdirectory>
  <executable>npx</executable>
  <arguments>tsx src/vps-relay.ts</arguments>
  <log mode="rotate" />
  <onfailure action="restart" delay="10 sec" />
  <delayedAutoStart>true</delayedAutoStart>
</service>
"@ | Out-File -Encoding UTF8 "$DeployDir\phonefarm-relay-service.xml"

& "$DeployDir\phonefarm-relay-service.exe" install
& "$DeployDir\phonefarm-relay-service.exe" start
```

---

## Step 10 — 端到端验证

```powershell
# 1. 健康检查
curl http://localhost/health
# → {"status":"ok","uptime":...}

# 2. 测试 WebSocket
npm install -g wscat
wscat -c ws://localhost/ws/phone
# 输入: {"type":"auth","token":"<DEVICE_AUTH_TOKEN>","device_id":"test-001"}
# 预期收到设备确认

# 3. 检查端口
netstat -ano | Select-String "8499|8444|:80 "

# 4. PM2 状态
pm2 status
```

---

## 配套配置 (其他组件)

### 本地控制端 `.env`
```env
BRIDGE_RELAY_URL=ws://<VPS-公网IP>:80/ws/control
BRIDGE_CONTROL_TOKEN=<与 VPS CONTROL_TOKEN 一致>
```

### 手机 APK WebSocket URL
```
wss://<VPS-域名>/ws/phone    (TLS 生产)
ws://<VPS-公网IP>:80/ws/phone    (测试)
```

---

## Step 11 — AI 协同部署 (Claude Code ↔ DeepSeek)

### 11a — 配置 AI_AUTH_TOKEN

在 `.env` 中添加：
```powershell
$AiToken = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
"AI_AUTH_TOKEN=$AiToken" | Add-Content .env
Write-Host "AI_AUTH_TOKEN: $AiToken"
```

重启 relay：
```powershell
pm2 restart phonefarm-relay
```

### 11b — 获取 DeepSeek API Key

1. 注册 https://platform.deepseek.com
2. 创建 API Key：https://platform.deepseek.com/api_keys
3. 充值 (最低 10 元)

### 11c — 启动 DeepSeek Worker

```powershell
$env:DEEPSEEK_API_KEY = "sk-your-api-key"
$env:DEEPSEEK_MODEL = "deepseek-chat"
$env:AI_AUTH_TOKEN = "<上面生成的 AI_AUTH_TOKEN>"
$env:AI_BRIDGE_URL = "ws://127.0.0.1:8499/ws/ai/worker"
$env:WORKER_WORKING_DIR = "D:\phonefarm-relay"
$env:WORKER_LABEL = "DeepSeek VPS Agent"

npx tsx src/ai-orchestrator/ai-deepseek-worker.ts
```

**通过 PM2 常驻**：
```powershell
pm2 start npx --name "phonefarm-deepseek" -- tsx src/ai-orchestrator/ai-deepseek-worker.ts
pm2 save
```

### 11d — 本地 Claude Code 测试连接

```powershell
# 在本地开发机执行
cd <phonefarm-repo>\control-server

npx tsx src/ai-orchestrator/ai-claude-cli.ts status `
  --bridge-url "ws://<VPS-公网IP>:80/ws/ai/control" `
  --token "<AI_AUTH_TOKEN>"
```

### 11e — Claude Code 委托任务执行

Claude Code 通过 Bash 工具调用 `ai-claude-cli.ts`：

```bash
# 简单命令
npx tsx src/ai-orchestrator/ai-claude-cli.ts exec "npm install" \
  --bridge-url "ws://VPS_IP:80/ws/ai/control" --token "$TOKEN"

# 智能分析
npx tsx src/ai-orchestrator/ai-claude-cli.ts analyze \
  "安装并配置 nginx" \
  --bridge-url "ws://VPS_IP:80/ws/ai/control" --token "$TOKEN"

# 写入文件
npx tsx src/ai-orchestrator/ai-claude-cli.ts write "config.json" \
  --content '{"port":8080}' \
  --bridge-url "ws://VPS_IP:80/ws/ai/control" --token "$TOKEN"
```

详细文档见 [AI_ORCHESTRATOR.md](AI_ORCHESTRATOR.md)。

---

## 故障排查

| 现象 | 检查命令 | 解决 |
|------|---------|------|
| relay 启动失败 | `netstat -ano \| Select-String "8499"` | 端口被占，kill 旧进程 |
| Nginx 启动失败 | `C:\nginx-1.26.3\nginx.exe -t` | 检查配置语法 |
| Nginx 502 | `curl http://127.0.0.1:8499/api/v1/relay/health` | relay 未运行 |
| 外网不通 | `Test-NetConnection <VPS-IP> -Port 80` | 检查云防火墙/安全组 |
| UDP 不通 | `Test-NetConnection <VPS-IP> -Port 8444` | 云防火墙需单独放行 UDP |
| PM2 未自启 | `pm2 startup` | 重新执行输出的命令 |
| Worker 连不上 | `curl http://127.0.0.1:8499/api/v1/ai/stats` | 检查 AI_AUTH_TOKEN |
| DeepSeek 无响应 | Worker 日志 | 设置 DEEPSEEK_API_KEY |
