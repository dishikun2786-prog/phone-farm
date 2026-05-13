# PhoneFarm Full Stack Automated Deployment Script
# Builds and deploys all components: control-server, dashboard, edge-node, K8s
# Usage: powershell -File deploy-fullstack.ps1 [-Environment dev|staging|production] [-SkipBuild] [-SkipK8s] [-SkipSmokeTest]
param(
    [ValidateSet("dev", "staging", "production")]
    [string]$Environment = "dev",
    [switch]$SkipBuild = $false,
    [switch]$SkipK8s = $false,
    [switch]$SkipSmokeTest = $false,
    [switch]$RollbackOnFailure = $false,
    [string]$KubeContext = ""
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$DeployId = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PhoneFarm Full-Stack Deploy" -ForegroundColor Cyan
Write-Host "  Environment: $Environment" -ForegroundColor Cyan
Write-Host "  Deploy ID:   $DeployId" -ForegroundColor Cyan
Write-Host "  Time:        $timestamp" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

function Step($msg) {
    Write-Host ">>> $msg" -ForegroundColor Yellow
}

function Success($msg) {
    Write-Host "  OK: $msg" -ForegroundColor Green
}

function Warn($msg) {
    Write-Host "  WARN: $msg" -ForegroundColor Yellow
}

function Fail($msg) {
    Write-Host "  FAIL: $msg" -ForegroundColor Red
}

$deployStart = Get-Date

# ============================================================================
# 1. Prerequisite Checks
# ============================================================================
Step "1/9 — Checking prerequisites..."

$prereqs = @{
    "Node.js" = $false
    "Go"      = $false
    "Python"  = $false
    "Docker"  = $false
    "kubectl" = $false
    "PM2"     = $false
}

try { $v = (& node --version 2>&1).Trim(); $prereqs["Node.js"] = $true; Success "Node.js $v" } catch { Warn "Node.js not found" }
try { $v = (& go version 2>&1).Trim(); $prereqs["Go"] = $true; Success "Go $v" } catch { Warn "Go not found (edge-node build skipped)" }
try { $v = (& python --version 2>&1).Trim(); $prereqs["Python"] = $true; Success "Python $v" } catch { Warn "Python not found" }
try { $v = (& docker --version 2>&1).Trim(); $prereqs["Docker"] = $true; Success "Docker $v" } catch { Warn "Docker not found" }
try { $v = (& kubectl version --client --output json 2>&1 | ConvertFrom-Json).clientVersion.gitVersion; $prereqs["kubectl"] = $true; Success "kubectl $v" } catch { Warn "kubectl not found (K8s deployment skipped)" }
try { & pm2 --version 2>&1 | Out-Null; $prereqs["PM2"] = $true; Success "PM2 installed" } catch { Warn "PM2 not found" }

Write-Host ""

# ============================================================================
# 2. Build Control Server (TypeScript)
# ============================================================================
if (-not $SkipBuild) {
    Step "2/9 — Building control-server (TypeScript)..."

    Set-Location "$ROOT\control-server"

    Write-Host "  Installing dependencies..."
    npm install --no-audit --no-fund 2>&1 | Select-Object -Last 3

    Write-Host "  TypeScript type check..."
    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) {
        Fail "TypeScript compilation failed"
        if ($RollbackOnFailure) { throw "TypeScript build failed" }
        Warn "Continuing (tsx can run .ts directly)..."
    } else {
        Success "TypeScript check passed"
    }

    Write-Host "  Compiling to dist..."
    npx tsc 2>&1 | Select-Object -Last 2
    if ($LASTEXITCODE -ne 0) {
        Warn "tsc build had issues (tsx handles .ts runtime)"
    } else {
        Success "control-server built"
    }
} else {
    Step "2/9 — Skipping control-server build"
}

