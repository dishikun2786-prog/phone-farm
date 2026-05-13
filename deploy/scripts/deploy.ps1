# PhoneFarm 零停机一键部署脚本
# 用法: powershell -File deploy.ps1 [-SkipBuild] [-SkipMigration]
param(
    [switch]$SkipBuild = $false,
    [switch]$SkipMigration = $false
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ROOT

$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PhoneFarm Deploy  $timestamp" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

function Step($msg) {
    Write-Host "[$($MyInvocation.ScriptLineNumber)] $msg" -ForegroundColor Yellow
}

# 1. Git Update
Step "Pulling latest code..."
git pull origin master 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: git pull failed, continuing with local changes" -ForegroundColor Yellow
}

# 2. Backend dependencies
Step "Installing backend dependencies..."
Set-Location "$ROOT\control-server"
npm install --no-audit --no-fund 2>&1 | Select-Object -Last 3

# 3. Database migrations
if (-not $SkipMigration) {
    Step "Running database migrations..."
    Get-ChildItem "$ROOT\control-server\migrations\*.sql" -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object {
        Write-Host "  Running: $($_.Name)"
        $env:PGPASSWORD = "phonefarm"
        psql -U phonefarm -d phonefarm -h localhost -f $_.FullName 2>&1 | Out-Null
    }
}

# 4. TypeScript check
Step "TypeScript compilation check..."
Set-Location "$ROOT\control-server"
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: TypeScript compilation failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  TypeScript check passed." -ForegroundColor Green

# 5. Build dashboard
if (-not $SkipBuild) {
    Step "Building dashboard frontend..."
    Set-Location "$ROOT\dashboard"
    npm run build 2>&1 | Select-Object -Last 5
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Dashboard build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Dashboard built to dist/." -ForegroundColor Green
}

# 6. Zero-downtime restart
Step "Reloading services (zero-downtime)..."
Set-Location "$ROOT\control-server"
pm2 reload ecosystem.config.cjs 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: pm2 reload failed, trying restart..." -ForegroundColor Yellow
    pm2 restart phonefarm-control phonefarm-relay
}

# 7. Health check
Step "Health check..."
Start-Sleep 3
$health = try {
    Invoke-RestMethod -Uri "http://localhost:8443/api/v1/health" -TimeoutSec 10
} catch {
    $null
}

if ($health -and $health.status -eq 'ok') {
    Write-Host "  Health check: OK (uptime=$([math]::Round($health.uptime/60,1))m, devices=$($health.devicesOnline))" -ForegroundColor Green
} else {
    Write-Host "  Health check: FAILED" -ForegroundColor Red
    pm2 status
    exit 1
}

# 8. PM2 status
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Deploy Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
pm2 status
Write-Host ""
Write-Host "Frontend: https://phone.openedskill.com" -ForegroundColor Cyan
Write-Host "Health:   https://phone.openedskill.com/api/v1/health" -ForegroundColor Cyan
