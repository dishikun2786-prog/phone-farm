$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor

Write-Host "=== VPS Resource Analysis ==="
Write-Host ""
Write-Host "OS      : $($os.Caption)"
Write-Host "CPU     : $($cpu.Name)"
Write-Host "Cores   : $($cpu.NumberOfLogicalProcessors) logical"
Write-Host "CPU Load: $($cpu.LoadPercentage)%"
Write-Host ""
Write-Host "Total RAM : $([math]::Round($cs.TotalPhysicalMemory/1GB,1)) GB"
Write-Host "Free RAM  : $([math]::Round($os.FreePhysicalMemory/1MB,2)) GB"
Write-Host "Used RAM  : $([math]::Round(($cs.TotalPhysicalMemory - $os.FreePhysicalMemory*1KB)/1GB,2)) GB"
Write-Host "Free VM   : $([math]::Round($os.FreeVirtualMemory/1MB,2)) GB"
Write-Host ""

$procs = Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15
Write-Host "=== Top 15 Processes by Memory ==="
foreach ($p in $procs) {
    $memMB = [math]::Round($p.WorkingSet64/1MB,0)
    Write-Host "  $($p.ProcessName) (PID $($p.Id)): ${memMB}MB"
}

Write-Host ""
Write-Host "=== PM2 Services Memory ==="
pm2 status 2>$null | Select-String "online|stopped|errored"

Write-Host ""
Write-Host "=== Docker/WSL Check ==="
try { docker --version 2>$null } catch { Write-Host "Docker: NOT installed" }
try { wsl --version 2>$null } catch { Write-Host "WSL: NOT installed" }

$diskC = Get-PSDrive C -ErrorAction SilentlyContinue
$diskD = Get-PSDrive D -ErrorAction SilentlyContinue
if ($diskC) { Write-Host "C: Free $([math]::Round($diskC.Free/1GB,1)) GB / $([math]::Round(($diskC.Used+$diskC.Free)/1GB,1)) GB" }
if ($diskD) { Write-Host "D: Free $([math]::Round($diskD.Free/1GB,1)) GB / $([math]::Round(($diskD.Used+$diskD.Free)/1GB,1)) GB" }
