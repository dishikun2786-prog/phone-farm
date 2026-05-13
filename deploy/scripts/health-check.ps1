# PhoneFarm 服务器健康监控脚本 v3
# 用法: powershell -File health-check.ps1 [-Alert]

param([switch]$Alert = $false)

$ErrorActionPreference = "SilentlyContinue"
$ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$issues = @()

Write-Host "=== PhoneFarm Health $ts ==="

# 1. PM2
Write-Host ""
Write-Host "--- PM2 ---"
$pm2Json = pm2 jlist 2>&1 | ConvertFrom-Json 2>$null
if ($pm2Json) {
    $names = @('phonefarm-control','phonefarm-relay')
    foreach ($n in $names) {
        $p = $pm2Json | Where-Object { $_.name -eq $n }
        if ($p) {
            $s = $p.pm2_env.status
            $c = if ($s -eq 'online') {'Green'} else {'Red'}
            Write-Host "  $n : $s" -ForegroundColor $c
            if ($s -ne 'online') { $issues += "[CRITICAL] PM2 $n $s" }
        } else {
            Write-Host "  $n : NOT FOUND" -ForegroundColor Red
            $issues += "[CRITICAL] PM2 $n not found"
        }
    }
} else {
    Write-Host "  Cannot parse PM2 output" -ForegroundColor Yellow
}

# 2. Ports
Write-Host "--- Ports ---"
$n = (netstat -ano 2>$null | Out-String) -replace '\s+',' '
@(@{port=8443;label='Control'},@{port=8499;label='Relay'},@{port=5432;label='PG'},@{port=6379;label='Redis'}) | %{
    $ok = $n -match ":$($_.port) .*LISTENING"
    $c = if ($ok) {'Green'} else {'Red'}
    $s = if ($ok) {'UP'} else {'DOWN'}
    Write-Host "  $($_.label):$($_.port) $s" -ForegroundColor $c
    if (-not $ok) { $issues += "[CRITICAL] $($_.label) DOWN" }
}

# 3. APIs
Write-Host "--- APIs ---"
@{N='Health';U='http://localhost:8443/api/v1/health'},@{N='Devices';U='http://localhost:8443/api/v1/devices'},@{N='Groups';U='http://localhost:8443/api/v1/groups'},@{N='VLM';U='http://localhost:8443/api/v1/vlm/models'} | %{
    try { Invoke-RestMethod -Uri $_.U -TimeoutSec 10 | Out-Null; Write-Host "  $($_.N): OK" -ForegroundColor Green }
    catch { Write-Host "  $($_.N): FAIL" -ForegroundColor Red; $issues += "[ERROR] $($_.N) failed" }
}

# 4. Disk
$f = [math]::Round((Get-PSDrive C).Free/1GB,1)
Write-Host "--- Disk: ${f}GB free ---"
if ($f -lt 2) { $issues += "[WARN] Disk <2GB" }

# 5. Memory
$os = Get-CimInstance Win32_OperatingSystem
$pct = [math]::Round($os.FreePhysicalMemory/$os.TotalVisibleMemorySize*100)
Write-Host "--- Memory: ${pct}% free ---"
if ($pct -lt 10) { $issues += "[WARN] Memory <10%" }

# 6. Logs
$log = "D:\www\phone\control-server\logs\control-error.log"
if (Test-Path $log) {
    $c = (Get-Content $log -Tail 20 | Select-String 'TypeError|FATAL|CRITICAL' | Measure-Object).Count
    Write-Host "--- Log: $c recent errors ---"
    if ($c -gt 0) { $issues += "[WARN] $c errors in logs" }
}

# Summary
Write-Host ""
Write-Host "========================================"
if ($issues.Count -eq 0) {
    Write-Host "  ALL HEALTHY" -ForegroundColor Green
} else {
    Write-Host "  $($issues.Count) ISSUES:" -ForegroundColor Red
    $issues | %{ Write-Host "  $_" -ForegroundColor Yellow }
    if ($Alert) { pm2 resurrect 2>&1 | Out-Null }
}
Write-Host "========================================"
