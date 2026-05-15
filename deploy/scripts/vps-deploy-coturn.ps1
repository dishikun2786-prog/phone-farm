# =============================================================================
# VPS coturn TURN/STUN Server Deployment Script
# Runs on Windows Server 2025 VPS (47.243.254.248)
# All downloads and installations go to D: drive
# =============================================================================

param(
    [string]$TurnUser = "phonefarm",
    [string]$TurnPassword = $null,
    [switch]$SkipFirewall = $false
)

$ErrorActionPreference = "Stop"
$D_ROOT = "D:"
$COTURN_DIR = "$D_ROOT\coturn"
$COTURN_CONFIG = "$COTURN_DIR\turnserver.conf"
$WSL_DISTRO = "Ubuntu-24.04"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " PhoneFarm VPS coturn Deployment" -ForegroundColor Cyan
Write-Host " Target: VPS 47.243.254.248" -ForegroundColor Cyan
Write-Host " Install Root: D:\coturn" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ---- 0. Ensure D: drive and directories exist ----
Write-Host "[0/6] Ensuring D: drive directories..." -ForegroundColor Yellow

if (-not (Test-Path $D_ROOT)) {
    Write-Host "  [ERROR] D: drive not found!" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $COTURN_DIR)) {
    New-Item -ItemType Directory -Force -Path $COTURN_DIR | Out-Null
    Write-Host "  [OK] Created: $COTURN_DIR" -ForegroundColor Green
} else {
    Write-Host "  [OK] Directory exists: $COTURN_DIR" -ForegroundColor Green
}

# ---- 1. Detect Public IP ----
Write-Host "[1/6] Detecting public IP..." -ForegroundColor Yellow

try {
    $PublicIp = (Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 10) -replace '\s',''
    Write-Host "  [OK] Public IP: $PublicIp" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Could not detect public IP from api.ipify.org" -ForegroundColor Yellow
    try {
        $PublicIp = (Invoke-RestMethod -Uri "https://ifconfig.me" -TimeoutSec 10) -replace '\s',''
        Write-Host "  [OK] Public IP: $PublicIp" -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR] Cannot detect public IP. Please pass -PublicIp parameter." -ForegroundColor Red
        exit 1
    }
}

# ---- 2. Enable WSL feature (if not already enabled) ----
Write-Host "[2/6] Enabling WSL feature..." -ForegroundColor Yellow

$wslFeature = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -ErrorAction SilentlyContinue
if ($wslFeature -and $wslFeature.State -eq "Enabled") {
    Write-Host "  [OK] WSL feature already enabled" -ForegroundColor Green
} else {
    Write-Host "  Enabling WSL (this may take a few minutes)..." -ForegroundColor Yellow
    Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart
    Write-Host "  [OK] WSL feature enabled" -ForegroundColor Green
    Write-Host "  [INFO] A reboot may be required before WSL works." -ForegroundColor Yellow
}

# Enable VM platform for WSL2
$vmFeature = Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -ErrorAction SilentlyContinue
if ($vmFeature -and $vmFeature.State -eq "Enabled") {
    Write-Host "  [OK] VirtualMachinePlatform already enabled" -ForegroundColor Green
} else {
    Write-Host "  Enabling VirtualMachinePlatform..." -ForegroundColor Yellow
    Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart
    Write-Host "  [OK] VirtualMachinePlatform enabled" -ForegroundColor Green
}

# ---- 3. Generate TURN password if not provided ----
Write-Host "[3/6] Setting up credentials..." -ForegroundColor Yellow

if (-not $TurnPassword) {
    $randBytes = New-Object byte[] 16
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($randBytes)
    $TurnPassword = [Convert]::ToBase64String($randBytes) -replace '[+/=]', '' -replace '[Il0O]', ''
    if ($TurnPassword.Length -gt 20) { $TurnPassword = $TurnPassword.Substring(0, 20) }
}

Write-Host "  Username: $TurnUser" -ForegroundColor White
Write-Host "  Password: $TurnPassword" -ForegroundColor White
Write-Host "  [IMPORTANT] Save this password!" -ForegroundColor Magenta

# Generate HMAC key for long-term credentials
$hmacKey = $TurnPassword
try {
    $hmacBytes = [System.Text.Encoding]::UTF8.GetBytes($hmacKey)
    $hmacSha1 = New-Object System.Security.Cryptography.HMACSHA1
    $hmacSha1.Key = $hmacBytes
    $hmacResult = $hmacSha1.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("coturn-turn-key"))
    $hmacKey = [Convert]::ToBase64String($hmacResult) -replace '[+/=]', ''
} catch {
    # Fallback: use password as-is
    $hmacKey = $TurnPassword
}

