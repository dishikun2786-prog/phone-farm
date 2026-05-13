$ErrorActionPreference = "Stop"
$conf = @"
port 6379
bind 127.0.0.1
protected-mode yes
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error no
databases 16
appendonly no
maxmemory 512mb
maxmemory-policy noeviction
"@
$conf | Out-File -FilePath "C:\BtSoft\redis\redis.conf" -Encoding ascii -Force
sc.exe stop Redis 2>&1 | Out-Null
Start-Sleep 2
sc.exe start Redis 2>&1 | Out-Null
Start-Sleep 3
Write-Host "Redis restarted with noeviction policy"
