#!/usr/bin/env node
/**
 * build-sea.mjs — Package the api-server dist as a Node.js SEA (Single Executable Application)
 * and place the binary in src-tauri/binaries/ for use as a Tauri sidecar.
 *
 * Also copies the @electric-sql/pglite package to src-tauri/pglite-resources/ so that
 * Tauri can bundle it as a resource. The sidecar binary receives NODE_PATH pointing to
 * that resource directory so `require('@electric-sql/pglite')` resolves correctly in
 * production Tauri installs (where node_modules are not present).
 *
 * Requires Node.js 20+ (SEA support).
 * Run after `pnpm --filter @workspace/api-server run build`.
 */

import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  cpSync,
} from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BINARIES_DIR = resolve(ROOT, "src-tauri", "binaries");
const DIST_CJS = resolve(ROOT, "artifacts", "api-server", "dist", "index.cjs");
const SEA_CONFIG = resolve(ROOT, "sea-config.json");
const SEA_BLOB = resolve(ROOT, "sea-prep.blob");
const PGLITE_DEST = resolve(ROOT, "src-tauri", "pglite-resources");

if (!existsSync(DIST_CJS)) {
  console.error(`api-server dist not found at ${DIST_CJS}`);
  console.error("Run: pnpm --filter @workspace/api-server run build");
  process.exit(1);
}

mkdirSync(BINARIES_DIR, { recursive: true });

// ── Resolve pglite package location ──────────────────────────────────────────
// pglite is a dep of @workspace/db, not api-server. We find it by resolving
// from the db package's source directory.
const dbRequire = createRequire(
  pathToFileURL(resolve(ROOT, "lib", "db", "src", "index.ts")).href
);
let pgliteDir;
try {
  const pgliteMain = dbRequire.resolve("@electric-sql/pglite");
  // Walk up from dist/index.cjs to the package root (package.json is 3 levels up)
  let candidate = resolve(pgliteMain, "..", "..", "..");
  if (!existsSync(resolve(candidate, "package.json"))) {
    candidate = resolve(pgliteMain, "..", "..");
  }
  pgliteDir = candidate;
  console.log(`Found pglite at: ${pgliteDir}`);
} catch (e) {
  console.warn(
    "WARNING: Could not resolve @electric-sql/pglite.\n",
    e.message
  );
}

// ── Stage pglite as a Tauri resource ─────────────────────────────────────────
// Tauri bundles src-tauri/pglite-resources/ as the `pglite` resource dir.
// lib.rs sets NODE_PATH=<resource_dir>/pglite so `require('@electric-sql/pglite')`
// resolves to the bundled copy, and pglite's own __filename-based WASM lookup
// resolves correctly against the resource dir path.
if (pgliteDir) {
  const pgliteDest = resolve(PGLITE_DEST, "@electric-sql", "pglite");
  rmSync(PGLITE_DEST, { recursive: true, force: true });
  mkdirSync(pgliteDest, { recursive: true });
  cpSync(pgliteDir, pgliteDest, {
    recursive: true,
    filter: (src) => !src.includes("node_modules"),
  });
  console.log(`Staged pglite → ${pgliteDest}`);
} else {
  console.warn(
    "Skipping pglite staging — sidecar will fail to load PGlite in Tauri production builds."
  );
}

// ── Determine target triple ───────────────────────────────────────────────────
let targetTriple;
try {
  targetTriple = execSync("rustc -vV", { encoding: "utf-8" })
    .split("\n")
    .find((l) => l.startsWith("host:"))
    ?.split(": ")[1]
    ?.trim();
} catch {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "win32") {
    targetTriple = `${arch === "x64" ? "x86_64" : arch}-pc-windows-msvc`;
  } else if (platform === "darwin") {
    targetTriple = `${arch === "x64" ? "x86_64" : "aarch64"}-apple-darwin`;
  } else {
    targetTriple = `${arch === "x64" ? "x86_64" : arch}-unknown-linux-gnu`;
  }
}

if (!targetTriple) {
  console.error(
    "Could not determine target triple. Ensure rustc is installed."
  );
  process.exit(1);
}

const ext = process.platform === "win32" ? ".exe" : "";
const binaryName = `api-server-${targetTriple}${ext}`;
const OUTPUT_BIN = resolve(BINARIES_DIR, binaryName);

console.log(`\nBuilding SEA for target: ${targetTriple}`);
console.log(`Output: ${OUTPUT_BIN}`);

// ── Generate SEA blob ─────────────────────────────────────────────────────────
writeFileSync(
  SEA_CONFIG,
  JSON.stringify(
    {
      main: DIST_CJS,
      output: SEA_BLOB,
      disableExperimentalSEAWarning: true,
    },
    null,
    2
  )
);

execSync(`node --experimental-sea-config ${SEA_CONFIG}`, { stdio: "inherit" });

// ── Inject blob into Node.js binary ──────────────────────────────────────────
const nodeBin = process.execPath;
copyFileSync(nodeBin, OUTPUT_BIN);

if (process.platform !== "win32") {
  execSync(`chmod +x "${OUTPUT_BIN}"`);
}

if (process.platform === "darwin") {
  try {
    execSync(`codesign --remove-signature "${OUTPUT_BIN}"`, {
      stdio: "inherit",
    });
  } catch {
    // Not signed — that is fine
  }
}

const machoFlag =
  process.platform === "darwin" ? " --macho-segment-name NODE_SEA" : "";
execSync(
  `npx postject "${OUTPUT_BIN}" NODE_SEA_BLOB "${SEA_BLOB}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2${machoFlag}`,
  { stdio: "inherit" }
);

if (process.platform === "darwin") {
  try {
    execSync(`codesign --sign - "${OUTPUT_BIN}"`, { stdio: "inherit" });
  } catch {
    // Ad-hoc signing — will be re-signed by tauri-action
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
try {
  rmSync(SEA_CONFIG);
} catch { /* ignore */ }
try {
  rmSync(SEA_BLOB);
} catch { /* ignore */ }

console.log(`\nSEA binary created: ${OUTPUT_BIN}`);
console.log("pglite staged at src-tauri/pglite-resources/ for Tauri resource bundling.");
