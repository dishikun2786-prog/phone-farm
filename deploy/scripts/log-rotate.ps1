# PhoneFarm 日志轮转清理脚本
# 用法: powershell -File log-rotate.ps1
# 建议: 每天凌晨3点运行

$ErrorActionPreference = "Stop"
$LOG_DIR = "D:\www\phone\control-server\logs"
$MAX_LOG_AGE_DAYS = 7
$MAX_LOG_SIZE_MB = 100

Write-Host "=== Log Rotate $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="

if (-not (Test-Path $LOG_DIR)) {
    Write-Host "Log directory not found: $LOG_DIR"
    exit 0
}

# Archive logs older than 1 day
$archiveDir = Join-Path $LOG_DIR "archive"
if (-not (Test-Path $archiveDir)) {
    New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
}

$now = Get-Date
$rotated = 0
$cleaned = 0

Get-ChildItem $LOG_DIR\*.log | ForEach-Object {
    $sizeMB = [math]::Round($_.Length / 1MB, 1)
    $ageDays = ($now - $_.LastWriteTime).Days

    if ($sizeMB -gt $MAX_LOG_SIZE_MB -or $ageDays -gt 1) {
        $archiveName = "$($_.BaseName)-$($now.ToString('yyyyMMdd')).log"
        $archivePath = Join-Path $archiveDir $archiveName
        Move-Item $_.FullName $archivePath -Force
        Write-Host "  Archived: $($_.Name) ($sizeMB MB) -> archive/$archiveName"
        $rotated++
        
        # Create new empty log file
        New-Item -ItemType File -Path $_.FullName -Force | Out-Null
    }
}

# Clean old archives
Get-ChildItem $archiveDir\*.log | Where-Object {
    ($now - $_.LastWriteTime).Days -gt $MAX_LOG_AGE_DAYS
} | ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Host "  Deleted old archive: $($_.Name)"
    $cleaned++
}

# Flush PM2 logs
pm2 flush 2>&1 | Out-Null

Write-Host "Done: $rotated rotated, $cleaned cleaned."