# ============================================================================
# 3. Build Dashboard (Vite + React)
# ============================================================================
if (-not $SkipBuild) {
    Step "3/9 — Building dashboard (Vite + React)..."

    Set-Location "$ROOT\dashboard"

    Write-Host "  Installing dependencies..."
    npm install --no-audit --no-fund 2>&1 | Select-Object -Last 3

    Write-Host "  Vite production build..."
    npm run build 2>&1 | Select-Object -Last 5
    if ($LASTEXITCODE -ne 0) {
        Fail "Dashboard build failed"
        if ($RollbackOnFailure) { throw "Dashboard build failed" }
        exit 1
    }
    Success "Dashboard built to dist/"
} else {
    Step "3/9 — Skipping dashboard build"
}

# ============================================================================
# 4. Build Go Edge Node
# ============================================================================
if (-not $SkipBuild) {
    Step "4/9 — Building Go edge node..."

    $edgeNodeDir = "$ROOT\edge-node"
    if (Test-Path "$edgeNodeDir\cmd\main.go") {
        Set-Location $edgeNodeDir

        $outputName = if ($env:OS -eq "Windows_NT") { "edge-node.exe" } else { "edge-node" }
        Write-Host "  Building for current platform..."
        go build -o $outputName -ldflags "-s -w" ./cmd/ 2>&1
        if ($LASTEXITCODE -ne 0) {
            Warn "Go build failed — will use prebuilt container image for edge node"
        } else {
            $fileInfo = Get-Item $outputName
            Success "edge-node built ($([math]::Round($fileInfo.Length / 1MB, 1))MB)"
        }
    } else {
        Warn "edge-node source not found at $edgeNodeDir\cmd\main.go"
    }
} else {
    Step "4/9 — Skipping edge node build"
}

# ============================================================================
# 5. Setup Python AI Environment
# ============================================================================
if (-not $SkipBuild) {
    Step "5/9 — Setting up Python AI environment..."

    $pythonDirs = @("$ROOT\ai-server", "$ROOT\edge-node\ai")
    $pythonDir = $null
    foreach ($dir in $pythonDirs) {
        if (Test-Path "$dir\requirements.txt") {
            $pythonDir = $dir
            break
        }
    }

    if ($pythonDir) {
        Set-Location $pythonDir

        if (-not (Test-Path "$pythonDir\venv")) {
            Write-Host "  Creating Python virtual environment..."
            python -m venv venv 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Success "venv created"
            } else {
                Warn "venv creation failed"
            }
        } else {
            Success "venv already exists"
        }

        if (Test-Path "$pythonDir\venv\Scripts\pip.exe") {
            Write-Host "  Installing Python packages..."
            & "$pythonDir\venv\Scripts\pip.exe" install -r requirements.txt --quiet 2>&1 | Select-Object -Last 3
            Success "Python dependencies installed"
        } elseif (Test-Path "$pythonDir\venv\bin\pip") {
            Write-Host "  Installing Python packages..."
            & "$pythonDir\venv\bin\pip" install -r requirements.txt --quiet 2>&1 | Select-Object -Last 3
            Success "Python dependencies installed"
        }
    } else {
        Warn "No Python AI service (requirements.txt) found"
    }
} else {
    Step "5/9 — Skipping Python setup"
}

