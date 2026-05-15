# PhoneFarm VPS Relay — 一键更新脚本
# 在 VPS 上运行: powershell -ExecutionPolicy Bypass -File vps-update.ps1
#
# 此脚本会:
#   1. 停止 PM2 进程
#   2. 从当前目录复制最新源文件到 D:\phonefarm-relay
#   3. 更新 .env (保留现有 tokens)
#   4. npm install (如有新依赖)
#   5. 重启 PM2 进程
#   6. 重载 Caddy
#
# 使用方式:
#   1. 将整个 deploy/vps-relay/ 文件夹复制到 VPS
#   2. 在 VPS 上运行: cd <this-folder>; .\vps-update.ps1

$ErrorActionPreference = "Stop"
$DeployDir = "D:\phonefarm-relay"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " PhoneFarm VPS Relay — Update" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Source directory (where this script is)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceRoot = Split-Path -Parent $ScriptDir  # deploy/
$ControlServerSrc = Join-Path $SourceRoot "control-server\src"

# ============================================================
# Step 1 — Stop PM2
# ============================================================
Write-Host "[1/6] Stopping PM2 processes..." -ForegroundColor Yellow
$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2) {
    pm2 stop phonefarm-relay 2>$null
    pm2 stop phonefarm-deepseek 2>$null
    Write-Host "  Processes stopped" -ForegroundColor Green
} else {
    Write-Host "  PM2 not found, skipping" -ForegroundColor DarkYellow
}

# ============================================================
# Step 2 — Copy source files
# ============================================================
Write-Host "[2/6] Copying updated source files..." -ForegroundColor Yellow

# Determine source: prefer local folder structure, fallback to deploy/vps-relay
if (Test-Path (Join-Path $ScriptDir "vps-relay.ts")) {
    $SrcBase = $ScriptDir
    Write-Host "  Using local source files from deploy/vps-relay/" -ForegroundColor Gray
} elseif (Test-Path (Join-Path $ControlServerSrc "vps-relay.ts")) {
    Write-Host "  Using source files from control-server/src/" -ForegroundColor Gray
    # Copy from control-server/src/ to deploy dir
    $files = @{
        "vps-relay.ts"                    = "src\vps-relay.ts"
        "relay\bridge-server.ts"          = "src\relay\bridge-server.ts"
        "relay\bridge-client.ts"          = "src\relay\bridge-client.ts"
        "ai-orchestrator\ai-bridge-router.ts" = "src\ai-orchestrator\ai-bridge-router.ts"
        "ai-orchestrator\types.ts"        = "src\ai-orchestrator\types.ts"
        "ai-orchestrator\ai-deepseek-worker.ts" = "src\ai-orchestrator\ai-deepseek-worker.ts"
    }
    foreach ($key in $files.Keys) {
        $src = Join-Path $ControlServerSrc $files[$key]
        $dst = Join-Path $DeployDir $key
        if (Test-Path $src) {
            $dstDir = Split-Path -Parent $dst
            if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }
            Copy-Item $src $dst -Force
            Write-Host "  Copied: $key" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: $src not found" -ForegroundColor DarkYellow
        }
    }
} else {
    Write-Host "  ERROR: No source files found!" -ForegroundColor Red
    Write-Host "  Please copy all .ts files into this folder first." -ForegroundColor Red
    exit 1
}

# Also copy config.ts and deepseek-client.ts (they have API fixes)
$extraFiles = @(
    @{Src="config.ts"; Dst="src\config.ts"},
    @{Src="decision\deepseek-client.ts"; Dst="src\decision\deepseek-client.ts"},
    @{Src="assistant\llm-proxy-routes.ts"; Dst="src\assistant\llm-proxy-routes.ts"}
)
foreach ($f in $extraFiles) {
    $src = Join-Path $ControlServerSrc $f.Src
    $dst = Join-Path $DeployDir $f.Dst
    if (Test-Path $src) {
        $dstDir = Split-Path -Parent $dst
        if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }
        Copy-Item $src $dst -Force
        Write-Host "  Copied extra: $($f.Src)" -ForegroundColor Gray
    }
}

# Copy package.json and tsconfig.json
$configFiles = @("package.json", "package-lock.json", "tsconfig.json")
foreach ($f in $configFiles) {
    $src = Join-Path $SourceRoot "control-server\$f"
    $dst = Join-Path $DeployDir $f
    if (Test-Path $src) {
        Copy-Item $src $dst -Force
        Write-Host "  Copied: $f" -ForegroundColor Gray
    }
}

