# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Artifacts

### SlalomStream (`artifacts/slalom-stream`)

Digital scorecard for professional slalom waterski tournaments. A clone of slalom-stream-live.base44.app that runs offline.

- **Preview path**: `/` (root)
- **Stack**: React + Vite, Zustand, TanStack React Query, Tailwind CSS, Framer Motion, Lucide icons
- **Features**:
  - Tournament management (create/edit/delete, G/L/R/E class)
  - Skier roster management with divisions and PINs
  - Pass recording (rope length, speed, round)
  - Multi-judge scoring with IWWF collation (1, 3, or 5 judges). Panel driven by tournament's `judge_count`: 1-judge (A is chief+boat), 3-judge (C is boat), 5-judge (E is boat). Only scoring-panel roles (judge_a–judge_e) count toward collation; chief_judge is oversight/correction only
  - Judge PIN authentication
  - Live spectator scoreboard (auto-refresh every 5s)
  - Admin panel (PIN-protected)
  - Offline-capable (state stored in localStorage via Zustand persist)
- **Recording save folders**: Persistent primary + backup folder pickers via File System Access API (IndexedDB-persisted `FileSystemDirectoryHandle`). Auto-saves to both on every recording; falls back to browser download if no folders set. `useSaveFolders` hook + `SaveFolderBar` component. IDB helpers (`openDirDB`, `idbGetDir`, `idbSetDir`, `idbDeleteDir`) in Recording.tsx.
- **Pages**: Home, Recording, Judging, Scoreboard, Officials, Admin, Help
- **Colors**: Emerald green theme
- **NZTWSA Officials Register**: 135 officials seeded from NZTWSA register (13 Feb 2026), filterable by region/grade/financial status. Officials with a PIN set are auto-available as judges in any tournament (no per-tournament setup needed). Set PINs via the Officials page — click "Set PIN" on any row.
- **IWWF 2026 rope colours**: `getRopeColour()` in utils.ts maps all shortline lengths to IWWF official colours (Red=18.25m, Orange=16m, Yellow=14.25m, Green=13m, Blue=12m, Violet=11.25m, Pink=10.25m, Black=9.75m). Colour badges shown on Recording, Judging, and Scoreboard pages.
- **SurePath integration**: WaterskiConnect WebSocket client (`services/surepath-client.ts`) auto-connects when enabled; creates passes on speed trigger; configurable Event Name, Sub ID, Observer PIN, WS URL
- **WaterskiConnect webhook**: `POST /api/waterskiconnect/inbound` for manual scoring software push; status at `GET /api/waterskiconnect/status`
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
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
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