# ---- 4. Write coturn configuration ----
Write-Host "[4/6] Writing coturn configuration..." -ForegroundColor Yellow

$configContent = @"
# PhoneFarm coturn TURN/STUN server configuration
# Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
# Public IP: $PublicIp

# Listening
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
relay-ip=$PublicIp
external-ip=$PublicIp

# Authentication (long-term credential mechanism)
lt-cred-mech
user=${TurnUser}:${TurnPassword}
realm=phone.openedskill.com

# Use fingerprint for WebRTC compatibility
fingerprint

# Server name
server-name=phone.openedskill.com

# Logging
verbose
log-file=/var/log/coturn/turnserver.log
simple-log

# Performance
total-quota=100
max-bps=0
stale-nonce=600
no-loopback-peers
no-multicast-peers

# Mobility
mobility

# Disable weak protocols
no-tlsv1
no-tlsv1_1

# STUN keep-alive
stun-keep-address-family=ipv4

# Denied peer IP ranges (RFC 1918 private ranges, loopback)
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.0.0.0-192.0.0.255
denied-peer-ip=192.0.2.0-192.0.2.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=198.18.0.0-198.19.255.255
denied-peer-ip=198.51.100.0-198.51.100.255
denied-peer-ip=203.0.113.0-203.0.113.255
"@

$configContent | Out-File -Encoding ascii -LiteralPath $COTURN_CONFIG
Write-Host "  [OK] Config written: $COTURN_CONFIG" -ForegroundColor Green