# ============================================================
# Step 3 — Update/Create .env
# ============================================================
Write-Host "[3/6] Checking .env..." -ForegroundColor Yellow
$envPath = Join-Path $DeployDir ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "  WARN: .env not found, creating from .env.example" -ForegroundColor DarkYellow
    $examplePath = Join-Path $ScriptDir ".env.example"
    if (Test-Path $examplePath) {
        Copy-Item $examplePath $envPath
        Write-Host "  Created .env from .env.example — PLEASE EDIT TOKENS!" -ForegroundColor Red
    }
} else {
    # Ensure CONTROL_API_URL is set
    $envContent = Get-Content $envPath -Raw
    if ($envContent -notmatch "CONTROL_API_URL") {
        Add-Content $envPath "`n# 控制服务器 API 地址`nCONTROL_API_URL=http://127.0.0.1:8443`n"
        Write-Host "  Added CONTROL_API_URL to .env" -ForegroundColor Green
    }
    if ($envContent -notmatch "AI_AUTH_TOKEN") {
        $randomToken = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
        Add-Content $envPath "`n# AI 协同认证 token`nAI_AUTH_TOKEN=$randomToken`n"
        Write-Host "  Added AI_AUTH_TOKEN to .env" -ForegroundColor Green
    }
    Write-Host "  .env OK" -ForegroundColor Green
}

# ============================================================
# Step 4 — npm install
# ============================================================
Write-Host "[4/6] npm install..." -ForegroundColor Yellow
Set-Location $DeployDir
npm install
Write-Host "  npm install OK" -ForegroundColor Green

# ============================================================
# Step 5 — Restart PM2
# ============================================================
Write-Host "[5/6] Restarting PM2 processes..." -ForegroundColor Yellow
if ($pm2) {
    Set-Location $DeployDir

    # Update PM2 process definition
    pm2 delete phonefarm-relay 2>$null
    pm2 start npx --name "phonefarm-relay" -- tsx src/vps-relay.ts
    pm2 save
    Write-Host "  phonefarm-relay started" -ForegroundColor Green

    # DeepSeek worker (optional)
    $envContent = Get-Content $envPath -Raw
    if ($envContent -match "DEEPSEEK_API_KEY=sk-") {
        pm2 delete phonefarm-deepseek 2>$null
        pm2 start npx --name "phonefarm-deepseek" -- tsx src/ai-orchestrator/ai-deepseek-worker.ts
        pm2 save
        Write-Host "  phonefarm-deepseek started" -ForegroundColor Green
    } else {
        Write-Host "  DeepSeek worker skipped (no API key)" -ForegroundColor DarkYellow
    }
} else {
    Write-Host "  PM2 not found, installing..." -ForegroundColor Gray
    npm install -g pm2
    Set-Location $DeployDir
    pm2 start npx --name "phonefarm-relay" -- tsx src/vps-relay.ts
    pm2 save
    Write-Host "  phonefarm-relay started" -ForegroundColor Green
}

# ============================================================
# Step 6 — Reload Caddy / Nginx
# ============================================================
Write-Host "[6/6] Reloading reverse proxy..." -ForegroundColor Yellow

# Try Caddy first
$caddy = Get-Command caddy -ErrorAction SilentlyContinue
if ($caddy) {
    caddy reload --config C:\www\phone\Caddyfile 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Caddy reloaded OK" -ForegroundColor Green
    } else {
        # Try the Caddy API
        try {
            Invoke-RestMethod -Uri "http://127.0.0.1:2019/load" -Method Post -Body (Get-Content C:\www\phone\Caddyfile -Raw) -ContentType "text/caddyfile"
            Write-Host "  Caddy reloaded via API OK" -ForegroundColor Green
        } catch {
            Write-Host "  WARN: Caddy reload failed: $_" -ForegroundColor DarkYellow
        }
    }
}

# Try Nginx
$nginx = Get-Process -Name "nginx" -ErrorAction SilentlyContinue
if ($nginx) {
    $nginxDir = "C:\nginx-1.26.3"
    if (Test-Path "$nginxDir\nginx.exe") {
        & "$nginxDir\nginx.exe" -s reload
        Write-Host "  Nginx reloaded OK" -ForegroundColor Green
    }
}

# ============================================================
# Verify
# ============================================================
Write-Host ""
Write-Host "[Verify] Running health checks..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8499/api/v1/relay/health" -TimeoutSec 5
    Write-Host "  Relay health: OK" -ForegroundColor Green
} catch {
    Write-Host "  Relay health: FAILED — $_" -ForegroundColor Red
}

try {
    $stats = Invoke-RestMethod -Uri "http://127.0.0.1:8499/api/v1/relay/stats" -TimeoutSec 5
    Write-Host "  Relay stats:  $($stats | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "  Relay stats: FAILED" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Update Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " PM2 status:  pm2 status" -ForegroundColor White
Write-Host " PM2 logs:    pm2 logs phonefarm-relay --lines 50" -ForegroundColor White
Write-Host ""
