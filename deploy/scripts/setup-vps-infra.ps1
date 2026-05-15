# PhoneFarm VPS Infrastructure Setup Script
Write-Host "=== PhoneFarm VPS Infrastructure Setup ==="
Write-Host ""

# ============================================
# 1. PostgreSQL - Migration only (DB already exists)
# ============================================
Write-Host "[1/6] PostgreSQL - Applying migrations..."
$env:PGPASSWORD = "123456"
$PG_BIN = "C:\Program Files\PostgreSQL\18\bin"

$migrationFile = "D:\www\phone\control-server\migrations\0000_initial.sql"
if (Test-Path $migrationFile) {
    $output = & $PG_BIN\psql.exe -U postgres -d phonefarm -f $migrationFile 2>&1 | Out-String
    if ($output -match "ERROR") {
        Write-Host "  Some tables may already exist (harmless)"
    } else {
        Write-Host "  Migration applied successfully."
    }
} else {
    Write-Host "  WARNING: Migration file not found"
}

# ============================================
# 2. Redis
# ============================================
Write-Host "[2/6] Redis - Setting up..."
$redisDir = "D:\Redis"

# Move from nested redis folder if needed
if (Test-Path "D:\Redis\redis\redis-server.exe") {
    Copy-Item -Path "D:\Redis\redis\*" -Destination "D:\Redis\" -Recurse -Force
    Remove-Item -Path "D:\Redis\redis\" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Moved Redis files to D:\Redis\"
}

# Find redis-server.exe
$redisServer = Get-ChildItem -Path $redisDir -Recurse -Filter "redis-server.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($redisServer) {
    Write-Host "  redis-server found: $($redisServer.FullName)"
} else {
    Write-Host "  ERROR: redis-server.exe not found!"
    Get-ChildItem $redisDir -Recurse -Depth 2 | ForEach-Object { Write-Host "    $($_.FullName)" }
}

# Create redis config
$redisConfPath = "$redisDir\redis.conf"
if (-not (Test-Path $redisConfPath)) {
@"
port 6379
bind 127.0.0.1
requirepass redis_phonefarm_2024!
maxmemory 256mb
maxmemory-policy noeviction
save 900 1
save 300 10
save 60 10000
dir D:\Redis\data
logfile D:\Redis\redis.log
"@ | Set-Content -Path $redisConfPath -Encoding UTF8
    New-Item -ItemType Directory -Path "$redisDir\data" -Force | Out-Null
    Write-Host "  redis.conf created"
} else {
    Write-Host "  redis.conf already exists"
}

# ============================================
# 3. NATS Server
# ============================================
Write-Host "[3/6] NATS Server - Setting up..."
$natsDir = "D:\NATS"

if (Test-Path "D:\nats-server.zip") {
    $zipSize = (Get-Item "D:\nats-server.zip").Length
    if ($zipSize -gt 100000) {
        Expand-Archive -Path "D:\nats-server.zip" -DestinationPath $natsDir -Force
        Write-Host "  NATS extracted"
    }
}

# Find nats-server.exe and flatten
$natsExe = Get-ChildItem -Path $natsDir -Recurse -Filter "nats-server.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($natsExe) {
    if ($natsExe.DirectoryName -ne $natsDir) {
        Move-Item -Path $natsExe.FullName -Destination "$natsDir\nats-server.exe" -Force
    }
    Write-Host "  nats-server.exe ready: $natsDir\nats-server.exe"
} else {
    Write-Host "  ERROR: nats-server.exe not found"
    Get-ChildItem $natsDir -Recurse -Depth 2 | ForEach-Object { Write-Host "    $($_.FullName)" }
}

# ============================================
# 4. MinIO
# ============================================
Write-Host "[4/6] MinIO - Setting up..."
$minioDir = "D:\MinIO"
$minioData = "$minioDir\data"
New-Item -ItemType Directory -Path $minioData -Force | Out-Null

if (Test-Path "$minioDir\minio.exe") {
    Write-Host "  minio.exe ready"
} else {
    Write-Host "  WARNING: minio.exe not found (download may have failed)"
}

# ============================================
# 5. PhoneFarm .env
# ============================================
Write-Host "[5/6] Configuring phonefarm .env..."

$envPath = "D:\www\phone\control-server\.env"
$envDir = Split-Path $envPath -Parent
if (-not (Test-Path $envDir)) {
    New-Item -ItemType Directory -Path $envDir -Force | Out-Null
}

