$ErrorActionPreference = "Stop"
Write-Host "=== PhoneFarm SSH Setup ==="

$pubKey = Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" -Raw

Write-Host "[1] Configuring administrators_authorized_keys..."
$adminKeysFile = "$env:PROGRAMDATA\ssh\administrators_authorized_keys"
$pubKey.Trim() | Out-File -FilePath $adminKeysFile -Encoding ascii -Force
icacls $adminKeysFile /inheritance:r /grant "Administrator:F" /grant "SYSTEM:F" 2>&1 | Out-Null
Write-Host "  OK: $adminKeysFile"

Write-Host "[2] Configuring user authorized_keys..."
$userKeysFile = "$env:USERPROFILE\.ssh\authorized_keys"
$pubKey.Trim() | Out-File -FilePath $userKeysFile -Encoding ascii -Force
Write-Host "  OK: $userKeysFile"

Write-Host "[3] Copying private key to project..."
Copy-Item "$env:USERPROFILE\.ssh\id_ed25519" "d:\www\phone\deploy\keys\vps-admin.key" -Force
Write-Host "  OK: d:\www\phone\deploy\keys\vps-admin.key"

Write-Host ""
Write-Host "=== Setup Complete ==="
Write-Host "Private key: d:\www\phone\deploy\keys\vps-admin.key"
Write-Host "SSH command: ssh -i vps-admin.key Administrator@47.243.254.248"
