# PhoneFarm VPS 中继服务器 — 一键自动化部署脚本
# 用法: powershell -ExecutionPolicy Bypass -File deploy-relay.ps1
param(
    [string]$DeployDir = "D:\phonefarm-relay",
    [string]$NginxDir = "C:\nginx-1.26.3",
    [switch]$SkipFirewall = $false,
    [switch]$SkipService = $false
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " PhoneFarm VPS Relay — Auto Deploy" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# Step 1 — Check Node.js
# ============================================================
Write-Host "[1/8] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVer = node --version 2>$null
    if (-not $nodeVer) { throw "Node.js not found" }
    Write-Host "  Node.js $nodeVer OK" -ForegroundColor Green
} catch {
    Write-Host "  Installing Node.js 22 via winget..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS --version 22.15.0 --accept-package-agreements --accept-source-agreements
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    node --version
    Write-Host "  Node.js installed OK" -ForegroundColor Green
}

# ============================================================
# Step 2 — Create deploy directory & copy source files
# ============================================================
Write-Host "[2/8] Preparing deploy directory..." -ForegroundColor Yellow
$SourceDir = Split-Path -Parent $PSScriptRoot

mkdir -p $DeployDir\src\relay
mkdir -p $DeployDir\src\transport
mkdir -p $DeployDir\src\ai-orchestrator

# Copy only the files needed for relay
$filesToCopy = @(
    "package.json",
    "package-lock.json",
    "tsconfig.json"
)
foreach ($f in $filesToCopy) {
    $src = Join-Path $SourceDir "..\..\control-server\$f"
    if (Test-Path $src) {
        Copy-Item $src "$DeployDir\$f" -Force
        Write-Host "  Copied $f" -ForegroundColor Gray
    } else {
        Write-Host "  WARN: $src not found, skipping" -ForegroundColor DarkYellow
    }
}

# Copy TypeScript source (bridge-server depends on ai-orchestrator)
$tsFiles = @(
    "vps-relay.ts",
    "relay\bridge-server.ts",
    "transport\udp-relay.ts",
    "ai-orchestrator\ai-bridge-router.ts",
    "ai-orchestrator\types.ts",
    "ai-orchestrator\ai-deepseek-worker.ts"
)
foreach ($f in $tsFiles) {
    $src = Join-Path $SourceDir "..\..\control-server\src\$f"
    if (Test-Path $src) {
        Copy-Item $src "$DeployDir\src\$f" -Force
        Write-Host "  Copied src/$f" -ForegroundColor Gray
    } else {
        Write-Host "  WARN: src/$f not found, skipping" -ForegroundColor DarkYellow
    }
}

# ============================================================
# Step 3 — Install npm dependencies
# ============================================================
Write-Host "[3/8] Installing npm dependencies..." -ForegroundColor Yellow
Set-Location $DeployDir
npm install
Write-Host "  npm install OK" -ForegroundColor Green

# ============================================================
# Step 4 — Generate .env
# ============================================================
Write-Host "[4/9] Generating .env..." -ForegroundColor Yellow
$ControlToken = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
$DeviceToken = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
$JwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
$AiAuthToken = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })

@"
RELAY_PORT=8499
RELAY_HOST=0.0.0.0
CONTROL_TOKEN=$ControlToken
DEVICE_AUTH_TOKEN=$DeviceToken
JWT_SECRET=$JwtSecret
UDP_RELAY_PORT=8444
AI_AUTH_TOKEN=$AiAuthToken
"@ | Out-File -Encoding UTF8 "$DeployDir\.env"

Write-Host "  .env generated OK" -ForegroundColor Green
Write-Host ""
Write-Host "  ========== SAVE THESE TOKENS ==========" -ForegroundColor Magenta
Write-Host "  CONTROL_TOKEN:     $ControlToken" -ForegroundColor White
Write-Host "  DEVICE_AUTH_TOKEN: $DeviceToken" -ForegroundColor White
Write-Host "  JWT_SECRET:        $JwtSecret" -ForegroundColor White
Write-Host "  AI_AUTH_TOKEN:     $AiAuthToken" -ForegroundColor White
Write-Host "  ========================================" -ForegroundColor Magenta
Write-Host ""

