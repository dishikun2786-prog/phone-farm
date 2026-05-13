# PhoneFarm 自动化守护 - 配置 Windows 计划任务
# 用法: 以管理员身份运行 powershell -File setup-scheduler.ps1

Write-Host "=== PhoneFarm Task Scheduler Setup ===" -ForegroundColor Cyan

$SCRIPTS = "D:\www\phone\deploy\scripts"
$pwsh = (Get-Command powershell.exe).Source

# 1. Health check every 5 minutes
$healthAction = New-ScheduledTaskAction -Execute $pwsh `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$SCRIPTS\health-check.ps1`" -Alert"
$healthTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
$healthSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable
Register-ScheduledTask -TaskName "PhoneFarm-HealthCheck" -Action $healthAction -Trigger $healthTrigger -Settings $healthSettings -Description "PhoneFarm health monitoring every 5 min" -Force | Out-Null
Write-Host "  [OK] HealthCheck - every 5 minutes" -ForegroundColor Green

# 2. Log rotation daily at 3:00 AM
$logAction = New-ScheduledTaskAction -Execute $pwsh `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$SCRIPTS\log-rotate.ps1`""
$logTrigger = New-ScheduledTaskTrigger -Daily -At "03:00"
$logSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "PhoneFarm-LogRotate" -Action $logAction -Trigger $logTrigger -Settings $logSettings -Description "PhoneFarm log rotation daily" -Force | Out-Null
Write-Host "  [OK] LogRotate   - daily at 3:00 AM" -ForegroundColor Green

# 3. PM2 resurrect on system boot (ensure PM2 saved)
$pm2ResAction = New-ScheduledTaskAction -Execute $pwsh `
    -Argument "-NoProfile -Command `"pm2 resurrect`""
$pm2ResTrigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "PhoneFarm-PM2Resurrect" -Action $pm2ResAction -Trigger $pm2ResTrigger -Settings (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries) -Description "PM2 resurrect on boot" -Force | Out-Null
Write-Host "  [OK] PM2Resurrect - on system boot" -ForegroundColor Green

# Save current PM2 process list
pm2 save 2>&1 | Out-Null
Write-Host "  [OK] PM2 process list saved" -ForegroundColor Green

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host "Scheduled tasks:"
Get-ScheduledTask -TaskName "PhoneFarm-*" | Select-Object TaskName,State | Format-Table -AutoSize
