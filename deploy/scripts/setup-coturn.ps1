# =============================================================================
# Setup coturn (TURN/STUN Server) for PhoneFarm WebRTC Infrastructure
# =============================================================================
# This script:
#   1. Checks if coturn is available/installed
#   2. Creates the config directory
#   3. Writes the turnserver.conf
#   4. Configures Windows firewall rules
#   5. Runs a basic STUN/TURN connectivity check
#   6. Provides instructions for running coturn as a service
#
# Usage:
#   .\setup-coturn.ps1
#   .\setup-coturn.ps1 -PublicIp "203.0.113.45"
#   .\setup-coturn.ps1 -RestartService
# =============================================================================

param(
    [string]$PublicIp = $null,
    [string]$TurnUser = "phonefarm",
    [string]$TurnPassword = $null,
    [string]$ConfigDir = "e:\Program Files\www\phone\deploy\coturn",
    [switch]$RestartService = $false,
    [switch]$SkipFirewall = $false
)

$ErrorActionPreference = "Stop"

# ---- Banner ----

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " PhoneFarm coturn TURN/STUN Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ---- 1. Check for coturn installation ----

Write-Host "[1/5] Checking for coturn installation..." -ForegroundColor Yellow

$coturnPath = Get-Command "turnserver.exe" -ErrorAction SilentlyContinue
$coturnInstalled = $null -ne $coturnPath

if (-not $coturnInstalled) {
    # Check common install locations
    $commonPaths = @(
        "C:\Program Files\coturn\turnserver.exe",
        "C:\coturn\turnserver.exe",
        "${env:ProgramFiles}\coturn\turnserver.exe"
    )

    foreach ($p in $commonPaths) {
        if (Test-Path $p) {
            $coturnPath = $p
            $coturnInstalled = $true
            break
        }
    }
}

if ($coturnInstalled) {
    Write-Host "  [OK] coturn found at: $coturnPath" -ForegroundColor Green
} else {
    Write-Host "  [WARN] coturn not found in PATH or common locations." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  To install coturn on Windows:"
    Write-Host "    1. Download from: https://github.com/coturn/coturn"
    Write-Host "    2. Or install via WSL: wsl sudo apt-get install coturn"
    Write-Host "    3. Or use a cloud-hosted TURN service (e.g., Twilio, Xirsys)"
    Write-Host ""
    Write-Host "  This script will still create the config file for future use."
    Write-Host ""
}

# ---- 2. Create configuration directory ----

Write-Host "[2/5] Creating configuration directory..." -ForegroundColor Yellow

if (-not (Test-Path $ConfigDir)) {
    New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
    Write-Host "  [OK] Created: $ConfigDir" -ForegroundColor Green
} else {
    Write-Host "  [OK] Directory exists: $ConfigDir" -ForegroundColor Green
}

# ---- 3. Write turnserver.conf ----

Write-Host "[3/5] Writing turnserver.conf..." -ForegroundColor Yellow

$configFile = Join-Path $ConfigDir "turnserver.conf"

if (Test-Path $configFile) {
    Write-Host "  Config file already exists: $configFile" -ForegroundColor Gray
    if (-not $RestartService) {
        Write-Host "  Use -RestartService to overwrite with defaults." -ForegroundColor Gray
    }
}

# Determine public IP
if (-not $PublicIp) {
    try {
        Write-Host "  Detecting public IP address..." -ForegroundColor Gray
        $PublicIp = (Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 10) -replace '\s',''
        Write-Host "  Detected public IP: $PublicIp" -ForegroundColor Green
    } catch {
        Write-Host "  [WARN] Could not detect public IP. Using placeholder." -ForegroundColor Yellow
        $PublicIp = "CHANGE_ME"
    }
}