# ============================================================
# Step 5 — Test start relay
# ============================================================
Write-Host "[5/9] Testing relay server startup..." -ForegroundColor Yellow
$relayJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    npx tsx src/vps-relay.ts 2>&1
} -ArgumentList $DeployDir

Start-Sleep -Seconds 5
$relayRunning = $true
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8499/api/v1/relay/health" -TimeoutSec 3
    Write-Host "  Health check: $($health | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Health check failed: $_" -ForegroundColor DarkYellow
    $relayRunning = $false
}

# Stop test instance
Stop-Job $relayJob -ErrorAction SilentlyContinue
Remove-Job $relayJob -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# ============================================================
# Step 6 — Install & configure Nginx
# ============================================================
Write-Host "[6/9] Setting up Nginx..." -ForegroundColor Yellow
$NginxVersion = "1.26.3"

if (-not (Test-Path $NginxDir)) {
    Write-Host "  Downloading nginx $NginxVersion..." -ForegroundColor Gray
    $nginxZip = "$env:TEMP\nginx-$NginxVersion.zip"
    Invoke-WebRequest -Uri "https://nginx.org/download/nginx-$NginxVersion.zip" -OutFile $nginxZip
    Expand-Archive $nginxZip -DestinationPath "C:\" -Force
    Remove-Item $nginxZip
}

Write-Host "  Writing nginx.conf..." -ForegroundColor Gray
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

        location /ws/device {
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

        location /ws/ai/worker {
            proxy_pass http://127.0.0.1:8499;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_read_timeout 86400;
        }

        location /ws/ai/control {
            proxy_pass http://127.0.0.1:8499;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_read_timeout 86400;
        }

        location /api/v1/ai/ {
            proxy_pass http://127.0.0.1:8499;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
        }

        location /health {
            proxy_pass http://127.0.0.1:8499/api/v1/relay/health;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
        }
    }
}
'@ | Out-File -Encoding UTF8 "$NginxDir\conf\nginx.conf"

# Start/reload Nginx
$nginxRunning = Get-Process -Name "nginx" -ErrorAction SilentlyContinue
if ($nginxRunning) {
    & "$NginxDir\nginx.exe" -s reload
    Write-Host "  Nginx reloaded OK" -ForegroundColor Green
} else {
    & "$NginxDir\nginx.exe"
    Write-Host "  Nginx started OK" -ForegroundColor Green
}

# ============================================================
# Step 7 — Firewall
# ============================================================
if (-not $SkipFirewall) {
    Write-Host "[7/9] Configuring Windows Firewall..." -ForegroundColor Yellow
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
    if (-not $isAdmin) {
        Write-Host "  WARN: Not running as Administrator, skipping firewall rules" -ForegroundColor DarkYellow
        Write-Host "  Run these manually as Admin:" -ForegroundColor DarkYellow
        Write-Host "    New-NetFirewallRule -DisplayName 'PhoneFarm-HTTP' -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow"
        Write-Host "    New-NetFirewallRule -DisplayName 'PhoneFarm-HTTPS' -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow"
        Write-Host "    New-NetFirewallRule -DisplayName 'PhoneFarm-UDP-Relay' -Direction Inbound -Protocol UDP -LocalPort 8444 -Action Allow"
    } else {
        New-NetFirewallRule -DisplayName "PhoneFarm-HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -ErrorAction SilentlyContinue
        New-NetFirewallRule -DisplayName "PhoneFarm-HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -ErrorAction SilentlyContinue
        New-NetFirewallRule -DisplayName "PhoneFarm-UDP-Relay" -Direction Inbound -Protocol UDP -LocalPort 8444 -Action Allow -ErrorAction SilentlyContinue
        Write-Host "  Firewall rules added OK" -ForegroundColor Green
    }
}

