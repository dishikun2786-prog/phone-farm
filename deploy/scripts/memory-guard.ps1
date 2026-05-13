# PhoneFarm 智能内存守护 PowerShell 脚本
# 独立于 Node.js 调度器运行，作为最后防线
# 触发条件: 内存 > 95% 且 Node.js 调度器可能未响应
# 计划任务: 每2分钟运行一次

$ErrorActionPreference = "SilentlyContinue"

$ts = Get-Date -Format 'HH:mm:ss'
$os = Get-CimInstance Win32_OperatingSystem
$totalMB = [math]::Round($os.TotalVisibleMemorySize / 1024)
$freeMB = [math]::Round($os.FreePhysicalMemory / 1024)
$pct = [math]::Round(($totalMB - $freeMB) / $totalMB * 100, 1)

$PROCESS_PRIORITIES = @{
    'phonefarm-control' = @{ priority = 1; desc = 'PhoneFarm 控制服务器' }
    'phonefarm-relay'   = @{ priority = 1; desc = 'PhoneFarm 中继服务器' }
    'shengri-api'       = @{ priority = 2; desc = '生日 API 服务' }
    'shengri-web'       = @{ priority = 2; desc = '生日 Web 前端' }
    'shengri-admin'     = @{ priority = 3; desc = '生日 管理后台' }
    'shengri-calendar'  = @{ priority = 3; desc = '生日 日历引擎' }
}

Write-Host "[$ts] Memory: ${pct}% (free ${freeMB}MB/${totalMB}MB)"

if ($pct -lt 85) {
    exit 0
}

Write-Host "[$ts] WARNING: Memory high (${pct}%)" -ForegroundColor Yellow

if ($pct -ge 97) {
    $targets = @('shengri-calendar', 'shengri-admin')
    Write-Host "[$ts] CRITICAL: Pausing P3 services to prevent OOM" -ForegroundColor Red
} elseif ($pct -ge 92) {
    $targets = @('shengri-calendar')
    Write-Host "[$ts] HIGH: Pausing calendar service" -ForegroundColor Yellow
} else {
    Write-Host "[$ts] Monitoring... no action needed yet" -ForegroundColor Green
    exit 0
}

foreach ($name in $targets) {
    try {
        $status = pm2 show $name 2>&1 | Select-String 'status'
        if ($status -match 'online') {
            pm2 stop $name 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "[$ts] ✓ Paused $name" -ForegroundColor Green
            }
        } else {
            Write-Host "[$ts] - $name already stopped" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "[$ts] ✗ Failed to stop $name : $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep 1
}

$os2 = Get-CimInstance Win32_OperatingSystem
$free2 = [math]::Round($os2.FreePhysicalMemory / 1024)
$pct2 = [math]::Round(($totalMB - $free2) / $totalMB * 100, 1)
Write-Host "[$ts] After action: ${pct2}% (freed ~$($free2 - $freeMB)MB)"
