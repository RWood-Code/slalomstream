# SlalomStream — venue start script (Windows)
# Automatically restarts the server after an in-app update.
#
# First-time setup (run once in PowerShell):
#   pnpm install
#   pnpm --filter @workspace/api-server run build
#   pnpm --filter @workspace/slalom-stream run build
#
# Then every time at the venue:
#   Right-click this file -> "Run with PowerShell"
#   OR in PowerShell: powershell -ExecutionPolicy Bypass -File start.ps1
#
# Set DATABASE_URL and PORT below, or export them in your shell before running.

Set-Location $PSScriptRoot

$env:PORT       = if ($env:PORT)       { $env:PORT }       else { "3000" }
$env:SERVE_STATIC = "true"
$env:STATIC_DIR   = if ($env:STATIC_DIR) { $env:STATIC_DIR } else { "artifacts/slalom-stream/dist/public" }

if (-not $env:DATABASE_URL) {
    Write-Host "[SlalomStream] ERROR: DATABASE_URL is not set."
    Write-Host "  Set it at the top of this script or in your environment."
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[SlalomStream] Starting on port $($env:PORT)..."

while ($true) {
    node artifacts/api-server/dist/index.js
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 42) {
        Write-Host ""
        Write-Host "[SlalomStream] Restarting after update..."
        Start-Sleep -Seconds 2
    } else {
        Write-Host ""
        Write-Host "[SlalomStream] Server exited with code $exitCode."
        Read-Host "Press Enter to close"
        break
    }
}
