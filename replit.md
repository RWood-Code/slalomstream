# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## GitHub Repository

- **Repo**: `https://github.com/nztwsa/slalomstream`
  > **Action required**: Replace the placeholder in `src-tauri/tauri.conf.json` →
  > `plugins.updater.endpoints` with the real GitHub org/repo once created.
- **Default branch**: `main` (protected — direct pushes require a PR + CI pass)
- **Distribution**: Tauri desktop releases are distributed via **public GitHub Releases**.
  The source repository may be private, but the GitHub Release and its assets **must be
  publicly accessible** so that the in-app auto-updater can download `update.json` and
  the signed installers without authentication. GitHub allows public releases on private
  repos via release visibility settings, or you can publish releases from a separate
  public "releases" repository.

### Setting up the repository (one-time)

1. Create the repo on GitHub (source may be private; releases must be public — see above).
2. Push this monorepo: `git remote add origin <url> && git push -u origin main`
3. Enable branch protection on `main`: require 1 PR review + CI pass before merge.
4. Add the secrets listed in `docs/deployment-secrets.md` to GitHub Secrets.

### Branching conventions

| Branch      | Purpose |
|-------------|---------|
| `main`      | Always releasable. All merges via PR. |
| `feature/*` | New features. |
| `fix/*`     | Bug fixes. |

### CI checks (`.github/workflows/ci.yml`)

Runs on every push and PR:
- **Prettier format check** (`pnpm run lint`) — enforces consistent code style
- **TypeScript typecheck** (`pnpm run typecheck`) — full project-reference build

### Release workflow

1. Run `node scripts/bump-version.mjs <new-version>` to update `version.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` atomically.
2. Commit: `git add version.json src-tauri/tauri.conf.json src-tauri/Cargo.toml && git commit -m "chore: bump version to v<new-version>"`
3. Tag: `git tag v<new-version> && git push && git push --tags`
4. GitHub Actions (`.github/workflows/tauri-build.yml`) triggers on the `v*` tag, builds Windows `.exe` + macOS `.dmg`, and publishes a GitHub Release.
5. The Tauri auto-updater in existing installs detects the new release on next app launch and prompts the user to install.

**Required GitHub Secrets**:
- `TAURI_SIGNING_PRIVATE_KEY` — Tauri updater signing key (generate with `pnpm tauri signer generate -w ~/.tauri/slalomstream.key`)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — password for the signing key

After generating the key pair, store both halves as GitHub Secrets:
- `TAURI_SIGNING_PRIVATE_KEY` — private key content (used by tauri-action to sign installers)
- `TAURI_SIGNING_PUBLIC_KEY` — public key (one-line base64 string; injected into `tauri.conf.json` at build time by the workflow)

The `plugins.updater.pubkey` field in `tauri.conf.json` is kept as `"PLACEHOLDER_REPLACE_ME"` in the repository. The `tauri-build.yml` workflow replaces it with the real key from `TAURI_SIGNING_PUBLIC_KEY` before building; the build fails fast if the secret is not set.

See `RELEASES.md` for the full versioning guide and hotfix process.

### Tauri desktop development setup (local, not in Replit)

Replit does not have Rust/WebView2 installed — Tauri dev/build must run on a local macOS or Windows machine.

1. Install prerequisites: Rust stable, Node 20+, pnpm 9+, Tauri CLI v2 (`cargo install tauri-cli --version '^2'` or `pnpm install` at repo root to get `@tauri-apps/cli`)
2. Run: `pnpm install` — installs all dependencies including `concurrently`
3. Run: `pnpm tauri dev` — `beforeDevCommand` starts the api-server dev server and Vite concurrently; Tauri opens the native window at `http://localhost:5173`. No manual pre-build steps required.

For a production build (local): `pnpm tauri build` — `beforeBuildCommand` automatically builds the api-server, packages the Node.js SEA sidecar binary, and builds the frontend before invoking Tauri.

**Architecture in production builds**: The Tauri window loads `http://localhost:3000` (the Express sidecar). The sidecar is configured by Tauri to serve both the frontend static files (from the `static/` resource dir bundled into the app) and the `/api/*` REST routes. This keeps the frontend and API on the same origin, so all relative `fetch('/api/...')` calls work without modification.

**Architecture in dev mode (`pnpm tauri dev`)**: The api-server is started directly (not as a SEA sidecar) by `beforeDevCommand` via `concurrently`. Vite runs at `:5173` and its dev proxy forwards `/api/*` to the api-server at `:3000`. In Rust, `#[cfg(not(debug_assertions))]` gates the sidecar spawn so it is skipped entirely in dev/debug builds — no port conflict. The Tauri window opens `devUrl=http://localhost:5173`.

**Dev vs production URL resolution**: `tauri.conf.json` sets `build.devUrl = "http://localhost:5173"` and `app.windows[0].url = "http://localhost:3000"`. In `pnpm tauri dev`, Tauri always uses `devUrl`, so the window opens the Vite dev server — the `windows[0].url` field is only used in production builds. There is no ambiguity between the two URLs at runtime.

