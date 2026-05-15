# PhoneFarm VPS - Start all infrastructure services
Write-Host "=== Starting PhoneFarm Infrastructure ==="

# ============================================
# Redis
# ============================================
Write-Host "[Redis] Extracting and starting..."
$redisZip = "D:\redis-7.4.9-x64-windows.zip"
$redisDir = "D:\Redis"

# Clean up
Remove-Item $redisDir -Recurse -Force -ErrorAction SilentlyContinue

# Check zip type and extract
$zipBytes = [System.IO.File]::ReadAllBytes($redisZip)
if ($zipBytes[0] -eq 0x1F -and $zipBytes[1] -eq 0x8B) {
    Write-Host "  Detected gzip format"
    # Actually .zip starts with PK (0x50 0x4B)
}
# Try tar first (for msys2 zips that may be tar internally)
$tarResult = tar -xf $redisZip -C D:\ 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Extracted with tar"
    # Check what was extracted
    Get-ChildItem "D:\Redis-*" -Directory 2>$null | ForEach-Object {
        Write-Host "  Found: $($_.FullName)"
        Rename-Item $_.FullName "Redis" -Force
    }
} else {
    # Try Expand-Archive
    try {
        Expand-Archive -Path $redisZip -DestinationPath $redisDir -Force
        Write-Host "  Extracted with Expand-Archive"
    } catch {
        Write-Host "  Expand-Archive failed: $_"
    }
}

# Find redis-server.exe
$redisExe = Get-ChildItem $redisDir -Recurse -Filter "redis-server.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($redisExe) {
    Write-Host "  Found: $($redisExe.FullName)"
    $redisBinDir = $redisExe.DirectoryName

    # Create config in redis bin directory
    $confPath = Join-Path $redisBinDir "redis.conf"
    @"
port 6379
bind 127.0.0.1
requirepass redis_phonefarm_2024!
maxmemory 256mb
maxmemory-policy noeviction
save 900 1
save 300 10
save 60 10000
dir $($redisBinDir -replace '\\','\\')
logfile $($redisBinDir -replace '\\','\\')\\redis.log
"@ | Set-Content -Path $confPath -Encoding ASCII
    Write-Host "  Config created: $confPath"

    # Start Redis as background process
    $redisJob = Start-Process -FilePath $redisExe.FullName -ArgumentList $confPath -WindowStyle Hidden -PassThru
    Write-Host "  Redis started (PID: $($redisJob.Id))"
} else {
    Write-Host "  ERROR: redis-server.exe not found"
    Write-Host "  Directory contents:"
    Get-ChildItem $redisDir -Recurse -Depth 2 | ForEach-Object { Write-Host "    $($_.FullName)" }
}

# ============================================
# NATS Server
# ============================================
Write-Host "[NATS] Starting..."
$natsExe = "D:\NATS\nats-server.exe"
if (Test-Path $natsExe) {
    $natsJob = Start-Process -FilePath $natsExe -ArgumentList "-a 127.0.0.1 -p 4222" -WindowStyle Hidden -PassThru
    Write-Host "  NATS started (PID: $($natsJob.Id))"
} else {
    Write-Host "  ERROR: $natsExe not found"
}

# ============================================
# MinIO (re-download if missing)
# ============================================
Write-Host "[MinIO] Downloading and starting..."
$minioDir = "D:\MinIO"
$minioExe = "$minioDir\minio.exe"
New-Item -ItemType Directory -Path $minioDir -Force | Out-Null
New-Item -ItemType Directory -Path "$minioDir\data" -Force | Out-Null

if (-not (Test-Path $minioExe)) {
    Write-Host "  Downloading minio.exe..."
    curl -L -o $minioExe "https://dl.min.io/server/minio/release/windows-amd64/minio.exe" 2>&1
    if (Test-Path $minioExe) {
        Write-Host "  Downloaded ($((Get-Item $minioExe).Length) bytes)"
    }
}

if (Test-Path $minioExe) {
    $env:MINIO_ROOT_USER = "minioadmin"
    $env:MINIO_ROOT_PASSWORD = "minioadmin"
    $minioJob = Start-Process -FilePath $minioExe -ArgumentList "server D:\MinIO\data --address :9000 --console-address :9001" -WindowStyle Hidden -PassThru
    Write-Host "  MinIO started (PID: $($minioJob.Id))"
}

# ============================================
# Wait and verify
# ============================================
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "=== Port Verification ==="
netstat -ano | Select-String "6379|4222|9000|9001|5432" | ForEach-Object { Write-Host $_ }

Write-Host ""
Write-Host "=== Starting phonefarm-control via PM2 ==="
Set-Location D:\www\phone\control-server
pm2 start ecosystem.config.cjs --only phonefarm-control 2>&1 | Out-Host
pm2 save 2>&1 | Out-Host

Write-Host ""
Write-Host "=== PM2 Status ==="
pm2 status