# ============================================================
# Step 8 — Register as Windows Service
# ============================================================
if (-not $SkipService) {
    Write-Host "[8/9] Registering Windows Service..." -ForegroundColor Yellow

    # Try PM2 first
    $pm2Installed = Get-Command pm2 -ErrorAction SilentlyContinue
    if ($pm2Installed) {
        Set-Location $DeployDir
        pm2 delete phonefarm-relay 2>$null
        pm2 start npx --name "phonefarm-relay" -- tsx src/vps-relay.ts
        pm2 save
        Write-Host "  PM2 service registered OK" -ForegroundColor Green
        Write-Host "  Run 'pm2 startup' and follow instructions for auto-start on boot" -ForegroundColor Yellow
    } else {
        Write-Host "  PM2 not installed. Installing..." -ForegroundColor Gray
        npm install -g pm2
        Set-Location $DeployDir
        pm2 start npx --name "phonefarm-relay" -- tsx src/vps-relay.ts
        pm2 save
        Write-Host "  PM2 service registered OK" -ForegroundColor Green
        Write-Host ""
        Write-Host "  ========== IMPORTANT ==========" -ForegroundColor Magenta
        Write-Host "  Run this command for boot auto-start:" -ForegroundColor White
        Write-Host "    pm2 startup" -ForegroundColor Cyan
        Write-Host "  Then copy & run the PowerShell command it outputs" -ForegroundColor White
        Write-Host "  ===============================" -ForegroundColor Magenta
    }
}

# ============================================================
# Step 9 — AI Orchestrator (optional: DeepSeek Worker)
# ============================================================
Write-Host "[9/9] AI Orchestrator setup..." -ForegroundColor Yellow
Write-Host "  DeepSeek API key is required for AI reasoning features."
Write-Host "  Get one at: https://platform.deepseek.com/api_keys"
$setupAi = Read-Host "  Enter DeepSeek API key (or press Enter to skip)"
if ($setupAi -and $setupAi.Trim() -ne "") {
    pm2 start npx --name "phonefarm-deepseek" -- tsx src/ai-orchestrator/ai-deepseek-worker.ts
    pm2 save
    Write-Host "  DeepSeek Worker started via PM2" -ForegroundColor Green
    Write-Host "  Edit PM2 env vars: pm2 env phonefarm-deepseek" -ForegroundColor Yellow
} else {
    Write-Host "  Skipped. Start manually later: npx tsx src/ai-orchestrator/ai-deepseek-worker.ts" -ForegroundColor Gray
}

# ============================================================
# Done
# ============================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " Health check:  http://localhost/health" -ForegroundColor White
Write-Host " Relay stats:   http://localhost/api/v1/relay/stats" -ForegroundColor White
Write-Host " AI stats:      http://localhost/api/v1/ai/stats" -ForegroundColor White
Write-Host " PM2 status:    pm2 status" -ForegroundColor White
Write-Host ""
Write-Host " === Local control server .env ===" -ForegroundColor Yellow
Write-Host " BRIDGE_RELAY_URL=ws://<VPS-PUBLIC-IP>:80/ws/control" -ForegroundColor White
Write-Host " BRIDGE_CONTROL_TOKEN=$ControlToken" -ForegroundColor White
Write-Host ""
Write-Host " === Claude Code AI Bridge ===" -ForegroundColor Yellow
Write-Host " npx tsx ai-claude-cli.ts status --bridge-url ws://<VPS-IP>:80/ws/ai/control --token $AiAuthToken" -ForegroundColor White
Write-Host ""
Write-Host " === Phone APK WebSocket URL ===" -ForegroundColor Yellow
Write-Host " ws://<VPS-PUBLIC-IP>:80/ws/phone" -ForegroundColor White
