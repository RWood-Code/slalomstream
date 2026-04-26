#!/usr/bin/env node
/**
 * download-ffmpeg.mjs — Download a static FFmpeg binary for the current (or
 * specified) target triple and place it in src-tauri/binaries/ following
 * Tauri's sidecar naming convention.
 *
 * Usage:
 *   node scripts/download-ffmpeg.mjs                        # auto-detect
 *   node scripts/download-ffmpeg.mjs aarch64-apple-darwin   # explicit triple
 *
 * Supported targets:
 *   aarch64-apple-darwin   macOS Apple Silicon
 *   x86_64-apple-darwin    macOS Intel
 *   x86_64-pc-windows-msvc Windows 64-bit
 *
 * Binaries are sourced from eugeneware/ffmpeg-static GitHub releases
 * (statically linked, no runtime dependencies).
 *
 * SHA-256 digests are computed against the decompressed binary and compared
 * against known-good values pinned for FFMPEG_STATIC_VERSION.  Update the
 * KNOWN_SHA256 table whenever FFMPEG_STATIC_VERSION is bumped.
 */

import { createWriteStream, mkdirSync, chmodSync, existsSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { createGunzip } from "zlib";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { createHash } from "crypto";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BINARIES_DIR = resolve(ROOT, "src-tauri", "binaries");

// eugeneware/ffmpeg-static release version to pin downloads to.
// Check https://github.com/eugeneware/ffmpeg-static/releases for the latest.
const FFMPEG_STATIC_VERSION = "b6.1.1";

// Map Tauri target triple → eugeneware/ffmpeg-static platform-arch slug
const TRIPLE_TO_SLUG = {
  "aarch64-apple-darwin": "darwin-arm64",
  "x86_64-apple-darwin": "darwin-x64",
  "x86_64-pc-windows-msvc": "win32-x64",
};

// SHA-256 of the *decompressed* FFmpeg binary for each slug at FFMPEG_STATIC_VERSION.
// Recompute by running:
//   curl -sL <.gz url> | gunzip | sha256sum
// whenever FFMPEG_STATIC_VERSION changes.
const KNOWN_SHA256 = {
  "darwin-arm64": "a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584",
  "darwin-x64":   "ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894",
  "win32-x64":    "04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00",
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
  const slug = TRIPLE_TO_SLUG[triple];

  if (!slug) {
    console.error(
      `Unsupported target triple: ${triple}\n` +
        `Supported: ${Object.keys(TRIPLE_TO_SLUG).join(", ")}`
    );
    process.exit(1);
  }

  const isWindows = triple.includes("windows");
  const ext = isWindows ? ".exe" : "";
  const outputName = `ffmpeg-${triple}${ext}`;
  const outputPath = resolve(BINARIES_DIR, outputName);

  if (existsSync(outputPath)) {
    console.log(`Already present: ${outputPath} — skipping download.`);
    return;
  }

  mkdirSync(BINARIES_DIR, { recursive: true });

  // eugeneware/ffmpeg-static distributes gzip-compressed binaries.
  // Asset naming: ffmpeg-{slug}.gz (e.g. ffmpeg-darwin-arm64.gz)
  const remoteUrl = `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_STATIC_VERSION}/ffmpeg-${slug}.gz`;
  console.log(`Downloading FFmpeg ${FFMPEG_STATIC_VERSION} for ${triple}…`);
  console.log(`  Source : ${remoteUrl}`);
  console.log(`  Dest   : ${outputPath}`);

  const response = await download(remoteUrl);
  const gunzip = createGunzip();
  const sha256Transform = createSha256Transform();
  const fileStream = createWriteStream(outputPath);

  try {
    await pipeline(response, gunzip, sha256Transform, fileStream);
  } catch (err) {
    // Remove partial output on failure
    try { unlinkSync(outputPath); } catch { /* ignore */ }
    throw err;
  }

  const actualDigest = sha256Transform.digest;
  const expectedDigest = KNOWN_SHA256[slug];

  if (expectedDigest && actualDigest !== expectedDigest) {
    unlinkSync(outputPath);
    throw new Error(
      `SHA-256 mismatch for ffmpeg-${slug}!\n` +
        `  expected : ${expectedDigest}\n` +
        `  actual   : ${actualDigest}\n` +
        "The downloaded binary has been removed. " +
        "This may indicate a supply-chain issue or a stale KNOWN_SHA256 entry."
    );
  }

  if (expectedDigest) {
    console.log(`  SHA-256  : ${actualDigest} ✓`);
  } else {
    console.warn(
      `  WARNING: No expected SHA-256 for ${slug}. ` +
        "Add it to KNOWN_SHA256 in scripts/download-ffmpeg.mjs."
    );
  }

  if (!isWindows) {
    chmodSync(outputPath, 0o755);
  }

  console.log(`Done: ${outputPath}`);
}

main().catch((err) => {
  console.error("download-ffmpeg failed:", err.message);
  process.exit(1);
});
