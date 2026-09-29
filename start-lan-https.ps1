<#
.SYNOPSIS
    Launches Flux server in local HTTPS mode using mkcert for same-LAN P2P file sharing.
#>
param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Continue"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "         Flux Local LAN HTTPS (Direct P2P)              " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not $rootDir) { $rootDir = (Get-Location).Path }
Set-Location $rootDir

# Stop any running instances first
Write-Host "Stopping any running Flux processes..." -ForegroundColor DarkGray
Get-Process -Name "flux-server", "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

# Rebuild if needed
if (-not (Test-Path "$rootDir\flux-server.exe")) {
    Write-Host "Building flux-server.exe..." -ForegroundColor Cyan
    go build -o flux-server.exe ./server
}

# Determine LAN IP
$lanIP = "192.168.1.5"
try {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*" -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
    if ($ip) { $lanIP = $ip }
} catch {}

# Check for cert
$certFile = "$rootDir\192.168.1.5+2.pem"
$keyFile = "$rootDir\192.168.1.5+2-key.pem"

if (-not (Test-Path $certFile) -or -not (Test-Path $keyFile)) {
    Write-Host "Generating mkcert certificates for $lanIP, localhost, 127.0.0.1..." -ForegroundColor Yellow
    if (Test-Path "$rootDir\mkcert.exe") {
        & "$rootDir\mkcert.exe" $lanIP localhost 127.0.0.1
    }
}

# Set env vars and start server
$env:FLUX_ADDR = ":8080"
$env:FLUX_CERT_FILE = $certFile
$env:FLUX_KEY_FILE = $keyFile

Write-Host "Starting flux-server on https://0.0.0.0:8080..." -ForegroundColor Green
$serverProc = Start-Process -FilePath "$rootDir\flux-server.exe" -Environment @{
    FLUX_ADDR = ":8080"
    FLUX_CERT_FILE = $certFile
    FLUX_KEY_FILE = $keyFile
} -WorkingDirectory $rootDir -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 1

$lanUrl = "https://${lanIP}:8080"

Write-Host "`n================================================================" -ForegroundColor Green
Write-Host "           🔒 FLUX LOCAL LAN HTTPS READY! 🔒                    " -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  LAN HTTPS URL      :  $lanUrl" -ForegroundColor Yellow
Write-Host "  Localhost HTTPS    :  https://localhost:8080" -ForegroundColor Cyan
Write-Host "  CA Certificate     :  $rootDir\rootCA.pem" -ForegroundColor Gray
Write-Host "================================================================" -ForegroundColor Green
Write-Host "`nOpen $lanUrl on all devices on your Wi-Fi!" -ForegroundColor Green
Write-Host "Server running in background (PID: $($serverProc.Id)). To stop, run: .\stop.ps1`n" -ForegroundColor DarkGray

if (-not $NoBrowser) {
    Start-Process $lanUrl
}
