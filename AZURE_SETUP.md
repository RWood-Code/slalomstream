# SlalomStream — Azure App Service Setup Guide

This guide walks you through the one-time Azure resource creation needed before you can run `deploy-azure.sh` (Mac/Linux) or `deploy-azure.ps1` (Windows) for the first time.

---

## Prerequisites

### 1. Install the Azure CLI

| Platform | Command |
|----------|---------|
| macOS    | `brew install azure-cli` |
| Windows  | Download the MSI from https://aka.ms/installazurecliwindows |
| Linux    | `curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash` |

Verify: `az --version`

### 2. Log in to Azure

```bash
az login
```

A browser window will open for authentication. When it completes, the CLI will print the subscriptions linked to your account.

### 3. Select the correct subscription (if you have more than one)

```bash
az account list --output table
az account set --subscription "<subscription-id-or-name>"
```

---

## Step-by-step resource creation

All commands below use two variables — substitute your own values:

```bash
RG="slalomstream-rg"          # Resource Group name (any name you like)
APP="slalomstream"             # App Service name (must be globally unique)
PLAN="slalomstream-plan"      # App Service Plan name
REGION="australiaeast"         # Closest Azure region to New Zealand
```

### Step 1 — Create a Resource Group

```bash
az group create --name $RG --location $REGION
```

### Step 2 — Create an App Service Plan (B1 Linux)

B1 is the cheapest plan that supports always-on and custom startup commands. Upgrade to B2/B3 for heavier load.

```bash
az appservice plan create \
  --name $PLAN \
  --resource-group $RG \
  --location $REGION \
  --is-linux \
  --sku B1
```

### Step 3 — Create the Web App (Node 20 LTS)

```bash
az webapp create \
  --name $APP \
  --resource-group $RG \
  --plan $PLAN \
  --runtime "NODE:20-lts"
```

### Step 4 — Set the startup command

SlalomStream's API server is compiled into a single self-contained file:

```bash
az webapp config set \
  --name $APP \
  --resource-group $RG \
  --startup-file "node artifacts/api-server/dist/index.cjs"
```

### Step 5 — Configure required App Settings

Azure App Service injects these as environment variables at runtime. `PORT` is set automatically by Azure — do **not** include it here.

```bash
az webapp config appsettings set \
  --name $APP \
  --resource-group $RG \
  --settings \
    DATABASE_URL="<your-connection-string>" \
    BASE_PATH="/" \
    SERVE_STATIC="true" \
    STATIC_DIR="artifacts/slalom-stream/dist/public" \
    NODE_ENV="production"
```

Replace `<your-connection-string>` with a valid PostgreSQL connection string in the form:
```
postgresql://user:password@host:5432/dbname?sslmode=require
```

### Step 6 — (Optional) Create Azure Database for PostgreSQL

If you do not have an existing PostgreSQL database, you can create a managed one in Azure.

```bash
DB_SERVER="slalomstream-db"
DB_USER="slalomadmin"
DB_PASSWORD="<strong-password>"
DB_NAME="slalomstream"

az postgres flexible-server create \
  --name $DB_SERVER \
  --resource-group $RG \
  --location $REGION \
  --admin-user $DB_USER \
  --admin-password "$DB_PASSWORD" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --version 16 \
  --public-access 0.0.0.0

az postgres flexible-server db create \
  --server-name $DB_SERVER \
  --resource-group $RG \
  --database-name $DB_NAME
```

Then set `DATABASE_URL` in Step 5 to:
```
postgresql://<DB_USER>:<DB_PASSWORD>@<DB_SERVER>.postgres.database.azure.com:5432/<DB_NAME>?sslmode=require
```

Allow the App Service to reach the database:
```bash
az postgres flexible-server firewall-rule create \
  --name $DB_SERVER \
  --resource-group $RG \
  --rule-name allow-azure-services \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

---

## First deploy

After completing the steps above, run the deploy script from the workspace root:

**Mac / Linux:**
```bash
AZURE_RESOURCE_GROUP=$RG AZURE_APP_NAME=$APP ./deploy-azure.sh
```

**Windows (PowerShell):**
```powershell
$env:AZURE_RESOURCE_GROUP = "slalomstream-rg"
$env:AZURE_APP_NAME       = "slalomstream"
.\deploy-azure.ps1
```

The script will:
1. Install dependencies (`pnpm install`)
2. Build the API server and frontend
3. Package only the built output into a lean zip (no `node_modules`)
4. Push the zip to Azure via `az webapp deploy`

---

## Verify the deployment

```bash
# Health check
curl https://$APP.azurewebsites.net/api/health

# Open in browser
open https://$APP.azurewebsites.net
```

---

## Subsequent deploys

For every new release, just re-run the deploy script — no Azure Portal changes are needed unless you are adding new environment variables.

---

## Useful Azure CLI commands

| Task | Command |
|------|---------|
| Stream live logs | `az webapp log tail --name $APP --resource-group $RG` |
| Restart the app | `az webapp restart --name $APP --resource-group $RG` |
| View App Settings | `az webapp config appsettings list --name $APP --resource-group $RG` |
| Update a setting | `az webapp config appsettings set --name $APP --resource-group $RG --settings KEY=value` |
| SSH into the container | `az webapp ssh --name $APP --resource-group $RG` |
