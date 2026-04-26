# SlalomStream — Release & Versioning Guide

## Version convention

SlalomStream follows **Semantic Versioning** (`MAJOR.MINOR.PATCH`):

| Segment | When to bump |
|---------|--------------|
| `MAJOR` | Breaking change to tournament data format or major re-architecture |
| `MINOR` | New feature (new pass type, new judging mode, new page, etc.) |
| `PATCH` | Bug fix, copy change, or minor UI tweak |

The current version is stored in **`version.json`** at the repo root and must
be kept in sync with `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

---

## Creating a release

1. **Update the version number** in `version.json`, `src-tauri/tauri.conf.json`,
   and `src-tauri/Cargo.toml`.

2. **Commit and push to `main`.**

3. **Tag the commit** with a `v`-prefixed tag:

   ```bash
   git tag v2.0.0
   git push origin v2.0.0
   ```

4. **GitHub Actions triggers automatically** when a `v*` tag is pushed.
   The Tauri build workflow will:
   - Download the correct FFmpeg and cloudflared binaries for each platform
   - Build the app for Windows (x86_64) and macOS (Apple Silicon + Intel)
   - Sign and notarize the installers (requires GitHub Secrets — see below)
   - Create a GitHub Release with the installers and an `update.json` manifest
   - Existing installs will detect the new release via the built-in auto-updater

---

## Required GitHub Secrets

Before CI can run successfully, configure these secrets in your GitHub repo
under **Settings → Secrets and variables → Actions**:

### Always required
| Secret | Description |
|--------|-------------|
| `TAURI_SIGNING_PRIVATE_KEY` | Private key for signing update bundles. Generate with: `pnpm tauri signer generate -w ~/.tauri/slalomstream.key` |
| `TAURI_SIGNING_PUBLIC_KEY` | Public key (base64 string) from the same key pair. Set in tauri.conf.json at CI time. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the private key (leave blank if none). |

### macOS code signing & notarization (optional — unsigned builds still work for testing)
| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` Developer ID Application certificate. `base64 -i MyCert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | Full identity string e.g. `Developer ID Application: NZTWSA (TEAMID)` |
| `APPLE_ID` | Apple ID (email) used for notarization |
| `APPLE_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | 10-character Apple Developer Team ID |

### Windows code signing (optional — unsigned builds trigger SmartScreen warning on first run)
| Secret | Description |
|--------|-------------|
| `WINDOWS_CERTIFICATE` | Base64-encoded `.pfx` Authenticode certificate |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the `.pfx` |

---

## Branch strategy

| Branch | Purpose |
|--------|---------|
| `main` | Always releasable. |
| `feature/*` | Feature development branches. |
| `fix/*` | Bug fix branches. |

---

## Pre-release / beta builds

```bash
git tag v2.1.0-beta.1
git push origin v2.1.0-beta.1
```

Mark the GitHub Release as **pre-release** in the UI. Pre-release builds are
not offered to production installs via the auto-updater.

---

## Hotfixes

1. Branch from the release tag: `git checkout -b fix/critical-bug v2.0.0`
2. Apply the fix and test.
3. Merge into `main`.
4. Tag: `git tag v2.0.1 && git push origin v2.0.1`

---

## Release history

### v2.0.0 — 2025-04 — Full desktop release

**Architecture**
- Full Tauri v2 desktop app replacing the web-only build
- Express/PGlite backend runs as a managed sidecar inside the app
- FFmpeg bundled as a sidecar for video recording (no separate install required)
- cloudflared bundled as a sidecar for the Cloudflare Tunnel feature
- Auto-updater via `tauri-plugin-updater` + GitHub Releases `update.json`
- System tray icon with Show/Quit menu
- Branded macOS DMG installer window
- macOS entitlements (camera, microphone, hardened runtime)
- macOS code signing & notarization support via CI
- Windows Authenticode signing support via CI

**Video recording**
- Live preview from CamLink capture card (GoPro → DJI SDR → CamLink → PC)
- FFmpeg sidecar pipeline with split preview + record streams
- MJPEG live preview at 1080p30
- Pass markers stored as `.markers.json` sidecar files
- Clip trim and export (stream-copy, near-instant)
- Recording library — browse, replay, and delete saved passes
- Library cards enriched with tournament pass data (buoys, round, division)
- Camera-only mode (recording without a tournament loaded)
- Disk health display for all configured save destinations

**Connectivity**
- Cloudflare Tunnel "Go Online" toggle in Admin → Network
- Live tunnel status indicator in the app header (green pulsing dot when active)
- Write-route protection when tunnel is active (admin token required)
- Admin PIN enforcement gates the Go Online toggle

**Scoring & judging** (carried forward from v1.x)
- Chief Judge score override UI
- Personal best detection
- Official results PDF export
- Start list CSV import
- Announcer overlay (/live page)
- WaterskiConnect / SurePath reliability improvements