# ============================================================================
# 6. Apply Kubernetes Configurations
# ============================================================================
if (-not $SkipK8s -and $Environment -ne "dev") {
    Step "6/9 — Applying Kubernetes configurations..."

    if (-not $prereqs["kubectl"]) {
        Warn "kubectl not available — skipping K8s deployment"
    } else {
        $k8sBaseDir = "$ROOT\deploy\k8s"
        $namespace = if ($Environment -eq "production") { "phonefarm-prod" } else { "phonefarm-staging" }

        if ($KubeContext) {
            Write-Host "  Switching kubectl context to: $KubeContext"
            kubectl config use-context $KubeContext 2>&1 | Out-Null
        }

        Write-Host "  Creating namespace: $namespace..."
        kubectl create namespace $namespace --dry-run=client -o yaml | kubectl apply -f - 2>&1

        try {
            Write-Host "  Applying Kustomize overlay: $Environment..."
            $overlayPath = "$k8sBaseDir\overlays\$Environment"
            if (Test-Path $overlayPath) {
                kubectl apply -k $overlayPath -n $namespace 2>&1
            } else {
                Write-Host "  Applying base resources directly..."
                kubectl apply -k "$k8sBaseDir\base" -n $namespace 2>&1
            }
            Success "K8s configurations applied"

            Write-Host ""
            Write-Host "  Waiting for rollouts (timeout: 300s each)..."

            $resources = @(
                @{Type="deployment"; Name="phonefarm-control-server"},
                @{Type="deployment"; Name="phonefarm-edge-node"},
                @{Type="deployment"; Name="phonefarm-python-ai"},
                @{Type="statefulset"; Name="phonefarm-nats"},
                @{Type="statefulset"; Name="phonefarm-minio"}
            )

            foreach ($res in $resources) {
                try {
                    kubectl rollout status $res.Type/$res.Name -n $namespace --timeout=300s 2>&1 | Out-Null
                    Success "$($res.Type)/$($res.Name) ready"
                } catch {
                    Warn "$($res.Type)/$($res.Name) not ready within timeout"
                }
            }

            Write-Host ""
            Write-Host "  Pod status:" -ForegroundColor Cyan
            kubectl get pods -n $namespace
            Write-Host ""
        } catch {
            Fail "K8s deployment failed: $($_.Exception.Message)"
            if ($RollbackOnFailure) {
                Step "Rolling back K8s deployments..."
                kubectl rollout undo deployment -n $namespace --all 2>&1 | Out-Null
                kubectl rollout undo statefulset -n $namespace --all 2>&1 | Out-Null
                Success "Rollback initiated"
            }
        }
    }
} else {
    if ($Environment -eq "dev") {
        Step "6/9 — Skipping K8s (environment=dev)"
    } else {
        Step "6/9 — Skipping K8s deployment (--SkipK8s)"
    }
}

# ============================================================================
# 7. Build Docker Images (if Docker available)
# ============================================================================
if (-not $SkipBuild -and $prereqs["Docker"] -and $Environment -ne "dev") {
    Step "7/9 — Building Docker images..."

    $tag = if ($Environment -eq "production") { "stable" } else { "latest" }

    # Control server image
    if (Test-Path "$ROOT\control-server\Dockerfile") {
        Write-Host "  Building control-server:$tag..."
        docker build -t "phonefarm/control-server:$tag" "$ROOT\control-server" 2>&1 | Select-Object -Last 2
        if ($LASTEXITCODE -eq 0) { Success "control-server:$tag built" } else { Warn "control-server:$tag build failed" }
    }

    # Edge node image
    if (Test-Path "$ROOT\edge-node\Dockerfile") {
        Write-Host "  Building edge-node:$tag..."
        docker build -t "phonefarm/edge-node:$tag" "$ROOT\edge-node" 2>&1 | Select-Object -Last 2
        if ($LASTEXITCODE -eq 0) { Success "edge-node:$tag built" } else { Warn "edge-node:$tag build failed" }
    }
} else {
    Step "7/9 — Skipping Docker image builds"
}

# ============================================================================
# 8. Reload/Start Services
# ============================================================================
Step "8/9 — Restarting local services..."

if ($prereqs["PM2"]) {
    Set-Location "$ROOT\control-server"

    try {
        pm2 reload ecosystem.config.cjs --update-env 2>&1
        if ($LASTEXITCODE -eq 0) {
            Success "PM2 services reloaded (zero-downtime)"
        } else {
            pm2 restart phonefarm-control phonefarm-relay 2>&1
            Success "PM2 services restarted"
        }
    } catch {
        Warn "PM2 operation failed — services may need manual start"
    }
} else {
    Warn "PM2 not available — start services manually"
}

