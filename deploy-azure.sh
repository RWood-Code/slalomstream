#!/usr/bin/env bash
# SlalomStream — Azure App Service deploy script (Mac / Linux)
#
# Usage:
#   AZURE_RESOURCE_GROUP=my-rg AZURE_APP_NAME=my-app ./deploy-azure.sh
#
# Or run without environment variables and the script will prompt you.
#
# Required tools:
#   - Node.js / pnpm
#   - Azure CLI (az)  — https://docs.microsoft.com/cli/azure/install-azure-cli

set -e
cd "$(dirname "$0")"

# ── Dependency checks ─────────────────────────────────────────────────────────

if ! command -v az &>/dev/null; then
  echo ""
  echo "ERROR: Azure CLI ('az') is not installed."
  echo "  Install it from: https://docs.microsoft.com/cli/azure/install-azure-cli"
  echo "  Then run: az login"
  exit 1
fi

if ! az account show &>/dev/null; then
  echo ""
  echo "ERROR: You are not logged in to the Azure CLI."
  echo "  Run: az login"
  exit 1
fi

if ! command -v pnpm &>/dev/null; then
  echo ""
  echo "ERROR: pnpm is not installed."
  echo "  Install it from: https://pnpm.io/installation"
  exit 1
fi

# ── Azure target ──────────────────────────────────────────────────────────────

if [ -z "$AZURE_RESOURCE_GROUP" ]; then
  read -rp "Azure Resource Group name: " AZURE_RESOURCE_GROUP
fi

if [ -z "$AZURE_APP_NAME" ]; then
  read -rp "Azure App Service name:    " AZURE_APP_NAME
fi

if [ -z "$AZURE_RESOURCE_GROUP" ] || [ -z "$AZURE_APP_NAME" ]; then
  echo "ERROR: AZURE_RESOURCE_GROUP and AZURE_APP_NAME are both required."
  exit 1
fi

echo ""
echo "Deploying SlalomStream to Azure App Service"
echo "  Resource Group : $AZURE_RESOURCE_GROUP"
echo "  App Name       : $AZURE_APP_NAME"
echo ""

# ── Build ─────────────────────────────────────────────────────────────────────

echo "[1/4] Installing dependencies..."
pnpm install --frozen-lockfile

echo "[2/4] Building API server..."
pnpm --filter @workspace/api-server run build

echo "[3/4] Building frontend (BASE_PATH=/)..."
BASE_PATH=/ NODE_ENV=production PORT=8080 pnpm --filter @workspace/slalom-stream run build

# ── Zip assembly ──────────────────────────────────────────────────────────────

ZIP_FILE="slalomstream-deploy.zip"

echo "[4/4] Assembling deployment zip: $ZIP_FILE ..."
rm -f "$ZIP_FILE"

if ! command -v zip &>/dev/null; then
  echo "ERROR: 'zip' is not installed. Install it (e.g. 'brew install zip' or 'apt install zip') and retry."
  exit 1
fi

zip -r "$ZIP_FILE" \
  artifacts/api-server/dist/ \
  artifacts/slalom-stream/dist/ \
  version.json

echo "Zip assembled: $ZIP_FILE ($(du -sh "$ZIP_FILE" | cut -f1))"

# ── Deploy ────────────────────────────────────────────────────────────────────

echo ""
echo "Pushing to Azure App Service..."
az webapp deploy \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_APP_NAME" \
  --src-path "$ZIP_FILE" \
  --type zip

# ── Post-deploy checklist ─────────────────────────────────────────────────────

echo ""
echo "────────────────────────────────────────────────────────────"
echo " Deploy complete!"
echo ""
echo " IMPORTANT — Verify these App Settings are configured in"
echo " the Azure Portal (App Service > Configuration > App Settings):"
echo ""
echo "   DATABASE_URL   = <your PostgreSQL connection string>"
echo "   BASE_PATH      = /"
echo "   SERVE_STATIC   = true"
echo "   STATIC_DIR     = artifacts/slalom-stream/dist/public"
echo "   NODE_ENV       = production"
echo ""
echo " Azure sets PORT automatically — do NOT set it manually."
echo ""
echo " Startup command (App Service > Configuration > General settings):"
echo "   node artifacts/api-server/dist/index.cjs"
echo ""
echo " App URL: https://${AZURE_APP_NAME}.azurewebsites.net"
echo " Health : https://${AZURE_APP_NAME}.azurewebsites.net/api/health"
echo "────────────────────────────────────────────────────────────"
