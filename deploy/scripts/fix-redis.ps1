$ErrorActionPreference = "Stop"
Write-Host "=== Fix Redis Config and Start ==="

$redisConf = @"
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
"@

$redisConf | Out-File -FilePath "C:\BtSoft\redis\redis.conf" -Encoding ascii -Force -ErrorAction Stop
Write-Host "Config written."

sc.exe stop Redis 2>&1 | Out-Null
Start-Sleep 2

sc.exe delete Redis 2>&1 | Out-Null
Start-Sleep 1

$svcBin = "`"C:\BtSoft\redis\RedisService.exe`""
sc.exe create Redis binpath= $svcBin start= auto 2>&1 | Out-Null
sc.exe start Redis 2>&1 | Out-Null
Start-Sleep 4

$svc = Get-Service redis -ErrorAction SilentlyContinue
Write-Host "Service: $($svc.Status)"

netstat -ano | findstr ":6379"
Write-Host "=== Done ==="