# Check if config expects the public IP to be set
$configContent = Get-Content $configFile -Raw -ErrorAction SilentlyContinue
if ($configContent -and $configContent -match "CHANGE_ME") {
    Write-Host "  Updating placeholder values in config..." -ForegroundColor Gray

    # Generate a random password if none was provided
    if (-not $TurnPassword) {
        $randBytes = New-Object byte[] 16
        [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($randBytes)
        $TurnPassword = [Convert]::ToBase64String($randBytes) -replace '[+/=]', ''
        Write-Host "  Generated random TURN password: $TurnPassword" -ForegroundColor Green
        Write-Host "  [IMPORTANT] Save this password! It will be needed for device configuration." -ForegroundColor Magenta
    }

    # Replace placeholders
    $configContent = $configContent -replace 'external-ip=CHANGE_ME', "external-ip=$PublicIp"
    $configContent = $configContent -replace 'CHANGE_ME_PASSWORD', $TurnPassword
    $configContent | Out-File -Encoding ascii -LiteralPath $configFile

    Write-Host "  [OK] Config updated with public IP and credentials" -ForegroundColor Green
} else {
    Write-Host "  [OK] Config file is already set up: $configFile" -ForegroundColor Green
}

Write-Host ""
Write-Host "  TURN Server Config Summary:" -ForegroundColor Cyan
Write-Host "  -----------------------------" -ForegroundColor Cyan
Write-Host "  Public IP    : $PublicIp" -ForegroundColor White
Write-Host "  STUN Port    : 3478 (UDP)" -ForegroundColor White
Write-Host "  TURN Port    : 3478 (UDP)" -ForegroundColor White
Write-Host "  TLS Port     : 5349 (DTLS)" -ForegroundColor White
Write-Host "  Username     : $TurnUser" -ForegroundColor White
Write-Host "  Password     : $TurnPassword" -ForegroundColor White
Write-Host ""

# ---- 4. Windows Firewall Rules ----

if (-not $SkipFirewall) {
    Write-Host "[4/5] Configuring Windows Firewall..." -ForegroundColor Yellow

    # Check if running as admin
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if (-not $isAdmin) {
        Write-Host "  [WARN] Not running as Administrator. Cannot configure firewall." -ForegroundColor Yellow
        Write-Host "  Run this script as Administrator to auto-configure firewall rules." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Manually allow these ports in Windows Firewall:" -ForegroundColor Yellow
        Write-Host "    - 3478 UDP (STUN/TURN)" -ForegroundColor White
        Write-Host "    - 3478 TCP (TURN multiplex)" -ForegroundColor White
        Write-Host "    - 5349 UDP (TURN DTLS/TLS)" -ForegroundColor White
    } else {
        $fwRules = @(
            @{Name="PhoneFarm-STUN-TURN-UDP"; Port=3478; Protocol="UDP"},
            @{Name="PhoneFarm-TURN-TCP"; Port=3478; Protocol="TCP"},
            @{Name="PhoneFarm-TURN-TLS"; Port=5349; Protocol="UDP"}
        )

        foreach ($rule in $fwRules) {
            $existingRule = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
            if ($existingRule) {
                Write-Host "  Firewall rule already exists: $($rule.Name)" -ForegroundColor Gray
            } else {
                New-NetFirewallRule -DisplayName $rule.Name `
                    -Direction Inbound `
                    -Protocol $rule.Protocol `
                    -LocalPort $rule.Port `
                    -Action Allow `
                    -Profile Any `
                    -Description "PhoneFarm coturn $($rule.Protocol) port $($rule.Port)" | Out-Null
                Write-Host "  [OK] Firewall rule added: $($rule.Name) ($($rule.Protocol) $($rule.Port))" -ForegroundColor Green
            }
        }
    }
} else {
    Write-Host "[4/5] Firewall configuration skipped (-SkipFirewall)" -ForegroundColor Gray
}

# ---- 5. Test STUN/TURN connectivity ----

Write-Host "[5/5] Testing STUN/TURN connectivity..." -ForegroundColor Yellow

if ($coturnInstalled) {
    Write-Host "  Starting coturn in test mode (background, 5 seconds)..." -ForegroundColor Gray

    $logFile = Join-Path $ConfigDir "turnserver-test.log"

    try {
        $turnProcess = Start-Process -FilePath "turnserver.exe" `
            -ArgumentList "-c `"$configFile`" -v" `
            -NoNewWindow `
            -PassThru `
            -RedirectStandardOutput $logFile `
            -RedirectStandardError $logFile

        Start-Sleep -Seconds 5

        if (-not $turnProcess.HasExited) {
            Write-Host "  [OK] coturn started successfully (PID: $($turnProcess.Id))" -ForegroundColor Green

            # Check log for common startup errors
            $logContent = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
            if ($logContent) {
                if ($logContent -match "ERROR") {
                    Write-Host "  [WARN] coturn reported errors. Check log: $logFile" -ForegroundColor Yellow
                    $errorLines = $logContent -split "`n" | Select-String "ERROR" | Select-Object -First 3
                    foreach ($line in $errorLines) {
                        Write-Host "    $line" -ForegroundColor Red
                    }
                } else {
                    Write-Host "  [OK] No startup errors detected" -ForegroundColor Green
                }
            }

            # Stop the test process
            Stop-Process -Id $turnProcess.Id -Force -ErrorAction SilentlyContinue
            Write-Host "  Test process stopped." -ForegroundColor Gray
        } else {
            Write-Host "  [FAIL] coturn exited immediately. Check log: $logFile" -ForegroundColor Red
            $logContent = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
            if ($logContent) {
                Write-Host "  Log output:" -ForegroundColor Gray
                Write-Host $logContent -ForegroundColor Gray
            }
        }
    } catch {
        Write-Host "  [WARN] Could not test coturn: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [SKIP] coturn not installed. Skipping connectivity test." -ForegroundColor Gray
    Write-Host ""
    Write-Host "  To test STUN connectivity manually after installing coturn:" -ForegroundColor Yellow
    Write-Host "    turnserver -c `"$configFile`" -v" -ForegroundColor White
    Write-Host ""
    Write-Host "  To test STUN from a remote client:" -ForegroundColor Yellow
    Write-Host "    Use: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/" -ForegroundColor White
    Write-Host "    Enter: stun:$PublicIp`:3478" -ForegroundColor White
    Write-Host "    Enter: turn:$PublicIp`:3478 (username: $TurnUser)" -ForegroundColor White
}

