# PhoneFarm — 打包 VPS 更新文件为 ZIP
# 在本地开发机运行此脚本，生成 update-package.zip
# 然后将 ZIP 解压到 VPS 的 D:\phonefarm-relay\ 并运行 vps-update.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)  # phone/
$StageDir = Join-Path $env:TEMP "phonefarm-vps-update"
$ZipPath = Join-Path $ScriptDir "vps-update-package.zip"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " PhoneFarm VPS — Package Update" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Clean staging
if (Test-Path $StageDir) { Remove-Item -Recurse -Force $StageDir }
New-Item -ItemType Directory -Force -Path $StageDir | Out-Null

# Source directories
$ControlSrc = Join-Path $RepoRoot "control-server\src"
$DeployVps = Join-Path $RepoRoot "deploy\vps-relay"

Write-Host "[1/3] Copying TypeScript source files..." -ForegroundColor Yellow

# Create directory structure
$dirs = @("src\relay", "src\ai-orchestrator", "src\transport", "src\decision", "src\assistant")
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Force -Path (Join-Path $StageDir $d) | Out-Null
}

# Core relay files
$coreFiles = @{
    "vps-relay.ts"                    = "src\vps-relay.ts"
    "relay\bridge-server.ts"          = "src\relay\bridge-server.ts"
    "relay\bridge-client.ts"          = "src\relay\bridge-client.ts"
    "ai-orchestrator\ai-bridge-router.ts" = "src\ai-orchestrator\ai-bridge-router.ts"
    "ai-orchestrator\types.ts"        = "src\ai-orchestrator\types.ts"
    "ai-orchestrator\ai-deepseek-worker.ts" = "src\ai-orchestrator\ai-deepseek-worker.ts"
}

foreach ($key in $coreFiles.Keys) {
    $src = Join-Path $ControlSrc $coreFiles[$key]
    $dst = Join-Path $StageDir $key
    if (Test-Path $src) {
        Copy-Item $src $dst -Force
        Write-Host "  Copied: $key" -ForegroundColor Gray
    } else {
        Write-Host "  WARN: $src not found" -ForegroundColor DarkYellow
    }
}

# Extra files with API fixes
$extraSrc = @(
    @{S="config.ts"; D="src\config.ts"},
    @{S="decision\deepseek-client.ts"; D="src\decision\deepseek-client.ts"},
    @{S="assistant\llm-proxy-routes.ts"; D="src\assistant\llm-proxy-routes.ts"}
)
foreach ($f in $extraSrc) {
    $src = Join-Path $ControlSrc $f.S
    $dst = Join-Path $StageDir $f.D
    if (Test-Path $src) {
        Copy-Item $src $dst -Force
        Write-Host "  Copied extra: $($f.S)" -ForegroundColor Gray
    }
}

Write-Host "[2/3] Copying config files..." -ForegroundColor Yellow

# package.json, tsconfig.json
$configSrc = Join-Path $RepoRoot "control-server"
foreach ($f in @("package.json", "tsconfig.json")) {
    $src = Join-Path $configSrc $f
    $dst = Join-Path $StageDir $f
    if (Test-Path $src) {
        Copy-Item $src $dst -Force
        Write-Host "  Copied: $f" -ForegroundColor Gray
    }
}

# Caddyfile
$caddySrc = Join-Path $DeployVps "Caddyfile"
if (Test-Path $caddySrc) {
    Copy-Item $caddySrc (Join-Path $StageDir "Caddyfile") -Force
    Write-Host "  Copied: Caddyfile" -ForegroundColor Gray
}

# .env.example (for reference only)
$envExample = Join-Path $DeployVps ".env.example"
if (Test-Path $envExample) {
    Copy-Item $envExample (Join-Path $StageDir ".env.example") -Force
    Write-Host "  Copied: .env.example" -ForegroundColor Gray
}

# vps-update.ps1
$updateScript = Join-Path $DeployVps "vps-update.ps1"
if (Test-Path $updateScript) {
    Copy-Item $updateScript $StageDir -Force
    Write-Host "  Copied: vps-update.ps1" -ForegroundColor Gray
}

Write-Host "[3/3] Creating ZIP..." -ForegroundColor Yellow
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

# Use .NET to create ZIP (more reliable)
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($StageDir, $ZipPath)

# Cleanup
Remove-Item -Recurse -Force $StageDir

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Package Created!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " ZIP: $ZipPath" -ForegroundColor White
$zipSize = (Get-Item $ZipPath).Length
Write-Host " Size: $([math]::Round($zipSize / 1KB, 1)) KB" -ForegroundColor White
Write-Host ""
Write-Host " === Next Steps ===" -ForegroundColor Yellow
Write-Host " 1. Copy vps-update-package.zip to VPS (47.243.254.248)" -ForegroundColor White
Write-Host " 2. On VPS, extract to D:\phonefarm-relay\" -ForegroundColor White
Write-Host " 3. Run: cd D:\phonefarm-relay; .\vps-update.ps1" -ForegroundColor White
Write-Host ""
Write-Host " === OR use scp (from local machine) ===" -ForegroundColor Yellow
Write-Host ' scp -i "E:\Program Files\www\phone\docs\vps-admin.key" vps-update-package.zip Administrator@47.243.254.248:D:\phonefarm-relay\' -ForegroundColor White
Write-Host ""
Write-Host " === Manual steps on VPS after copying ===" -ForegroundColor Yellow
Write-Host " cd D:\phonefarm-relay" -ForegroundColor White
Write-Host ' Expand-Archive -Force vps-update-package.zip .' -ForegroundColor White
Write-Host ' .\vps-update.ps1' -ForegroundColor White
Write-Host ""

# Open the folder
Start-Process "explorer.exe" -ArgumentList "/select,$ZipPath"
