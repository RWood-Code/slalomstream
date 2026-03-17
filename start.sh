#!/usr/bin/env bash
# SlalomStream — venue start script (Mac / Linux)
# Automatically restarts the server after an in-app update.
#
# First-time setup (run once):
#   pnpm install
#   pnpm --filter @workspace/api-server run build
#   pnpm --filter @workspace/slalom-stream run build
#
# Then every time at the venue:
#   ./start.sh
#
# Environment variables (edit below or set in your shell):
#   DATABASE_URL  — PostgreSQL connection string (required)
#   PORT          — HTTP port (default 3000)
#   SERVE_STATIC  — set to "true" to serve the built frontend from this server
#   STATIC_DIR    — path to built frontend (default: artifacts/slalom-stream/dist/public)

set -e
cd "$(dirname "$0")"

export PORT="${PORT:-3000}"
export SERVE_STATIC="${SERVE_STATIC:-true}"
export STATIC_DIR="${STATIC_DIR:-artifacts/slalom-stream/dist/public}"

if [ -z "$DATABASE_URL" ]; then
  echo "[SlalomStream] ERROR: DATABASE_URL is not set."
  echo "  Set it in your environment or edit this script."
  exit 1
fi

echo "[SlalomStream] Starting on port $PORT..."

while true; do
  node artifacts/api-server/dist/index.js
  EXIT_CODE=$?
  if [ "$EXIT_CODE" -eq 42 ]; then
    echo ""
    echo "[SlalomStream] Restarting after update..."
    sleep 2
  else
    echo ""
    echo "[SlalomStream] Server exited with code $EXIT_CODE."
    break
  fi
done