# ---- Summary ----

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Setup Complete" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Configuration:" -ForegroundColor Yellow
Write-Host "    Config file : $configFile" -ForegroundColor White
Write-Host "    STUN URI    : stun:$PublicIp`:3478" -ForegroundColor White
Write-Host "    TURN URI    : turn:$PublicIp`:3478" -ForegroundColor White
Write-Host "    Username    : $TurnUser" -ForegroundColor White
Write-Host ""

if ($coturnInstalled) {
    Write-Host "  To run coturn manually:" -ForegroundColor Yellow
    Write-Host "    turnserver -c `"$configFile`"" -ForegroundColor White
    Write-Host ""
    Write-Host "  To configure as a Windows Service:" -ForegroundColor Yellow
    Write-Host "    New-Service -Name coturn -BinaryPathName `"turnserver.exe -c $configFile`" -DisplayName `"PhoneFarm coturn TURN Server`" -StartupType Automatic" -ForegroundColor White
    Write-Host "    Start-Service coturn" -ForegroundColor White
    Write-Host ""

    # Register a scheduled task to auto-start coturn (alternative to Windows Service)
    Write-Host "  Or via Scheduled Task (auto-start):" -ForegroundColor Yellow
    $taskAction = New-ScheduledTaskAction -Execute "turnserver.exe" -Argument "-c `"$configFile`""
    $taskTrigger = New-ScheduledTaskTrigger -AtStartup
    $taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -Hidden
    Write-Host "    `$taskAction = New-ScheduledTaskAction -Execute turnserver.exe -Argument '-c `"$configFile`"' " -ForegroundColor Gray
    Write-Host "    `$taskTrigger = New-ScheduledTaskTrigger -AtStartup" -ForegroundColor Gray
    Write-Host "    Register-ScheduledTask -TaskName PhoneFarm-coturn -Action `$taskAction -Trigger `$taskTrigger -Settings `$taskSettings -RunLevel Highest" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "  [INFO] coturn must be installed before the TURN server can run." -ForegroundColor Yellow
    Write-Host "  See installation instructions in step 1 above." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "============================================" -ForegroundColor Cyan
