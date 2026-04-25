# SlalomStream — Release & Versioning Guide

## Version convention

SlalomStream follows **Semantic Versioning** (`MAJOR.MINOR.PATCH`):

| Segment | When to bump |
|---------|--------------|
| `MAJOR` | Breaking change to tournament data format or major re-architecture |
| `MINOR` | New feature (new pass type, new judging mode, new page, etc.) |
| `PATCH` | Bug fix, copy change, or minor UI tweak |

The current version is stored in **`version.json`** at the repo root and must
be kept in sync with `artifacts/api-server/package.json` and
`artifacts/slalom-stream/package.json` when those are created.

---

## Creating a release

1. **Update the version number** in `version.json` (and any `package.json`
   files that expose a version field).

2. **Merge to `main`** via a pull request — direct pushes to `main` are
   protected.

3. **Tag the commit** with a `v`-prefixed tag:

   ```bash
   git tag v1.8.0
   git push origin v1.8.0
   ```

4. **GitHub Actions triggers automatically** when a `v*` tag is pushed.
   The Tauri build workflow (added in the Tauri migration task) will:
   - Build the app for Windows, macOS, and Linux
   - Sign the installers
   - Create a GitHub Release with the installers and an `update.json` manifest
   - The Tauri auto-updater in existing installs will detect the new release

---

## Branch strategy

| Branch | Purpose |
|--------|---------|
| `main` | Always releasable. Protected — requires PR + CI pass. |
| `feature/*` | Feature development branches. Merge into `main` via PR. |
| `fix/*` | Bug fix branches. Merge into `main` via PR. |

---

## Pre-release versions

For testing builds that should not trigger auto-updates in production:

```bash
git tag v1.8.0-beta.1
git push origin v1.8.0-beta.1
```

Mark the GitHub Release as **pre-release** in the UI. Pre-release builds are
only offered to installs that have opted into the beta channel.

---

## Hotfixes

1. Branch from the release tag: `git checkout -b fix/critical-score-bug v1.7.0`
2. Apply the fix and test.
3. Merge into `main` via PR.
4. Tag: `git tag v1.7.1 && git push origin v1.7.1`