# ============================================================================
# 9. Smoke Tests
# ============================================================================
if (-not $SkipSmokeTest) {
    Step "9/9 — Running smoke tests..."

    Write-Host ""

    # Test control server health
    Write-Host "  [1/6] Control server health..."
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:8443/api/v1/health" -TimeoutSec 10
        $uptimeMin = [math]::Round($health.uptime / 60, 1)
        $devices = if ($health.devicesOnline) { $health.devicesOnline } else { "N/A" }
        Success "Health OK — Uptime: ${uptimeMin}m, Devices: $devices"
    } catch {
        Fail "Health endpoint unreachable: $($_.Exception.Message)"
    }

    # Test stats endpoint
    Write-Host "  [2/6] Stats endpoint..."
    try {
        Invoke-RestMethod -Uri "http://localhost:8443/api/v1/stats" -TimeoutSec 10 | Out-Null
        Success "Stats endpoint OK"
    } catch {
        Warn "Stats endpoint check failed"
    }

    # Test VLM models
    Write-Host "  [3/6] VLM models endpoint..."
    try {
        Invoke-RestMethod -Uri "http://localhost:8443/api/v1/vlm/models" -TimeoutSec 10 | Out-Null
        Success "VLM models endpoint OK"
    } catch {
        Warn "VLM models endpoint check failed"
    }

    # Test NATS connectivity
    Write-Host "  [4/6] NATS connectivity..."
    try {
        $natsUrl = "http://localhost:8222/healthz"
        $r = Invoke-WebRequest -Uri $natsUrl -TimeoutSec 5 -UseBasicParsing
        if ($r.StatusCode -eq 200) {
            Success "NATS health OK"
        } else {
            Warn "NATS returned HTTP $($r.StatusCode)"
        }
    } catch {
        Warn "NATS not reachable (may be disabled)"
    }

    # Test MinIO connectivity
    Write-Host "  [5/6] MinIO connectivity..."
    try {
        $minioUrl = if ($env:MINIO_ENDPOINT) {
            "http://$($env:MINIO_ENDPOINT)/minio/health/live"
        } else {
            "http://localhost:9000/minio/health/live"
        }
        $r = Invoke-WebRequest -Uri $minioUrl -TimeoutSec 5 -UseBasicParsing
        if ($r.StatusCode -eq 200) {
            Success "MinIO health OK"
        } else {
            Warn "MinIO returned HTTP $($r.StatusCode)"
        }
    } catch {
        Warn "MinIO not reachable (may be disabled)"
    }

    # Test WebSocket endpoint
    Write-Host "  [6/6] WebSocket endpoint..."
    try {
        $wsUrl = "http://localhost:8443/ws"
        $r = Invoke-WebRequest -Uri $wsUrl -TimeoutSec 5 -UseBasicParsing -Headers @{
            "Upgrade" = "websocket"
            "Connection" = "Upgrade"
        }
        # A 426 (Upgrade Required) means the WebSocket endpoint is listening but not upgraded
        if ($r.StatusCode -eq 426 -or $r.StatusCode -eq 101) {
            Success "WebSocket endpoint reachable"
        } else {
            Warn "WebSocket endpoint returned HTTP $($r.StatusCode)"
        }
    } catch {
        # 426 Upgrade Required throws as error in some cases but is actually OK
        if ($_.Exception.Message -match "426") {
            Success "WebSocket endpoint reachable (426 Upgrade Required)"
        } else {
            Warn "WebSocket endpoint check: $($_.Exception.Message)"
        }
    }

    Write-Host ""
}

# ============================================================================
# Deployment Summary
# ============================================================================
$deployDuration = [math]::Round(((Get-Date) - $deployStart).TotalSeconds, 1)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Environment:  $Environment" -ForegroundColor White
Write-Host "  Duration:     ${deployDuration}s" -ForegroundColor White
Write-Host "  Deploy ID:    $DeployId" -ForegroundColor White
Write-Host ""
Write-Host "  Frontend:     https://phone.openedskill.com" -ForegroundColor Cyan
Write-Host "  Health:       https://phone.openedskill.com/api/v1/health" -ForegroundColor Cyan
Write-Host "  K8s Namespace: $namespace" -ForegroundColor Cyan
Write-Host ""

if ($prereqs["PM2"]) {
    Write-Host "  PM2 Status:" -ForegroundColor Yellow
    pm2 status 2>&1 | Select-Object -Last 8
    Write-Host ""
}

Write-Host "Rollback commands:" -ForegroundColor DarkGray
Write-Host "  kubectl rollout undo deployment -n $namespace --all" -ForegroundColor DarkGray
Write-Host "  kubectl rollout undo statefulset -n $namespace --all" -ForegroundColor DarkGray
Write-Host "  pm2 restart all" -ForegroundColor DarkGray
Write-Host ""