## Artifacts

### SlalomStream (`artifacts/slalom-stream`)

Digital scorecard for professional slalom waterski tournaments. A clone of slalom-stream-live.base44.app that runs offline.

- **Preview path**: `/` (root)
- **Stack**: React + Vite, Zustand, TanStack React Query, Tailwind CSS, Framer Motion, Lucide icons
- **Features**:
  - Tournament management (create/edit/delete, G/L/R/E class)
  - Skier roster management with divisions and PINs
  - Pass recording (rope length, speed, round) with rope pre-fill from last pass (`suggestNextRope`)
  - Multi-judge scoring with IWWF collation (1, 3, or 5 judges). Panel driven by tournament's `judge_count`: 1-judge (A is chief+boat), 3-judge (C is boat), 5-judge (E is boat). Only scoring-panel roles (judge_a–judge_e) count toward collation; chief_judge is oversight/correction only
  - Judge score lock: after submission, ScorePad locks with a prominent "Score Locked" card + "Change my score" unlock button. Score resets on new pass
  - Full judge status grid on Recording page: shows all expected judge slots (A/B/C/D/E/CJ) with real-time fill status — clock icon when pending, score + checkmark when submitted
  - Fall/Gate-miss flag buttons during active pass: appends timestamped entry to pass notes via `POST /api/passes/:id/flag`
  - Dispute review modal: clicking any recent pass card opens a modal showing all judge scores for that pass
  - Rope pre-fill in both Recording.tsx and Judging.tsx StartPassPanel when a skier is selected
  - Judge PIN authentication
  - Live spectator scoreboard (auto-refresh every 5s) with TV Mode, Print, CSV Export
  - Scoreboard TV Mode: opens `/live` in a dedicated browser window
  - Admin panel (PIN-protected)
  - Network status card in Admin: shows all local IP URLs with copy button (dark emerald card at the top)
  - Server shutdown button in Admin: safely stops the API process
  - DB backup on startup (offline Windows mode): timestamped copies of PGlite data dir, keeps last 5
  - Skier History search on Home page: search passes across all tournaments via `GET /api/passes/search?q=`
  - Offline-capable (state stored in localStorage via Zustand persist)
- **Recording save folders**: Persistent primary + backup folder pickers via File System Access API (IndexedDB-persisted `FileSystemDirectoryHandle`). Auto-saves to both on every recording; falls back to browser download if no folders set. `useSaveFolders` hook + `SaveFolderBar` component. IDB helpers (`openDirDB`, `idbGetDir`, `idbSetDir`, `idbDeleteDir`) in Recording.tsx.
- **Pages**: Home, Recording, Judging, Scoreboard, Officials, Admin, Help
- **Colors**: Emerald green theme
- **NZTWSA Officials Register**: 135 officials seeded from NZTWSA register (13 Feb 2026), filterable by region/grade/financial status. Officials with a PIN set are auto-available as judges in any tournament (no per-tournament setup needed). Set PINs via the Officials page — click "Set PIN" on any row.
- **IWWF 2026 rope colours**: `getRopeColour()` in utils.ts maps all shortline lengths to IWWF official colours (Red=18.25m, Orange=16m, Yellow=14.25m, Green=13m, Blue=12m, Violet=11.25m, Pink=10.25m, Black=9.75m). Colour badges shown on Recording, Judging, and Scoreboard pages.
- **SurePath integration**: WaterskiConnect WebSocket client (`services/surepath-client.ts`) auto-connects when enabled; creates passes on speed trigger; configurable Event Name, Sub ID, Observer PIN, WS URL
- **WaterskiConnect webhook**: `POST /api/waterskiconnect/inbound` for manual scoring software push; status at `GET /api/waterskiconnect/status`
- **Updates**: Handled by the Tauri built-in updater — checks GitHub Releases on startup, prompts user to install. No Admin panel update UI; the old NSIS installer and ZIP-update routes have been removed.
- **Test data**: test tournament with 8 skiers, 3 judges (PINs 1111/2222/3333), 6 scored passes. Run `pnpm --filter @workspace/db run seed:test` to re-seed

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   ├── bump-version.js     # Atomically bump version in version.json + Tauri configs
│   ├── build-sea.js        # Package api-server dist as Node.js SEA binary for Tauri sidecar
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── src-tauri/              # Tauri v2 desktop app (Rust)
│   ├── src/
│   │   ├── main.rs         # Tauri entry point
│   │   └── lib.rs          # Sidecar lifecycle + auto-updater
│   ├── capabilities/       # Tauri capability permissions
│   ├── icons/              # App icons (populated before build)
│   ├── Cargo.toml          # Rust dependencies
│   ├── build.rs            # Tauri build script
│   └── tauri.conf.json     # Tauri configuration (identifier, version, sidecar, updater)
├── .github/workflows/
│   ├── ci.yml              # PR checks (Prettier + TypeScript)
│   └── tauri-build.yml     # Release builds (Windows + macOS) triggered by v* tags
├── version.json            # Canonical app version (kept in sync with Cargo.toml by bump-version.js)
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
