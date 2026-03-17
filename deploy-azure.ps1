# SlalomStream — Azure App Service deploy script (Windows / PowerShell)
#
# Usage (in PowerShell):
#   $env:AZURE_RESOURCE_GROUP = "my-rg"
#   $env:AZURE_APP_NAME       = "my-app"
#   .\deploy-azure.ps1
#
# Or run without environment variables and the script will prompt you.
#
# Required tools:
#   - Node.js / pnpm
#   - Azure CLI (az)  — https://docs.microsoft.com/cli/azure/install-azure-cli

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# ── Dependency checks ─────────────────────────────────────────────────────────

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "ERROR: Azure CLI ('az') is not installed." -ForegroundColor Red
    Write-Host "  Install it from: https://docs.microsoft.com/cli/azure/install-azure-cli"
    Write-Host "  Then run: az login"
    Read-Host "Press Enter to exit"
    exit 1
}

$accountCheck = az account show 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: You are not logged in to the Azure CLI." -ForegroundColor Red
    Write-Host "  Run: az login"
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "ERROR: pnpm is not installed." -ForegroundColor Red
    Write-Host "  Install it from: https://pnpm.io/installation"
    Read-Host "Press Enter to exit"
    exit 1
}

# ── Azure target ──────────────────────────────────────────────────────────────

if (-not $env:AZURE_RESOURCE_GROUP) {
    $env:AZURE_RESOURCE_GROUP = Read-Host "Azure Resource Group name"
}

if (-not $env:AZURE_APP_NAME) {
    $env:AZURE_APP_NAME = Read-Host "Azure App Service name"
}

if (-not $env:AZURE_RESOURCE_GROUP -or -not $env:AZURE_APP_NAME) {
    Write-Host "ERROR: AZURE_RESOURCE_GROUP and AZURE_APP_NAME are both required." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$RG  = $env:AZURE_RESOURCE_GROUP
$APP = $env:AZURE_APP_NAME

Write-Host ""
Write-Host "Deploying SlalomStream to Azure App Service"
Write-Host "  Resource Group : $RG"
Write-Host "  App Name       : $APP"
Write-Host ""

# ── Build ─────────────────────────────────────────────────────────────────────

Write-Host "[1/4] Installing dependencies..."
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: pnpm install failed." -ForegroundColor Red; exit 1 }

Write-Host "[2/4] Building API server..."
pnpm --filter @workspace/api-server run build
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: API server build failed." -ForegroundColor Red; exit 1 }

Write-Host "[3/4] Building frontend (BASE_PATH=/)..."
$env:BASE_PATH    = "/"
$env:NODE_ENV     = "production"
$env:PORT         = "8080"
pnpm --filter @workspace/slalom-stream run build
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Frontend build failed." -ForegroundColor Red; exit 1 }

# ── Zip assembly ──────────────────────────────────────────────────────────────

$ZipFile = "slalomstream-deploy.zip"

Write-Host "[4/4] Assembling deployment zip: $ZipFile ..."
if (Test-Path $ZipFile) { Remove-Item $ZipFile -Force }

$filesToZip = @(
    "artifacts\api-server\dist",
    "artifacts\slalom-stream\dist",
    "version.json"
)

Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open(
    (Join-Path $PSScriptRoot $ZipFile),
    [System.IO.Compression.ZipArchiveMode]::Create
)

foreach ($item in $filesToZip) {
    $fullPath = Join-Path $PSScriptRoot $item
    if (Test-Path $fullPath -PathType Container) {
        $entries = Get-ChildItem -Path $fullPath -Recurse -File
        foreach ($entry in $entries) {
            $relativePath = $entry.FullName.Substring($PSScriptRoot.Length + 1)
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip, $entry.FullName, $relativePath,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    } elseif (Test-Path $fullPath -PathType Leaf) {
        $relativePath = $item
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, $fullPath, $relativePath,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}

$zip.Dispose()

Write-Host "Zip assembled: $ZipFile ($([Math]::Round((Get-Item $ZipFile).Length / 1MB, 2)) MB)"

# ── Deploy ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Pushing to Azure App Service..."
az webapp deploy `
    --resource-group $RG `
    --name $APP `
    --src-path $ZipFile `
    --type zip

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Azure deploy failed. Check the output above for details." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# ── Post-deploy checklist ─────────────────────────────────────────────────────

Write-Host ""
Write-Host "────────────────────────────────────────────────────────────"
Write-Host " Deploy complete!"
Write-Host ""
Write-Host " IMPORTANT — Verify these App Settings are configured in"
Write-Host " the Azure Portal (App Service > Configuration > App Settings):"
Write-Host ""
Write-Host "   DATABASE_URL   = <your PostgreSQL connection string>"
Write-Host "   BASE_PATH      = /"
Write-Host "   SERVE_STATIC   = true"
Write-Host "   STATIC_DIR     = artifacts/slalom-stream/dist/public"
Write-Host "   NODE_ENV       = production"
Write-Host ""
Write-Host " Azure sets PORT automatically — do NOT set it manually."
Write-Host ""
Write-Host " Startup command (App Service > Configuration > General settings):"
Write-Host "   node artifacts/api-server/dist/index.cjs"
Write-Host ""
Write-Host " App URL: https://${APP}.azurewebsites.net"
Write-Host " Health : https://${APP}.azurewebsites.net/api/health"
Write-Host "────────────────────────────────────────────────────────────"
