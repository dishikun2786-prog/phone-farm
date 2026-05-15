# PhoneFarm VPS Memory Optimization
Write-Host "=== VPS Memory Optimization ===" -ForegroundColor Cyan
Write-Host ""

# ---- Pre-optimization snapshot ----
$os = Get-CimInstance Win32_OperatingSystem
$beforeFree = [math]::Round($os.FreePhysicalMemory/1MB, 2)
Write-Host "[Before] Free RAM: ${beforeFree}GB / Total: 3.9GB" -ForegroundColor Yellow
Write-Host ""

# ============================================
# 1. Stop Trae IDE (heavy - 6 instances, ~970MB)
# ============================================
Write-Host "[1/6] Stopping Trae IDE processes..." -ForegroundColor Cyan
try {
    Get-Process -Name "Trae" -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "  Trae processes stopped" -ForegroundColor Green
} catch {
    Write-Host "  Trae already stopped or not found" -ForegroundColor Gray
}

# ============================================
# 2. Stop Chrome (non-essential browser instances, ~413MB)
# ============================================
Write-Host "[2/6] Stopping Chrome browser..." -ForegroundColor Cyan
try {
    Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "  Chrome processes stopped" -ForegroundColor Green
} catch {
    Write-Host "  Chrome already stopped" -ForegroundColor Gray
}

# ============================================
# 3. Stop explorer.exe (GUI shell - ~75MB, not needed on headless server)
# ============================================
Write-Host "[3/6] Stopping Windows Explorer GUI (headless server)..." -ForegroundColor Cyan
try {
    Get-Process -Name "explorer" -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "  Explorer stopped" -ForegroundColor Green
} catch {
    Write-Host "  Explorer already stopped" -ForegroundColor Gray
}

# ============================================
# 4. Run Windows Update Cleanup + Temp files
# ============================================
Write-Host "[4/6] Cleaning temp files..." -ForegroundColor Cyan
try {
    # Clean user temp
    Remove-Item -Path "$env:TEMP\*" -Recurse -Force -ErrorAction SilentlyContinue
    # Clean system temp
    Remove-Item -Path "C:\Windows\Temp\*" -Recurse -Force -ErrorAction SilentlyContinue
    # Clean PM2 logs
    Remove-Item -Path "$env:USERPROFILE\.pm2\logs\*" -Recurse -Force -ErrorAction SilentlyContinue
    # Clean download cache
    Remove-Item -Path "D:\redis-7.4.3-x64-windows.zip" -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "D:\redis-7.4.9-x64-windows.zip" -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "D:\nats-server.zip" -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "D:\postgresql-18-installer.exe" -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "D:\postgresql-18-windows-x64.zip" -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "D:\pgsql" -Recurse -Force -ErrorAction SilentlyContinue
    # Clean install logs
    Remove-Item -Path "C:\Users\Administrator\AppData\Local\Temp\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Temp files cleaned" -ForegroundColor Green
} catch {
    Write-Host "  Some temp files could not be cleaned (may be in use)" -ForegroundColor Yellow
}

# ============================================
# 5. Optimize Windows Defender (MsMpEng ~215MB)
# ============================================
Write-Host "[5/6] Optimizing Windows Defender..." -ForegroundColor Cyan
try {
    # Add PM2/Node.js/PostgreSQL/Redis/NATS/MinIO paths to Defender exclusions
    # to reduce real-time scanning overhead
    Add-MpPreference -ExclusionProcess "node.exe" -ErrorAction SilentlyContinue
    Add-MpPreference -ExclusionProcess "redis-server.exe" -ErrorAction SilentlyContinue
    Add-MpPreference -ExclusionProcess "postgres.exe" -ErrorAction SilentlyContinue
    Add-MpPreference -ExclusionProcess "nats-server.exe" -ErrorAction SilentlyContinue
    Add-MpPreference -ExclusionProcess "minio.exe" -ErrorAction SilentlyContinue
    Add-MpPreference -ExclusionPath "D:\www" -ErrorAction SilentlyContinue
    Add-MpPreference -ExclusionPath "D:\Redis" -ErrorAction SilentlyContinue
    Add-MpPreference -ExclusionPath "D:\NATS" -ErrorAction SilentlyContinue
    Add-MpPreference -ExclusionPath "D:\MinIO" -ErrorAction SilentlyContinue
    Add-MpPreference -ExclusionPath "C:\Program Files\PostgreSQL" -ErrorAction SilentlyContinue
    Write-Host "  Defender exclusions added for all PhoneFarm services" -ForegroundColor Green
} catch {
    Write-Host "  Defender optimization skipped (not admin?)" -ForegroundColor Yellow
}

# ============================================
# 6. Disable unnecessary Windows services
# ============================================
Write-Host "[6/6] Disabling unnecessary services..." -ForegroundColor Cyan

$servicesToStop = @(
    "Spooler",          # Print Spooler (not needed on server)
    "WSearch",          # Windows Search indexing
    "SysMain",          # Superfetch (useless on SSD, wastes RAM)
    "FontCache",        # Font Cache
    "W32Time",          # Windows Time (use NTP client instead)
    "XboxNetApiSvc",    # Xbox Live
    "XblAuthManager",   # Xbox Live Auth
    "XblGameSave",      # Xbox Game Save
    "DiagTrack",        # Connected User Experiences and Telemetry
    "dmwappushservice", # Device Management WAP Push
    "MapsBroker",       # Downloaded Maps Manager
    "lfsvc",            # Geolocation Service
    "wlidsvc"           # Microsoft Account Sign-in Assistant
)

foreach ($svc in $servicesToStop) {
    try {
        $service = Get-Service -Name $svc -ErrorAction SilentlyContinue
        if ($service -and $service.Status -eq 'Running') {
            Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
            Set-Service -Name $svc -StartupType Disabled -ErrorAction SilentlyContinue
            Write-Host "  Stopped+Disabled: $svc" -ForegroundColor Green
        } elseif ($service) {
            Set-Service -Name $svc -StartupType Disabled -ErrorAction SilentlyContinue
            Write-Host "  Disabled: $svc (not running)" -ForegroundColor Gray
        }
    } catch {
        # service may not exist, skip silently
    }
}

# IIS is already stopped - make sure it stays stopped
try {
    Set-Service -Name "W3SVC" -StartupType Disabled -ErrorAction SilentlyContinue
    Set-Service -Name "IISADMIN" -StartupType Disabled -ErrorAction SilentlyContinue
} catch { }

# ============================================
# Result
# ============================================
Write-Host ""
Write-Host "Waiting 5 seconds for memory to release..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Post-optimization snapshot
$os2 = Get-CimInstance Win32_OperatingSystem
$afterFree = [math]::Round($os2.FreePhysicalMemory/1MB, 2)
$freed = [math]::Round($afterFree - $beforeFree, 2)

Write-Host ""
Write-Host "=== Optimization Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Free RAM Before : ${beforeFree}GB" -ForegroundColor Yellow
Write-Host "Free RAM After  : ${afterFree}GB" -ForegroundColor Green
Write-Host "Memory Freed   : ${freed}GB" -ForegroundColor Green
Write-Host ""

# Show top processes after optimization
Write-Host "=== Top Processes After Optimization ===" -ForegroundColor Cyan
$procs = Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10
foreach ($p in $procs) {
    $memMB = [math]::Round($p.WorkingSet64/1MB,0)
    Write-Host "  $($p.ProcessName) (PID $($p.Id)): ${memMB}MB"
}

Write-Host ""
Write-Host "=== PM2 Services Health Check ===" -ForegroundColor Cyan
pm2 status
