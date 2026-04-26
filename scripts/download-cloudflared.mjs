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
 * The version is pinned via CLOUDFLARED_VERSION below.  Update KNOWN_SHA256
 * whenever the version is bumped.  To find the correct hashes, run:
 *   curl -sL <binary url> | sha256sum
 */

import { createWriteStream, mkdirSync, chmodSync, existsSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { createHash } from "crypto";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BINARIES_DIR = resolve(ROOT, "src-tauri", "binaries");

// Pinned cloudflared release version.
// Check https://github.com/cloudflare/cloudflared/releases for the latest.
const CLOUDFLARED_VERSION = "2025.4.0";

// Map Tauri target triple → cloudflared release asset name
const TRIPLE_TO_ASSET = {
  "aarch64-apple-darwin": "cloudflared-darwin-arm64",
  "x86_64-apple-darwin": "cloudflared-darwin-amd64",
  "x86_64-pc-windows-msvc": "cloudflared-windows-amd64.exe",
};

// SHA-256 of the binary for each asset at CLOUDFLARED_VERSION.
// Recompute by running:
//   curl -sL <binary url> | sha256sum
// whenever CLOUDFLARED_VERSION changes.
//
// To populate these values for the first time, run:
//   node scripts/download-cloudflared.mjs aarch64-apple-darwin
//   node scripts/download-cloudflared.mjs x86_64-apple-darwin
//   node scripts/download-cloudflared.mjs x86_64-pc-windows-msvc
// and copy the logged SHA-256 into each entry below.
const KNOWN_SHA256 = {
  // "cloudflared-darwin-arm64": "<sha256 here>",
  // "cloudflared-darwin-amd64": "<sha256 here>",
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

/**
 * Returns a Transform stream that computes SHA-256 as data passes through.
 * After the stream ends, read the digest from transform.digest.
 */
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

  const response = await download(remoteUrl);
  const sha256Transform = createSha256Transform();
  const fileStream = createWriteStream(outputPath);

  try {
    await pipeline(response, sha256Transform, fileStream);
  } catch (err) {
    try { unlinkSync(outputPath); } catch { /* ignore */ }
    throw err;
  }

  const actualDigest = sha256Transform.digest;
  const expectedDigest = KNOWN_SHA256[asset];

  if (expectedDigest && actualDigest !== expectedDigest) {
    unlinkSync(outputPath);
    throw new Error(
      `SHA-256 mismatch for ${asset}!\n` +
        `  expected : ${expectedDigest}\n` +
        `  actual   : ${actualDigest}\n` +
        "The downloaded binary has been removed. " +
        "This may indicate a supply-chain issue or a stale KNOWN_SHA256 entry.\n" +
        `Update KNOWN_SHA256 in scripts/download-cloudflared.mjs if you bumped CLOUDFLARED_VERSION.`
    );
  }

  if (expectedDigest) {
    console.log(`  SHA-256  : ${actualDigest} ✓`);
  } else {
    // No pinned hash yet — log the actual value prominently so the developer
    // can copy it into KNOWN_SHA256 and enable enforcement for future runs.
    // See follow-up task: "Lock down the cloudflared download with verified checksums"
    console.warn(
      "\n" +
      "  ⚠  SUPPLY-CHAIN WARNING: No expected SHA-256 is pinned for:\n" +
      `       ${asset}\n` +
      "  Record the hash below in KNOWN_SHA256 inside\n" +
      "  scripts/download-cloudflared.mjs to enforce integrity on future runs.\n"
    );
    console.log(`  SHA-256  : ${actualDigest}`);
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
