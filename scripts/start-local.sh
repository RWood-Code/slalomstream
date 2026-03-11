#!/usr/bin/env bash
# ============================================================
# SlalomStream — Local / Offline Server Startup Script
# ============================================================
# Run this on the laptop at the venue. All judge devices
# connect to this machine over the local WiFi network.
#
# Requirements: Node.js 20+, pnpm
#
# Usage:
#   chmod +x scripts/start-local.sh
#   ./scripts/start-local.sh
# ============================================================

set -e

PORT=${PORT:-3000}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

echo ""
echo "  SlalomStream — Local Server"
echo "  =========================="
echo ""

# 1. Install dependencies
echo "→ Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# 2. Push DB schema (requires DATABASE_URL to be set)
if [ -z "$DATABASE_URL" ]; then
  echo ""
  echo "⚠  DATABASE_URL is not set."
  echo "   Set it to a PostgreSQL connection string, or use a local DB:"
  echo "   export DATABASE_URL=postgresql://localhost/slalomstream"
  echo ""
fi

echo "→ Pushing database schema..."
pnpm --filter @workspace/db run push 2>/dev/null || echo "  (DB push skipped — check DATABASE_URL)"

# 3. Build the frontend (with BASE_PATH=/ for standalone serving)
echo "→ Building frontend..."
BASE_PATH=/ pnpm --filter @workspace/slalom-stream run build

# 4. Copy built frontend into the api-server's public/ folder
echo "→ Copying frontend to server..."
rm -rf "$ROOT/artifacts/api-server/public"
cp -r "$ROOT/artifacts/slalom-stream/dist/public" "$ROOT/artifacts/api-server/public"

# 5. Build the backend
echo "→ Building backend..."
pnpm --filter @workspace/api-server run build

# 6. Start the combined server
echo ""
echo "✓ Build complete!"
echo ""

# Show local network addresses
LOCAL_IPS=$(hostname -I 2>/dev/null || ifconfig 2>/dev/null | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}')
echo "  Server starting on port $PORT"
echo ""
echo "  Access URLs:"
echo "  ┌─────────────────────────────────────────────────┐"
echo "  │  Operator:   http://localhost:$PORT              │"
for ip in $LOCAL_IPS; do
echo "  │  Network:    http://$ip:$PORT              │"
done
echo "  │  Judges:     (same URL) → tap Judge tab         │"
echo "  │  Scoreboard: (same URL) → tap Live tab          │"
echo "  └─────────────────────────────────────────────────┘"
echo ""
echo "  All devices must be on the same WiFi network."
echo "  Use the QR code on the Recording page to connect judges."
echo ""

cd "$ROOT/artifacts/api-server"
PORT=$PORT SERVE_STATIC=true STATIC_DIR=./public node ./dist/index.cjs
