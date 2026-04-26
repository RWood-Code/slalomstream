#!/usr/bin/env node
/**
 * bump-version.mjs — Atomically update the version string in version.json
 * and src-tauri/tauri.conf.json (and src-tauri/Cargo.toml).
 *
 * Usage:
 *   node scripts/bump-version.mjs 1.8.0
 *
 * This script is run before tagging a release. After running it, commit the
 * changed files and push a v* tag to trigger the GitHub Actions Tauri build.
 *
 * Release workflow:
 *   1. node scripts/bump-version.mjs <new-version>
 *   2. git add version.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
 *   3. git commit -m "chore: bump version to v<new-version>"
 *   4. git tag v<new-version>
 *   5. git push && git push --tags
 *   → GitHub Actions builds Windows .exe and macOS .dmg, publishes GitHub Release
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const newVersion = process.argv[2];
if (!newVersion) {
  console.error("Usage: node scripts/bump-version.mjs <new-version>");
  console.error("Example: node scripts/bump-version.mjs 1.8.0");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error(`Invalid version format: "${newVersion}". Expected x.y.z`);
  process.exit(1);
}

function updateJson(filePath, updater) {
  const raw = readFileSync(filePath, "utf-8");
  const obj = JSON.parse(raw);
  updater(obj);
  writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n");
  console.log(`  Updated ${filePath.replace(ROOT + "/", "")}`);
}

function updateToml(filePath, newVer) {
  let raw = readFileSync(filePath, "utf-8");
  raw = raw.replace(/^version = "[\d.]+"$/m, `version = "${newVer}"`);
  writeFileSync(filePath, raw);
  console.log(`  Updated ${filePath.replace(ROOT + "/", "")}`);
}

console.log(`\nBumping version to ${newVersion}...\n`);

updateJson(resolve(ROOT, "version.json"), obj => {
  obj.version = newVersion;
});

updateJson(resolve(ROOT, "src-tauri/tauri.conf.json"), obj => {
  obj.version = newVersion;
});

updateToml(resolve(ROOT, "src-tauri/Cargo.toml"), newVersion);

console.log(`\nDone. Next steps:`);
console.log(`  git add version.json src-tauri/tauri.conf.json src-tauri/Cargo.toml`);
console.log(`  git commit -m "chore: bump version to v${newVersion}"`);
console.log(`  git tag v${newVersion}`);
console.log(`  git push && git push --tags`);
