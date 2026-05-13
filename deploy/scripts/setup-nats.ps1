# PowerShell: Deploy NATS Server on Windows
# Run as Administrator for service installation

param(
  [string]$NatsVersion = "2.10.22",
  [string]$InstallDir = "C:\phonefarm\nats",
  [string]$ConfigFile = "deploy\nats\nats-server.conf",
  [string]$NatsToken = $env:NATS_TOKEN,
  [switch]$SkipDownload = $false,
  [switch]$InstallAsService = $true
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path "$PSScriptRoot\..\.."

Write-Host "=== PhoneFarm NATS Server Setup ===" -ForegroundColor Cyan

# 1. Create directories
Write-Host "[1/6] Creating directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\data\jetstream" | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\logs" | Out-Null

# 2. Download NATS
if (-not $SkipDownload) {
  Write-Host "[2/6] Downloading NATS Server v$NatsVersion..." -ForegroundColor Yellow
  $NatsUrl = "https://github.com/nats-io/nats-server/releases/download/v$NatsVersion/nats-server-v$NatsVersion-windows-amd64.zip"
  $ZipPath = "$env:TEMP\nats-server.zip"

  try {
    Invoke-WebRequest -Uri $NatsUrl -OutFile $ZipPath -UseBasicParsing
    Expand-Archive -Path $ZipPath -DestinationPath $InstallDir -Force
    Remove-Item $ZipPath -Force
    Write-Host "  NATS downloaded to $InstallDir" -ForegroundColor Green
  } catch {
    Write-Host "  Download failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Try manual download from: $NatsUrl" -ForegroundColor Yellow
    if (-not (Test-Path "$InstallDir\nats-server.exe")) {
      throw "NATS server binary not found. Set -SkipDownload if already installed."
    }
  }
}

# 3. Configure
Write-Host "[3/6] Configuring NATS..." -ForegroundColor Yellow
if (-not $NatsToken) {
  $NatsToken = "phonefarm-nats-token-" + (-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 16 | ForEach-Object { [char]$_ }))
  Write-Host "  Generated random token: $NatsToken" -ForegroundColor Yellow
}

$ConfigContent = Get-Content "$ProjectRoot\$ConfigFile" -Raw
$ConfigContent = $ConfigContent -replace '\$\{NATS_TOKEN:-[^}]*\}', $NatsToken
$ConfigContent = $ConfigContent -replace '\$\{NATS_CONTROL_PASSWORD:-[^}]*\}', "control-$NatsToken"
$ConfigContent = $ConfigContent -replace '\$\{NATS_DEVICE_PASSWORD:-[^}]*\}', "device-$NatsToken"
$ConfigContent = $ConfigContent -replace '\$\{NATS_DEVICE_ID:-[^}]*\}', '*'

# Fix paths for Windows
$ConfigContent = $ConfigContent -replace '/var/log/nats/', "$InstallDir\logs\"
$ConfigContent = $ConfigContent -replace '/data/nats/', "$InstallDir\data\"
$ConfigContent -replace '/etc/nats/', "$InstallDir\"

$ConfigPath = "$InstallDir\nats-server.conf"
$ConfigContent | Set-Content -Path $ConfigPath -Encoding utf8
Write-Host "  Config written to $ConfigPath" -ForegroundColor Green

# 4. Test run
Write-Host "[4/6] Testing NATS server..." -ForegroundColor Yellow
$TestProcess = Start-Process -FilePath "$InstallDir\nats-server.exe" `
  -ArgumentList "-c", $ConfigPath, "-D" `
  -NoNewWindow -PassThru

Start-Sleep -Seconds 3

if ($TestProcess.HasExited) {
  Write-Host "  NATS failed to start! Check logs." -ForegroundColor Red
} else {
  Write-Host "  NATS server started successfully (PID: $($TestProcess.Id))" -ForegroundColor Green
  Stop-Process -Id $TestProcess.Id -Force
  Start-Sleep -Seconds 1
}

# 5. Firewall rule
Write-Host "[5/6] Configuring firewall..." -ForegroundColor Yellow
try {
  New-NetFirewallRule -DisplayName "PhoneFarm NATS" `
    -Direction Inbound -Protocol TCP -LocalPort 4222,8222 `
    -Action Allow -Profile Any 2>$null
  Write-Host "  Firewall rules added for ports 4222, 8222" -ForegroundColor Green
} catch {
  Write-Host "  Firewall config skipped (may need admin rights)" -ForegroundColor Yellow
}

# 6. Service installation
if ($InstallAsService) {
  Write-Host "[6/6] Installing as Windows service..." -ForegroundColor Yellow
  try {
    New-Service -Name "PhoneFarmNATS" `
      -BinaryPathName "$InstallDir\nats-server.exe -c $ConfigPath" `
      -DisplayName "PhoneFarm NATS Server" `
      -Description "PhoneFarm NATS message broker for device state synchronization" `
      -StartupType Automatic `
      -ErrorAction Stop

    Set-Service -Name "PhoneFarmNATS" -StartupType Manual
    Write-Host "  Service 'PhoneFarmNATS' installed (Manual start)" -ForegroundColor Green
    Write-Host "  Start with: Start-Service PhoneFarmNATS" -ForegroundColor Green
  } catch {
    Write-Host "  Service install failed (may need admin rights): $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "=== NATS Setup Complete ===" -ForegroundColor Cyan
Write-Host "Binary: $InstallDir\nats-server.exe" -ForegroundColor White
Write-Host "Config: $ConfigPath" -ForegroundColor White
Write-Host "Token:  $NatsToken" -ForegroundColor White
Write-Host ""
Write-Host "Add to your .env file:" -ForegroundColor Yellow
Write-Host "  NATS_URL=nats://localhost:4222" -ForegroundColor White
Write-Host "  NATS_TOKEN=$NatsToken" -ForegroundColor White
Write-Host "  NATS_ENABLED=true" -ForegroundColor White