# Read existing .env if present and merge API keys
$existingKeys = @{}
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^([A-Z_]+)=(.*)') {
            $existingKeys[$Matches[1]] = $Matches[2]
        }
    }
}

# Use existing API keys or defaults
$deepseekKey = if ($existingKeys.ContainsKey('DEEPSEEK_API_KEY')) { $existingKeys['DEEPSEEK_API_KEY'] } else { 'sk-placeholder' }
$dashscopeKey = if ($existingKeys.ContainsKey('DASHSCOPE_API_KEY')) { $existingKeys['DASHSCOPE_API_KEY'] } else { 'sk-placeholder' }
$jwtSecret = if ($existingKeys.ContainsKey('JWT_SECRET')) { $existingKeys['JWT_SECRET'] } else { 'phonefarm-jwt-secret-vps-2024-change-in-production' }
$deviceToken = if ($existingKeys.ContainsKey('DEVICE_AUTH_TOKEN')) { $existingKeys['DEVICE_AUTH_TOKEN'] } else { 'device-auth-token-vps-2024-change-in-production' }
$controlToken = if ($existingKeys.ContainsKey('CONTROL_TOKEN')) { $existingKeys['CONTROL_TOKEN'] } else { 'control-token-vps-2024-change-in-production' }
$aiToken = if ($existingKeys.ContainsKey('AI_AUTH_TOKEN')) { $existingKeys['AI_AUTH_TOKEN'] } else { 'ai-auth-token-vps-2024-change-in-production' }

@"
PORT=8443
HOST=127.0.0.1
NODE_ENV=production
DATABASE_URL=postgresql://postgres:pg_phonefarm_2024!@localhost:5432/phonefarm
REDIS_URL=redis://default:redis_phonefarm_2024!@localhost:6379
JWT_SECRET=$jwtSecret
DEVICE_AUTH_TOKEN=$deviceToken
CONTROL_TOKEN=$controlToken
AI_AUTH_TOKEN=$aiToken
DEEPSEEK_API_KEY=$deepseekKey
DEEPSEEK_API_URL=https://api.deepseek.com/anthropic
DEEPSEEK_MODEL=deepseek-v4-flash
DASHSCOPE_API_KEY=$dashscopeKey
DASHSCOPE_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
DASHSCOPE_VL_MODEL=qwen3-vl-plus
NATS_URL=nats://localhost:4222
NATS_TOKEN=
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
TURN_SERVER_URL=turn:phone.openedskill.com:3478
TURN_USERNAME=phonefarm
TURN_CREDENTIAL=phonefarm-turn
RELAY_PORT=8499
UDP_RELAY_PORT=8444
FF_DECISION_ENGINE=true
FF_QWEN_VL_FALLBACK=true
FF_WEBRTC_P2P=true
FF_NATS_SYNC=true
FF_RAY_SCHEDULER=false
FF_STREAM_ON_DEMAND=true
FF_CROSS_DEVICE_MEMORY=false
FF_LEGACY_VLM=false
FF_FEDERATED_LEARNING=false
FF_P2P_GROUP_CONTROL=false
FF_MODEL_HOT_UPDATE=false
SCRCPY_MAX_SIZE=1080
SCRCPY_BIT_RATE=4000000
SCRCPY_MAX_FPS=30
STREAM_IDLE_TIMEOUT_SEC=300
STREAM_MAX_DURATION_SEC=1800
"@ | Set-Content -Path $envPath -Encoding UTF8
Write-Host "  .env written to $envPath"

# ============================================
# 6. Install npm dependencies
# ============================================
Write-Host "[6/6] Installing control-server npm dependencies..."
Set-Location D:\www\phone\control-server
$npmResult = npm install 2>&1 | Out-String
if ($LASTEXITCODE -eq 0) {
    Write-Host "  npm install completed"
} else {
    Write-Host "  WARNING: npm install had errors"
    Write-Host $npmResult
}

Write-Host ""
Write-Host "=== Setup Complete ==="
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Start Redis:    D:\Redis\redis-server.exe D:\Redis\redis.conf"
Write-Host "  2. Start NATS:     D:\NATS\nats-server.exe -a 127.0.0.1 -p 4222"
Write-Host "  3. Start MinIO:    D:\MinIO\minio.exe server D:\MinIO\data --address :9000 --console-address :9001"
Write-Host "  4. Start PhoneFarm: pm2 start ecosystem.config.cjs (from D:\www\phone\control-server)"
