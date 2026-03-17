#!/usr/bin/env bash
# build-installer.sh — Build the SlalomStream Windows installer (.exe)
#
# Run this from the workspace root or from within the installer/ directory.
# Requires: makensis (NSIS), curl, unzip, pnpm
#
# Usage:
#   bash installer/build-installer.sh
#
# Output:
#   SlalomStream-Setup.exe  (at the workspace root)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGE_DIR="$SCRIPT_DIR/stage"
NODE_VERSION="20.19.0"
NODE_ZIP="/tmp/node-v${NODE_VERSION}-win-x64.zip"
NODE_DIR="node-v${NODE_VERSION}-win-x64"

echo ""
echo "═══════════════════════════════════════════════"
echo "  SlalomStream — Windows Installer Builder"
echo "═══════════════════════════════════════════════"
echo ""

# ── Prerequisite checks ────────────────────────────────────────────────────────
if ! command -v makensis &>/dev/null; then
  echo "Installing NSIS..."
  nix-env -iA nixpkgs.nsis
fi

if ! command -v pnpm &>/dev/null; then
  echo "ERROR: pnpm is not installed."
  exit 1
fi

if ! command -v curl &>/dev/null && ! command -v wget &>/dev/null; then
  echo "ERROR: curl or wget is required to download Node.js."
  exit 1
fi

echo "▸ NSIS:  $(makensis -VERSION 2>&1 || true)"
echo "▸ pnpm:  $(pnpm --version)"
echo ""

# ── Build the application ──────────────────────────────────────────────────────
echo "━━━ Step 1: Build application ━━━━━━━━━━━━━━━━━"
cd "$WORKSPACE_ROOT"

echo "  Installing dependencies..."
pnpm install --frozen-lockfile

echo "  Building API server..."
NODE_ENV=production pnpm --filter @workspace/api-server run build

echo "  Building frontend..."
NODE_ENV=production BASE_PATH=/ PORT=8080 \
  pnpm --filter @workspace/slalom-stream run build

echo ""

# ── Stage files ────────────────────────────────────────────────────────────────
echo "━━━ Step 2: Stage files ━━━━━━━━━━━━━━━━━━━━━━━"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/api-server"

# API server bundle
cp "$WORKSPACE_ROOT/artifacts/api-server/dist/index.cjs" \
   "$STAGE_DIR/api-server/index.cjs"

# Frontend build (dist/ contains public/ inside)
cp -r "$WORKSPACE_ROOT/artifacts/slalom-stream/dist" \
      "$STAGE_DIR/slalom-stream-dist"

# Version file
cp "$WORKSPACE_ROOT/version.json" "$STAGE_DIR/version.json"

# Startup batch file
cp "$SCRIPT_DIR/SlalomStream.bat" "$STAGE_DIR/SlalomStream.bat"

echo "  App files staged."

# ── Download portable Node.js for Windows ──────────────────────────────────────
echo ""
echo "━━━ Step 3: Download Node.js for Windows ━━━━━━━"
if [ -f "$NODE_ZIP" ]; then
  echo "  Using cached $NODE_ZIP"
else
  echo "  Downloading Node.js v${NODE_VERSION} (win-x64)..."
  if command -v curl &>/dev/null; then
    curl -L --progress-bar \
      -o "$NODE_ZIP" \
      "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIR}.zip"
  else
    wget -q --show-progress \
      -O "$NODE_ZIP" \
      "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIR}.zip"
  fi
fi

echo "  Extracting node.exe..."
unzip -p "$NODE_ZIP" "${NODE_DIR}/node.exe" > "$STAGE_DIR/node.exe"
NODE_SIZE=$(du -sh "$STAGE_DIR/node.exe" | cut -f1)
echo "  node.exe staged (${NODE_SIZE})"

# ── Compile installer ──────────────────────────────────────────────────────────
echo ""
echo "━━━ Step 4: Compile installer ━━━━━━━━━━━━━━━━━"
cd "$SCRIPT_DIR"
makensis -V2 installer.nsi

OUTPUT="$WORKSPACE_ROOT/SlalomStream-Setup.exe"
SIZE=$(du -sh "$OUTPUT" | cut -f1)

echo ""
echo "═══════════════════════════════════════════════"
echo "  Done!"
echo ""
echo "  Output: SlalomStream-Setup.exe  (${SIZE})"
echo ""
echo "  Distribute this file to venue operators."
echo "  They double-click it to install SlalomStream"
echo "  on their Windows computer."
echo "═══════════════════════════════════════════════"
echo ""
