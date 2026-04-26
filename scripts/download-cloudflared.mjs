#!/usr/bin/env node
/**
 * download-cloudflared.mjs — Download the official cloudflared binary for the
 * current (or specified) target triple and place it in src-tauri/binaries/
 * following Tauri's sidecar naming convention.
 *
 * Usage:
 *   node scripts/download-cloudflared.mjs                        # auto-detect
 *   node scripts/download-cloudflared.mjs aarch64-apple-darwin   # explicit triple
 *
 * Supported targets:
 *   aarch64-apple-darwin   macOS Apple Silicon
 *   x86_64-apple-darwin    macOS Intel
 *   x86_64-pc-windows-msvc Windows 64-bit
 *
 * Binaries are sourced from the official Cloudflare releases:
 *   https://github.com/cloudflare/cloudflared/releases
 *
 * The version is pinned via CLOUDFLARED_VERSION below.
 * macOS builds are distributed as .tgz archives; this script extracts them.
 */

import {
  createWriteStream,
  mkdirSync,
  chmodSync,
  existsSync,
  unlinkSync,
  mkdtempSync,
  rmSync,
} from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { createHash } from "crypto";
import https from "https";
import os from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BINARIES_DIR = resolve(ROOT, "src-tauri", "binaries");

// Pinned cloudflared release version.
// Check https://github.com/cloudflare/cloudflared/releases for the latest.
const CLOUDFLARED_VERSION = "2025.4.0";

// Map Tauri target triple → cloudflared release asset name
// macOS assets are .tgz archives; Windows is a direct .exe
const TRIPLE_TO_ASSET = {
  "aarch64-apple-darwin": "cloudflared-darwin-arm64.tgz",
  "x86_64-apple-darwin": "cloudflared-darwin-amd64.tgz",
  "x86_64-pc-windows-msvc": "cloudflared-windows-amd64.exe",
};

// SHA-256 of the downloaded archive/binary for each asset at CLOUDFLARED_VERSION.
// Populate by running the script once and copying the logged SHA-256 values.
const KNOWN_SHA256 = {
  // "cloudflared-darwin-arm64.tgz": "<sha256 here>",
  // "cloudflared-darwin-amd64.tgz": "<sha256 here>",
  // "cloudflared-windows-amd64.exe": "<sha256 here>",
};

function detectTargetTriple() {
  try {
    const output = execSync("rustc -vV", { encoding: "utf-8" });
    const line = output.split("\n").find((l) => l.startsWith("host:"));
    if (line) return line.split(": ")[1].trim();
  } catch {
    // rustc not available — fall back to Node.js detection
  }

  const platform = process.platform;
  const arch = process.arch;

  if (platform === "win32" && arch === "x64") return "x86_64-pc-windows-msvc";
  if (platform === "darwin" && arch === "arm64") return "aarch64-apple-darwin";
  if (platform === "darwin" && arch === "x64") return "x86_64-apple-darwin";

  throw new Error(
    `Unsupported platform: ${platform}/${arch}. ` +
      "Pass the target triple explicitly as the first argument."
  );
}

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          download(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${url}`));
          return;
        }
        resolve(res);
      })
      .on("error", reject);
  });
}

function createSha256Transform() {
  const hash = createHash("sha256");
  const transform = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      cb(null, chunk);
    },
    flush(cb) {
      transform.digest = hash.digest("hex");
      cb();
    },
  });
  return transform;
}

async function main() {
  const triple = process.argv[2] || detectTargetTriple();
  const asset = TRIPLE_TO_ASSET[triple];

  if (!asset) {
    console.error(
      `Unsupported target triple: ${triple}\n` +
        `Supported: ${Object.keys(TRIPLE_TO_ASSET).join(", ")}`
    );
    process.exit(1);
  }

  const isWindows = triple.includes("windows");
  const isTgz = asset.endsWith(".tgz");
  const ext = isWindows ? ".exe" : "";
  const outputName = `cloudflared-${triple}${ext}`;
  const outputPath = resolve(BINARIES_DIR, outputName);

  if (existsSync(outputPath)) {
    console.log(`Already present: ${outputPath} — skipping download.`);
    return;
  }

  mkdirSync(BINARIES_DIR, { recursive: true });

  const remoteUrl = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/${asset}`;
  console.log(`Downloading cloudflared ${CLOUDFLARED_VERSION} for ${triple}…`);
  console.log(`  Source : ${remoteUrl}`);
  console.log(`  Dest   : ${outputPath}`);

  // For .tgz archives, download to a temp file then extract
  const downloadPath = isTgz
    ? resolve(BINARIES_DIR, asset)
    : outputPath;

  const response = await download(remoteUrl);
  const sha256Transform = createSha256Transform();
  const fileStream = createWriteStream(downloadPath);

  try {
    await pipeline(response, sha256Transform, fileStream);
  } catch (err) {
    try { unlinkSync(downloadPath); } catch { /* ignore */ }
    throw err;
  }

  const actualDigest = sha256Transform.digest;
  const expectedDigest = KNOWN_SHA256[asset];

  if (expectedDigest && actualDigest !== expectedDigest) {
    unlinkSync(downloadPath);
    throw new Error(
      `SHA-256 mismatch for ${asset}!\n` +
        `  expected : ${expectedDigest}\n` +
        `  actual   : ${actualDigest}\n` +
        "The downloaded file has been removed. " +
        "This may indicate a supply-chain issue or a stale KNOWN_SHA256 entry."
    );
  }

  if (expectedDigest) {
    console.log(`  SHA-256  : ${actualDigest} ✓`);
  } else {
    console.warn(
      "\n" +
      "  ⚠  SUPPLY-CHAIN WARNING: No expected SHA-256 is pinned for:\n" +
      `       ${asset}\n` +
      "  Record the hash below in KNOWN_SHA256 inside\n" +
      "  scripts/download-cloudflared.mjs to enforce integrity on future runs.\n"
    );
    console.log(`  SHA-256  : ${actualDigest}`);
  }

  // Extract the binary from the .tgz archive
  if (isTgz) {
    const tmpDir = mkdtempSync(resolve(os.tmpdir(), "cloudflared-"));
    try {
      execSync(`tar -xzf "${downloadPath}" -C "${tmpDir}"`, { stdio: "pipe" });
      // The binary inside the archive is named 'cloudflared' (no extension)
      const extractedBinary = resolve(tmpDir, "cloudflared");
      if (!existsSync(extractedBinary)) {
        throw new Error(
          `Expected 'cloudflared' binary not found inside ${asset}. ` +
          `Contents: ${execSync(`tar -tzf "${downloadPath}"`, { encoding: "utf-8" }).trim()}`
        );
      }
      execSync(`cp "${extractedBinary}" "${outputPath}"`);
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      try { unlinkSync(downloadPath); } catch { /* ignore */ }
    }
    console.log(`  Extracted binary to: ${outputPath}`);
  }

  if (!isWindows) {
    chmodSync(outputPath, 0o755);
  }

  console.log(`Done: ${outputPath}`);
}

main().catch((err) => {
  console.error("download-cloudflared failed:", err.message);
  process.exit(1);
});
