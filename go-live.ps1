<#
.SYNOPSIS
    Launches Flux server and provisions a public Cloudflare tunnel.
#>
param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Continue"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "             Flux 'Go Live' Deployment                  " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not $rootDir) { $rootDir = (Get-Location).Path }
Set-Location $rootDir

# Stop any running instances first
Write-Host "Checking for existing instances..." -ForegroundColor DarkGray
Get-Process -Name "flux-server", "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

# Verify or rebuild binary
if (-not (Test-Path "$rootDir\flux-server.exe")) {
    Write-Host "Building flux-server.exe..." -ForegroundColor Cyan
    go build -o flux-server.exe ./server
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to build flux-server.exe"
        exit 1
    }
}

# Start flux-server
Write-Host "Starting flux-server on :8080..." -ForegroundColor Cyan
$serverProc = Start-Process -FilePath "$rootDir\flux-server.exe" -WorkingDirectory $rootDir -PassThru -WindowStyle Hidden

# Verify local server responded
$serverReady = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/config" -TimeoutSec 2 -ErrorAction Stop
        if ($resp) {
            $serverReady = $true
            break
        }
    } catch {}
}

if (-not $serverReady) {
    Write-Error "Flux server failed to start on http://127.0.0.1:8080"
    exit 1
}

# Clear previous cloudflared log
$logFile = "$rootDir\cloudflared.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }

# Start cloudflared tunnel
Write-Host "Connecting to Cloudflare Edge tunnel..." -ForegroundColor Cyan
$cfProc = Start-Process -FilePath "$rootDir\cloudflared.exe" -ArgumentList "tunnel --url http://127.0.0.1:8080 --logfile cloudflared.log" -WorkingDirectory $rootDir -PassThru -WindowStyle Hidden

# Wait for tunnel URL
$tunnelUrl = $null
$maxWaitSeconds = 30
$startTime = Get-Date

Write-Host "Provisioning live public HTTPS endpoint..." -NoNewline
while ((Get-Date) - $startTime -lt [TimeSpan]::FromSeconds($maxWaitSeconds)) {
    Write-Host "." -NoNewline
    Start-Sleep -Milliseconds 500
    if (Test-Path $logFile) {
        $lines = Get-Content $logFile -ErrorAction SilentlyContinue
        if ($lines) {
            foreach ($line in $lines) {
                if ($line -match '(https://[a-zA-Z0-9-]+\.trycloudflare\.com)') {
                    $tunnelUrl = $matches[1]
                    break
                }
            }
        }
        if ($tunnelUrl) { break }
    }
}
Write-Host ""

if ($tunnelUrl) {
    [System.IO.File]::WriteAllText("$rootDir\tunnel.txt", $tunnelUrl, (New-Object System.Text.UTF8Encoding $false))
    
    # Refresh config check
    $updatedConfig = Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/config" -TimeoutSec 2

    Write-Host "`n================================================================" -ForegroundColor Green
    Write-Host "                    🚀 FLUX IS LIVE! 🚀                        " -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host "  Public HTTPS URL  :  $tunnelUrl" -ForegroundColor Yellow
    Write-Host "  Local Network     :  http://$($updatedConfig.lanIP):8080" -ForegroundColor Cyan
    Write-Host "  Localhost         :  http://localhost:8080" -ForegroundColor Gray
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host "`nReady for device-to-device sharing across any network or phone!" -ForegroundColor Green
    Write-Host "Processes running in background (flux-server PID: $($serverProc.Id), cloudflared PID: $($cfProc.Id))." -ForegroundColor DarkGray
    Write-Host "To shut down anytime, run: .\stop.ps1`n" -ForegroundColor DarkGray

    if (-not $NoBrowser) {
        # Open in default browser
        Start-Process $tunnelUrl
    }
} else {
    Write-Warning "`nCould not detect Cloudflare tunnel URL within $maxWaitSeconds seconds."
    Write-Host "Flux server is still running locally at http://localhost:8080" -ForegroundColor Yellow
    if (Test-Path $logFile) {
        Get-Content $logFile -Tail 20
    }
}
