# PhoneFarm TURN/STUN Server Startup Script
# Runs the Pion-based TURN server with credentials from environment variable
# This keeps the password out of process listings

$env:TURN_PASSWORD = "PuAp22dES6Ds43v8a5w"

$exe = "D:\coturn\phonefarm-turn-server.exe"
$logFile = "D:\coturn\turnserver.log"

Write-Output "Starting PhoneFarm TURN/STUN Server..."
Write-Output "Log: $logFile"

& $exe `
  -password $env:TURN_PASSWORD `
  -user phonefarm `
  -realm phone.openedskill.com `
  -port 3478 `
  2>&1 | Out-File -FilePath $logFile -Append