# Save credentials to a secure note
$credFile = "$COTURN_DIR\credentials.txt"
@"
PhoneFarm TURN Server Credentials
=================================
Public IP   : $PublicIp
STUN URI    : stun:$PublicIp`:3478
TURN URI    : turn:$PublicIp`:3478?transport=udp
TURNS URI   : turns:$PublicIp`:5349?transport=tcp
Username    : $TurnUser
Password    : $TurnPassword
Created     : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
"@ | Out-File -Encoding utf8 -LiteralPath $credFile

Write-Host "  [OK] Credentials saved: $credFile" -ForegroundColor Green

# ---- 5. Install coturn via WSL ----
Write-Host "[5/6] Setting up coturn in WSL..." -ForegroundColor Yellow

# Check if WSL distro exists
$wslList = wsl -l -q 2>$null
if ($wslList -match $WSL_DISTRO) {
    Write-Host "  [OK] WSL distro '$WSL_DISTRO' already installed" -ForegroundColor Green
} else {
    Write-Host "  Installing Ubuntu 24.04 WSL (this will take several minutes on first run)..." -ForegroundColor Yellow
    Write-Host "  Download size: ~500MB. All files go to D: drive." -ForegroundColor Yellow

    # Set WSL default install location to D: drive
    $env:WSL_IMAGE_PATH = "$D_ROOT\WSL"
    if (-not (Test-Path "$D_ROOT\WSL")) {
        New-Item -ItemType Directory -Force -Path "$D_ROOT\WSL" | Out-Null
    }

    # Download and install Ubuntu
    wsl --install -d $WSL_DISTRO --web-download 2>&1 | Write-Host
}

# Install coturn in WSL
Write-Host "  Installing coturn package in WSL..." -ForegroundColor Yellow
$wslCmd = @"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq coturn 2>&1
echo "COTURN_INSTALLED=$?"
mkdir -p /var/log/coturn
cp /mnt/d/coturn/turnserver.conf /etc/turnserver.conf 2>/dev/null || echo "Config will be set up separately"
echo "===DONE==="
"@

# Write the WSL script to D: drive so WSL can access it
$wslScriptPath = "$COTURN_DIR\wsl-setup.sh"
$wslCmd | Out-File -Encoding ascii -LiteralPath $wslScriptPath

wsl -d $WSL_DISTRO -- bash /mnt/d/coturn/wsl-setup.sh 2>&1 | ForEach-Object {
    if ($_ -match "COTURN_INSTALLED=0" -or $_ -match "DONE") {
        Write-Host "  [OK] $_" -ForegroundColor Green
    } else {
        Write-Host "  [WSL] $_" -ForegroundColor Gray
    }
}

# Copy config into WSL
wsl -d $WSL_DISTRO -- bash -c "cp /mnt/d/coturn/turnserver.conf /etc/turnserver.conf && echo CONFIG_COPIED" 2>&1

Write-Host "  [OK] coturn installed and configured in WSL" -ForegroundColor Green

# ---- 6. Configure Windows Firewall ----
if (-not $SkipFirewall) {
    Write-Host "[6/6] Configuring Windows Firewall..." -ForegroundColor Yellow

    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if (-not $isAdmin) {
        Write-Host "  [WARN] Not running as Administrator. Cannot configure firewall." -ForegroundColor Yellow
    } else {
        $fwRules = @(
            @{Name="PhoneFarm-STUN-TURN-UDP"; Port=3478; Protocol="UDP"},
            @{Name="PhoneFarm-TURN-TCP"; Port=3478; Protocol="TCP"},
            @{Name="PhoneFarm-TURN-TLS"; Port=5349; Protocol="UDP"}
        )

        foreach ($rule in $fwRules) {
            $existingRule = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
            if ($existingRule) {
                Write-Host "  Firewall rule exists: $($rule.Name)" -ForegroundColor Gray
            } else {
                New-NetFirewallRule -DisplayName $rule.Name `
                    -Direction Inbound `
                    -Protocol $rule.Protocol `
                    -LocalPort $rule.Port `
                    -Action Allow `
                    -Profile Any `
                    -Description "PhoneFarm coturn $($rule.Protocol) port $($rule.Port)" | Out-Null
                Write-Host "  [OK] Firewall rule added: $($rule.Name)" -ForegroundColor Green
            }
        }
    }
} else {
    Write-Host "[6/6] Firewall configuration skipped (-SkipFirewall)" -ForegroundColor Gray
}

# ---- Configure coturn as a WSL background service ----
Write-Host ""
Write-Host "Configuring coturn auto-start via WSL..." -ForegroundColor Yellow

# Create a VBS script to run coturn in WSL without a window
$wslStartScript = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "wsl -d $WSL_DISTRO -- bash -c 'turnserver -c /etc/turnserver.conf'", 0, False
"@

$wslStartVbs = "$COTURN_DIR\start-coturn.vbs"
$wslStartScript | Out-File -Encoding ascii -LiteralPath $wslStartVbs
Write-Host "  [OK] WSL start script: $wslStartVbs" -ForegroundColor Green

# Register scheduled task to start coturn at boot (hidden)
$taskName = "PhoneFarm-coturn-WSL"
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$taskAction = New-ScheduledTaskAction -Execute "wsl" -Argument "-d $WSL_DISTRO -- bash -c 'turnserver -c /etc/turnserver.conf'"
$taskTrigger = New-ScheduledTaskTrigger -AtStartup
$taskSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -Hidden `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName `
    -Action $taskAction `
    -Trigger $taskTrigger `
    -Settings $taskSettings `
    -Principal $taskPrincipal `
    -Description "PhoneFarm coturn TURN/STUN server (WSL)" | Out-Null

Write-Host "  [OK] Scheduled task '$taskName' created (auto-start, hidden)" -ForegroundColor Green

# ---- Start coturn now ----
Write-Host ""
Write-Host "Starting coturn now..." -ForegroundColor Yellow
Start-Process -FilePath "wsl" -ArgumentList "-d $WSL_DISTRO -- bash -c 'turnserver -c /etc/turnserver.conf > /var/log/coturn/turnserver.log 2>&1 &'" -NoNewWindow
Start-Sleep -Seconds 3

# Check if coturn is running
$turnCheck = wsl -d $WSL_DISTRO -- bash -c "pgrep -x turnserver && echo 'RUNNING' || echo 'NOT_RUNNING'" 2>&1
Write-Host "  coturn status: $turnCheck" -ForegroundColor $(if ($turnCheck -match "RUNNING") { "Green" } else { "Yellow" })

# ---- Summary ----
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " coturn Deployment Complete" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  STUN URI : stun:$PublicIp`:3478" -ForegroundColor White
Write-Host "  TURN URI : turn:$PublicIp`:3478?transport=udp" -ForegroundColor White
Write-Host "  Username  : $TurnUser" -ForegroundColor White
Write-Host "  Password  : $TurnPassword" -ForegroundColor White
Write-Host ""
Write-Host "  Config    : $COTURN_CONFIG" -ForegroundColor White
Write-Host "  Creds     : $credFile" -ForegroundColor White
Write-Host "  Logs      : WSL /var/log/coturn/turnserver.log" -ForegroundColor White
Write-Host ""
Write-Host "  [ACTION REQUIRED] 请确保阿里云安全组已开放以下端口:" -ForegroundColor Magenta
Write-Host "    - 3478 UDP (STUN/TURN)" -ForegroundColor Magenta
Write-Host "    - 3478 TCP (TURN multiplex)" -ForegroundColor Magenta
Write-Host "    - 5349 UDP (TURN DTLS)" -ForegroundColor Magenta
Write-Host ""
Write-Host "  To test: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan

# Return credentials for local use
@"
TURN_CREDENTIALS_RESULT
HOST=$PublicIp
PORT=3478
USER=$TurnUser
PASSWORD=$TurnPassword
"@
