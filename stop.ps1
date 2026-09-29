<#
.SYNOPSIS
    Stops Flux server and Cloudflare tunnel processes.
#>
Write-Host "Stopping Flux server and Cloudflare tunnel..." -ForegroundColor Yellow
$procs = Get-Process -Name "flux-server", "cloudflared" -ErrorAction SilentlyContinue
if ($procs) {
    $procs | Stop-Process -Force
    Write-Host "Successfully stopped all running Flux processes." -ForegroundColor Green
} else {
    Write-Host "No running Flux or Cloudflared processes found." -ForegroundColor DarkGray
}
