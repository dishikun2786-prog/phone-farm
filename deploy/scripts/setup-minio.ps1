# PowerShell: Deploy MinIO Object Storage on Windows
# Provides S3-compatible storage for screenshots, models, logs, and checkpoints

param(
  [string]$MinioVersion = "2025-04-15T19-15-43Z",
  [string]$InstallDir = "C:\phonefarm\minio",
  [string]$DataDir = "C:\phonefarm\minio\data",
  [string]$AccessKey = $env:MINIO_ROOT_USER,
  [string]$SecretKey = $env:MINIO_ROOT_PASSWORD,
  [int]$ConsolePort = 9001,
  [int]$ApiPort = 9000,
  [switch]$SkipDownload = $false,
  [switch]$InstallAsService = $true
)

$ErrorActionPreference = "Stop"

Write-Host "=== PhoneFarm MinIO Object Storage Setup ===" -ForegroundColor Cyan

# 1. Create directories
Write-Host "[1/5] Creating directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

# 2. Generate credentials if not provided
if (-not $AccessKey) {
  $AccessKey = "minioadmin"
}
if (-not $SecretKey) {
  $SecretKey = "minioadmin-" + (-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ }))
  Write-Host "  Generated random secret key" -ForegroundColor Yellow
}

# 3. Download MinIO
if (-not $SkipDownload) {
  Write-Host "[2/5] Downloading MinIO Server..." -ForegroundColor Yellow
  $MinioUrl = "https://dl.min.io/server/minio/release/windows-amd64/minio.exe"

  try {
    Invoke-WebRequest -Uri $MinioUrl -OutFile "$InstallDir\minio.exe" -UseBasicParsing
    Write-Host "  MinIO downloaded to $InstallDir\minio.exe" -ForegroundColor Green
  } catch {
    Write-Host "  Download failed: $($_.Exception.Message)" -ForegroundColor Red
    if (-not (Test-Path "$InstallDir\minio.exe")) {
      throw "MinIO binary not found. Set -SkipDownload if already installed."
    }
  }
}

# 4. Test run
Write-Host "[3/5] Testing MinIO server..." -ForegroundColor Yellow

$env:MINIO_ROOT_USER = $AccessKey
$env:MINIO_ROOT_PASSWORD = $SecretKey

$TestProcess = Start-Process -FilePath "$InstallDir\minio.exe" `
  -ArgumentList "server", $DataDir, "--console-address", ":`:$ConsolePort", "--address", ":`:$ApiPort" `
  -NoNewWindow -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 5

if ($TestProcess.HasExited) {
  Write-Host "  MinIO failed to start!" -ForegroundColor Red
} else {
  Write-Host "  MinIO started (PID: $($TestProcess.Id))" -ForegroundColor Green

  # Try to create buckets
  try {
    $mcPath = "$InstallDir\mc.exe"
    if (-not (Test-Path $mcPath)) {
      Invoke-WebRequest -Uri "https://dl.min.io/client/mc/release/windows-amd64/mc.exe" -OutFile $mcPath -UseBasicParsing
    }

    & $mcPath alias set phonefarm "http://localhost:$ApiPort" $AccessKey $SecretKey 2>$null
    & $mcPath mb "phonefarm/phonefarm" --ignore-existing 2>$null
    & $mcPath mb "phonefarm/models" --ignore-existing 2>$null
    & $mcPath mb "phonefarm/logs" --ignore-existing 2>$null

    # Set lifecycle policies
    & $mcPath ilm rule add --expire-days 7 "phonefarm/phonefarm" 2>$null

    Write-Host "  Buckets created: phonefarm, models, logs" -ForegroundColor Green
  } catch {
    Write-Host "  Bucket creation skipped (mc client may not be available)" -ForegroundColor Yellow
  }

  Stop-Process -Id $TestProcess.Id -Force
  Start-Sleep -Seconds 1
}

# 5. Firewall rules
Write-Host "[4/5] Configuring firewall..." -ForegroundColor Yellow
try {
  New-NetFirewallRule -DisplayName "PhoneFarm MinIO API" `
    -Direction Inbound -Protocol TCP -LocalPort $ApiPort `
    -Action Allow -Profile Any 2>$null
  New-NetFirewallRule -DisplayName "PhoneFarm MinIO Console" `
    -Direction Inbound -Protocol TCP -LocalPort $ConsolePort `
    -Action Allow -Profile Any 2>$null
  Write-Host "  Firewall rules added for ports $ApiPort, $ConsolePort" -ForegroundColor Green
} catch {
  Write-Host "  Firewall config skipped" -ForegroundColor Yellow
}

# 6. Service installation
if ($InstallAsService) {
  Write-Host "[5/5] Installing as Windows service..." -ForegroundColor Yellow
  $MinioEnv = @(
    "MINIO_ROOT_USER=$AccessKey",
    "MINIO_ROOT_PASSWORD=$SecretKey",
    "MINIO_BROWSER=on",
    "MINIO_LOG_FILE=$InstallDir\minio.log"
  ) -join " "

  # Use NSSM or sc.exe
  $nssm = Get-Command nssm -ErrorAction SilentlyContinue
  if ($nssm) {
    & nssm install PhoneFarmMinIO "$InstallDir\minio.exe" `
      server $DataDir --console-address ":`:$ConsolePort" --address ":`:$ApiPort"
    & nssm set PhoneFarmMinIO AppEnvironmentExtra $MinioEnv
    & nssm set PhoneFarmMinIO Start SERVICE_AUTO_START
    Write-Host "  Service 'PhoneFarmMinIO' installed via NSSM" -ForegroundColor Green
  } else {
    sc.exe create PhoneFarmMinIO binPath= "`"$InstallDir\minio.exe`" server $DataDir --console-address `:$ConsolePort --address `:$ApiPort" start= auto 2>$null
    Write-Host "  Service 'PhoneFarmMinIO' installed via sc.exe (Manual start recommended)" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "=== MinIO Setup Complete ===" -ForegroundColor Cyan
Write-Host "API:     http://localhost:$ApiPort" -ForegroundColor White
Write-Host "Console: http://localhost:$ConsolePort" -ForegroundColor White
Write-Host "User:    $AccessKey" -ForegroundColor White
Write-Host "Pass:    $SecretKey" -ForegroundColor White
Write-Host ""
Write-Host "Add to your .env file:" -ForegroundColor Yellow
Write-Host "  MINIO_ENDPOINT=localhost:$ApiPort" -ForegroundColor White
Write-Host "  MINIO_ACCESS_KEY=$AccessKey" -ForegroundColor White
Write-Host "  MINIO_SECRET_KEY=$SecretKey" -ForegroundColor White
Write-Host "  MINIO_ENABLED=true" -ForegroundColor White
