$ErrorActionPreference = "Stop"
Write-Host "=== Redis Upgrade Script ==="

$srcDir = (Get-ChildItem "D:\www\phone\deploy\scripts\redis-7.4.3-extracted" -Directory | Select-Object -First 1).FullName
Write-Host "Source: $srcDir"
Write-Host "Target: C:\BtSoft\redis"

Write-Host "[1/5] Copying new Redis 7.4.3 files..."
Get-ChildItem "$srcDir\*" | ForEach-Object {
    Copy-Item $_.FullName "C:\BtSoft\redis\" -Recurse -Force
}
Write-Host "  Done."

Write-Host "[2/5] Migrating dump.rdb..."
if (Test-Path "C:\BtSoft\redis-old\dump.rdb") {
    Copy-Item "C:\BtSoft\redis-old\dump.rdb" "C:\BtSoft\redis\" -Force
    Write-Host "  dump.rdb migrated."
} else {
    Write-Host "  No dump.rdb found, skipping."
}

Write-Host "[3/5] Creating redis.conf..."
$newConf = @"
port 6379
bind 127.0.0.1
protected-mode yes
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error no
databases 16
appendonly no
maxmemory 256mb
maxmemory-policy volatile-lru
dir "C:\BtSoft\redis"
"@
$newConf | Out-File -FilePath "C:\BtSoft\redis\redis.conf" -Encoding ascii -Force
Write-Host "  redis.conf created."

Write-Host "[4/5] Re-registering Redis Windows service..."
$bpath = "`"C:\BtSoft\redis\RedisService.exe`""
sc.exe delete Redis 2>&1 | Out-Null
Start-Sleep 1
sc.exe create Redis binpath= $bpath start= auto 2>&1 | Out-Null
Write-Host "  Service registered."

Write-Host "[5/5] Starting Redis service..."
sc.exe start Redis 2>&1 | Out-Null
Start-Sleep 3

$svc = Get-Service redis -ErrorAction SilentlyContinue
Write-Host "  Redis service status: $($svc.Status)"

Write-Host "=== Done ==="
