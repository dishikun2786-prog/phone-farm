<#
.SYNOPSIS
  一键同步代码 + 仪表盘到 VPS 并重启服务
  执行方式: powershell -ExecutionPolicy Bypass -File sync-to-vps.ps1
#>
param(
  [string]$VpsIp = "47.243.254.248",
  [string]$VpsUser = "Administrator",
  [string]$SshKey = "E:\Program Files\www\phone\docs\vps-admin.key",
  [string]$VpsProjectPath = "C:\www\phone",
  [string]$LocalProjectPath = "E:\Program Files\www\phone",
  [string]$DashboardDist = "E:\Program Files\www\phone\dashboard\dist"
)

$ErrorActionPreference = "Stop"
$sshBase = "ssh -i `"$SshKey`" -o StrictHostKeyChecking=no"

Write-Host "=== [1/5] 同步后端代码 (git pull) ===" -ForegroundColor Cyan
Invoke-Expression "$sshBase ${VpsUser}@${VpsIp} 'cd $VpsProjectPath && git pull'"
Write-Host "Git pull 完成" -ForegroundColor Green

Write-Host "=== [2/5] 更新 VPS .env AI 配置 ===" -ForegroundColor Cyan
$envContent = @'
# ── DeepSeek V4 Flash (Anthropic Messages API) ──
DEEPSEEK_API_KEY=sk-234ab5238bf04fb4912d4f5899a0e6b0
DEEPSEEK_API_URL=https://api.deepseek.com/anthropic/messages
DEEPSEEK_MODEL=deepseek-v4-flash

# ── Qwen3-VL-Plus (DashScope / 百炼) ──
DASHSCOPE_API_KEY=sk-fca6e6e3c0c545d18bd58d1fbec1eb8a
DASHSCOPE_VL_MODEL=qwen3-vl-plus
'@

$envFile = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($envContent))
Invoke-Expression "$sshBase ${VpsUser}@${VpsIp} 'powershell -Command `"[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$envFile')) | Add-Content -Path $VpsProjectPath\control-server\.env`"'"

Write-Host "=== [3/5] npm install ===" -ForegroundColor Cyan
Invoke-Expression "$sshBase ${VpsUser}@${VpsIp} 'cd $VpsProjectPath\control-server && npm install'"

Write-Host "=== [4/5] 上传仪表盘静态文件 ===" -ForegroundColor Cyan
scp -i $SshKey -o StrictHostKeyChecking=no -r "$DashboardDist\*" "${VpsUser}@${VpsIp}:C:\www\dashboard\dist\"

Write-Host "=== [5/5] 重启 PM2 服务 ===" -ForegroundColor Cyan
Invoke-Expression "$sshBase ${VpsUser}@${VpsIp} 'cd $VpsProjectPath\control-server && pm2 reload phonefarm-control && pm2 status'"

Write-Host "`n=== 部署完成! ===" -ForegroundColor Green
Write-Host "验证: curl https://phone.opendedskill.com/api/v1/health" -ForegroundColor Yellow
