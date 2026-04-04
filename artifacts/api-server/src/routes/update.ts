import { Router } from "express";
import { spawn } from "child_process";
import { existsSync, readFileSync, readSync, openSync, closeSync, fstatSync, writeFileSync, appendFileSync, mkdirSync, rmSync, cpSync, readdirSync, createWriteStream } from "fs";
import path from "path";
import os from "os";
import { pipeline } from "stream/promises";
import multer from "multer";
import AdmZip from "adm-zip";
import { isValidAdminSession } from "./settings.js";
import { getUncachableDropboxClient } from "../services/dropbox-client.js";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const UPDATE_LOG = path.join(os.tmpdir(), "slalom-update.log");

function findVersionFile(): string {
  // Try cwd (workspace root in prod) then two levels up (api-server/ in dev)
  const candidates = [
    path.resolve(process.cwd(), "version.json"),
    path.resolve(process.cwd(), "../../version.json"),
    path.resolve(process.cwd(), "../../../version.json"),
  ];
  return candidates.find(p => existsSync(p)) ?? candidates[0];
}

function findWorkspaceRoot(): string {
  const vf = findVersionFile();
  return existsSync(vf) ? path.dirname(vf) : process.cwd();
}

interface VersionFile {
  version: string;
  github_repo?: string;
}

function readVersionFile(): VersionFile {
  try {
    return JSON.parse(readFileSync(findVersionFile(), "utf-8")) as VersionFile;
  } catch {
    return { version: "unknown" };
  }
}

interface GitHubRelease {
  tag_name: string;
  body: string | null;
  html_url: string;
}

/** Read up to the last `maxBytes` of a file (avoids unbounded payload growth). */
function tailFile(filePath: string, maxBytes = 50 * 1024): string {
  if (!existsSync(filePath)) return "";
  const fd = openSync(filePath, "r");
  try {
    const { size } = fstatSync(fd);
    const offset = Math.max(0, size - maxBytes);
    const length = size - offset;
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, offset);
    const text = buf.toString("utf-8");
    // Skip a partial first line when we truncated
    return offset > 0 ? text.slice(text.indexOf("\n") + 1) : text;
  } finally {
    try { closeSync(fd); } catch { /* noop */ }
  }
}

/** Returns true when `latest` is strictly newer than `current` (semver numeric). */
function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
  const [lMaj, lMin, lPat] = parse(latest);
  const [cMaj, cMin, cPat] = parse(current);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

// ─── GET /api/update/version ─────────────────────────────────────────────────
router.get("/version", (_req, res) => {
  const local = readVersionFile();
  res.json({ version: local.version });
});

// ─── GET /api/update/check ────────────────────────────────────────────────────
router.get("/check", async (_req, res) => {
  const local = readVersionFile();
  const current = local.version;

  // Preflight: verify git is available
  const gitOk = await new Promise<boolean>(resolve => {
    const proc = spawn("git", ["--version"], { shell: true });
    proc.on("close", code => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
  if (!gitOk) {
    return res.json({ status: "no_git", current, message: "git is not installed on this server — self-update is not available." });
  }

  // Preflight: verify this directory is a git repo with a remote
  const rootDir = findWorkspaceRoot();
  const hasRemote = await new Promise<boolean>(resolve => {
    const proc = spawn("git", ["remote", "get-url", "origin"], { cwd: rootDir, shell: true });
    proc.on("close", code => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
  if (!hasRemote) {
    return res.json({ status: "no_remote", current, message: "No git remote named 'origin' is configured. Clone the repo with git to enable self-update." });
  }

  // Fetch github_repo from settings DB (falls back to version.json field)
  let repo = local.github_repo ?? "";
  try {
    const { db } = await import("@workspace/db");
    const { appSettingsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [settings] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1));
    if (settings?.github_repo) repo = settings.github_repo;
  } catch {
    // DB unavailable — use version.json value
  }

  if (!repo) {
    return res.json({ status: "no_repo", current });
  }

  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "SlalomStream" },
    });

    if (resp.status === 404) {
      return res.json({ status: "no_releases", current, repo });
    }
    if (!resp.ok) {
      return res.json({ status: "error", error: `GitHub API: HTTP ${resp.status}`, current });
    }

    const data = (await resp.json()) as GitHubRelease;
    const latest = String(data.tag_name ?? "").replace(/^v/, "");
    const upToDate = !latest || !isNewerVersion(latest, current);

    return res.json({
      status: upToDate ? "up_to_date" : "update_available",
      current,
      latest,
      release_notes: data.body ?? null,
      html_url: data.html_url ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.json({ status: "error", error: message, current });
  }
});

// ─── GET /api/update/log ──────────────────────────────────────────────────────
router.get("/log", (_req, res) => {
  try {
    const content = tailFile(UPDATE_LOG);
    res.json({ log: content, in_progress: updateInProgress });
  } catch {
    res.json({ log: "", in_progress: false });
  }
});

// ─── POST /api/update/apply ───────────────────────────────────────────────────
let updateInProgress = false;

router.post("/apply", (_req, res) => {
  // Require valid admin session token
  const token = _req.headers["x-admin-token"] as string | undefined;
  if (!isValidAdminSession(token)) {
    return res.status(401).json({ error: "Admin authentication required. Please re-open Admin and log in." });
  }

  if (updateInProgress) {
    return res.status(409).json({ error: "Update already in progress" });
  }

  updateInProgress = true;

  try {
    writeFileSync(UPDATE_LOG, `[${new Date().toISOString()}] Starting update…\n`);
  } catch {
    // log write failed — proceed anyway
  }

  res.json({ started: true });

  const log = (msg: string) => {
    try { appendFileSync(UPDATE_LOG, msg); } catch { /* ignore */ }
    process.stdout.write("[Update] " + msg);
  };

  const rootDir = findWorkspaceRoot();

  const steps: Array<{ cmd: string; args: string[]; label: string }> = [
    { cmd: "git",  args: ["pull"],                                                label: "git pull" },
    { cmd: "pnpm", args: ["install"],                                             label: "pnpm install" },
    { cmd: "pnpm", args: ["--filter", "@workspace/api-server",   "run", "build"], label: "Build server" },
    { cmd: "pnpm", args: ["--filter", "@workspace/slalom-stream", "run", "build"], label: "Build frontend" },
  ];

  async function runSteps() {
    for (const step of steps) {
      log(`\n>>> ${step.label}\n`);
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(step.cmd, step.args, { cwd: rootDir, shell: true });
        proc.stdout.on("data", (d: Buffer) => log(d.toString()));
        proc.stderr.on("data", (d: Buffer) => log(d.toString()));
        proc.on("close", code => {
          if (code === 0) {
            log(`>>> ${step.label} — done\n`);
            resolve();
          } else {
            reject(new Error(`${step.label} exited with code ${String(code)}`));
          }
        });
        proc.on("error", reject);
      });
    }
  }

  runSteps()
    .then(() => {
      log("\n✓ Update complete. Server will restart now.\n");
      setTimeout(() => process.exit(42), 1500);
    })
    .catch(err => {
      const message = err instanceof Error ? err.message : String(err);
      log(`\n✗ Update failed: ${message}\n`);
      updateInProgress = false;
    });
});

// ─── GET /api/update/download — generate & stream a fresh update ZIP ─────────
router.get("/download", (_req, res) => {
  const wsRoot          = findWorkspaceRoot();
  const versionInfo     = readVersionFile();
  const apiDistPath     = path.join(wsRoot, "artifacts", "api-server",   "dist");
  const frontendDistPath = path.join(wsRoot, "artifacts", "slalom-stream", "dist");
  const versionFilePath = path.join(wsRoot, "version.json");

  // Vite outputs to dist/public — check for the actual built index.html
  const frontendIndexPath = path.join(wsRoot, "artifacts", "slalom-stream", "dist", "public", "index.html");
  const hasApiDist        = existsSync(path.join(apiDistPath, "index.cjs"));
  const hasFrontendDist   = existsSync(frontendIndexPath);

  if (!hasApiDist && !hasFrontendDist) {
    return res.status(503).json({
      error: "No built dist files found on this server. The app needs to be built before a download ZIP can be generated.",
    });
  }

  try {
    const zip = new AdmZip();

    if (existsSync(versionFilePath)) {
      zip.addLocalFile(versionFilePath, "");
    }
    if (hasApiDist) {
      zip.addLocalFolder(apiDistPath, "artifacts/api-server/dist");
    }
    if (hasFrontendDist) {
      // Package the whole dist folder (which contains public/ inside)
      zip.addLocalFolder(frontendDistPath, "artifacts/slalom-stream/dist");
    }

    const filename = `slalomstream-v${versionInfo.version}.zip`;
    const buffer = zip.toBuffer();

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to generate ZIP: ${String(err.message)}` });
  }
});

// ─── ZIP Upload Update ────────────────────────────────────────────────────────
// Stored in-memory between /upload (scan) and /apply-zip (commit)
interface PendingZip {
  tempPath: string;
  extractedRoot: string;
  version: string;
  hasApiDist: boolean;
  hasFrontendDist: boolean;
  uploadedAt: number;
}
let pendingZip: PendingZip | null = null;

const zipUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/zip" || file.originalname.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("Only .zip files are accepted"));
    }
  },
});

/**
 * Find the workspace root inside an extracted ZIP directory.
 * The ZIP may have a top-level wrapper folder (e.g. workspace-slalom-stream/).
 * We look for version.json as the anchor.
 */
function findExtractedRoot(tmpDir: string): string | null {
  // Check root directly
  if (existsSync(path.join(tmpDir, "version.json"))) return tmpDir;
  // Check one level deep (Replit wraps in a folder)
  try {
    for (const entry of readdirSync(tmpDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const candidate = path.join(tmpDir, entry.name);
        if (existsSync(path.join(candidate, "version.json"))) return candidate;
      }
    }
  } catch { /* ignore */ }
  return null;
}

/** Copy `src` directory into `dest`, creating dest if needed. */
function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true, force: true });
}

/** Extract a ZIP from a temp file path, validate it, and store it as pendingZip. Returns scan result or throws. */
async function scanAndStorePendingZip(tempZipPath: string): Promise<{ version: string; currentVersion: string; hasApiDist: boolean; hasFrontendDist: boolean; ready: boolean }> {
  const extractDir = path.join(os.tmpdir(), `slalom-zip-${Date.now()}`);

  const zip = new AdmZip(tempZipPath);
  zip.extractAllTo(extractDir, true);

  const wsRoot = findExtractedRoot(extractDir);
  if (!wsRoot) {
    rmSync(extractDir, { recursive: true, force: true });
    throw Object.assign(new Error("This doesn't look like a SlalomStream ZIP — could not find version.json."), { statusCode: 422 });
  }

  let version = "unknown";
  try {
    const vf = JSON.parse(readFileSync(path.join(wsRoot, "version.json"), "utf-8"));
    version = vf.version ?? "unknown";
  } catch { /* unknown is fine */ }

  const hasApiDist      = existsSync(path.join(wsRoot, "artifacts", "api-server",   "dist", "index.cjs"));
  // Vite outputs to dist/public — check the real built file location
  const hasFrontendDist = existsSync(path.join(wsRoot, "artifacts", "slalom-stream", "dist", "public", "index.html"));

  if (!hasApiDist && !hasFrontendDist) {
    rmSync(extractDir, { recursive: true, force: true });
    throw Object.assign(new Error("The ZIP does not contain any built files (dist directories are missing)."), { statusCode: 422 });
  }

  if (pendingZip) {
    try { rmSync(pendingZip.extractedRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  pendingZip = { tempPath: tempZipPath, extractedRoot: wsRoot, version, hasApiDist, hasFrontendDist, uploadedAt: Date.now() };

  const currentVersion = readVersionFile().version;
  return { version, currentVersion, hasApiDist, hasFrontendDist, ready: true };
}

// POST /api/update/upload  — receive ZIP, scan contents, return preview
router.post("/upload", (req, res, next) => {
  const token = req.headers["x-admin-token"] as string | undefined;
  if (!isValidAdminSession(token)) {
    return res.status(401).json({ error: "Admin authentication required." });
  }
  next();
}, zipUpload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  try {
    const result = await scanAndStorePendingZip(req.file.path);
    res.json(result);
  } catch (err: any) {
    const status = (err as any).statusCode ?? 500;
    res.status(status).json({ error: err.message ?? "Failed to read ZIP" });
  }
});

// POST /api/update/fetch  — server fetches ZIP from configured download URL, scans, returns preview
router.post("/fetch", async (req, res) => {
  const token = req.headers["x-admin-token"] as string | undefined;
  if (!isValidAdminSession(token)) {
    return res.status(401).json({ error: "Admin authentication required." });
  }

  // Read download URL from settings
  let downloadUrl = "";
  try {
    const { db } = await import("@workspace/db");
    const { appSettingsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [settings] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1));
    downloadUrl = settings?.update_download_url ?? "";
  } catch {
    return res.status(500).json({ error: "Could not read settings from database." });
  }

  if (!downloadUrl) {
    return res.status(400).json({ error: "No update download URL is configured. Set one in Admin → Software Update first." });
  }

  const tempZipPath = path.join(os.tmpdir(), `slalom-fetch-${Date.now()}.zip`);

  try {
    const response = await fetch(downloadUrl, { redirect: "follow" });
    if (!response.ok) {
      return res.status(502).json({ error: `Download failed: server returned HTTP ${response.status}. Check the download URL is correct and publicly accessible.` });
    }
    if (!response.body) {
      return res.status(502).json({ error: "No response body from download URL." });
    }

    // Stream to temp file
    const fileStream = createWriteStream(tempZipPath);
    await pipeline(response.body as any, fileStream);

    const result = await scanAndStorePendingZip(tempZipPath);
    res.json(result);
  } catch (err: any) {
    try { rmSync(tempZipPath, { force: true }); } catch { /* ignore */ }
    const status = (err as any).statusCode ?? 502;
    res.status(status).json({ error: err.message ?? "Failed to fetch update" });
  }
});

// POST /api/update/apply-zip  — commit the scanned ZIP and restart
router.post("/apply-zip", (req, res) => {
  const token = req.headers["x-admin-token"] as string | undefined;
  if (!isValidAdminSession(token)) {
    return res.status(401).json({ error: "Admin authentication required." });
  }
  if (!pendingZip) {
    return res.status(400).json({ error: "No ZIP uploaded yet. Upload a ZIP first." });
  }
  // Reject stale uploads (older than 10 minutes)
  if (Date.now() - pendingZip.uploadedAt > 10 * 60 * 1000) {
    pendingZip = null;
    return res.status(400).json({ error: "Upload expired — please upload the ZIP again." });
  }
  if (updateInProgress) {
    return res.status(409).json({ error: "Another update is already in progress." });
  }

  updateInProgress = true;
  const { extractedRoot, hasApiDist, hasFrontendDist, version } = pendingZip;

  try {
    writeFileSync(UPDATE_LOG, `[${new Date().toISOString()}] Applying ZIP update to v${version}…\n`);
  } catch { /* ignore */ }

  res.json({ started: true });

  const log = (msg: string) => {
    try { appendFileSync(UPDATE_LOG, msg); } catch { /* ignore */ }
    process.stdout.write("[ZIP Update] " + msg);
  };

  const wsRoot = findWorkspaceRoot();

  setTimeout(() => {
    try {
      if (hasApiDist) {
        const src  = path.join(extractedRoot, "artifacts", "api-server",   "dist");
        const dest = path.join(wsRoot,         "artifacts", "api-server",   "dist");
        log(`Copying server dist…\n`);
        copyDir(src, dest);
        log(`Server dist copied.\n`);
      }
      if (hasFrontendDist) {
        const src  = path.join(extractedRoot, "artifacts", "slalom-stream", "dist");
        const dest = path.join(wsRoot,         "artifacts", "slalom-stream", "dist");
        log(`Copying frontend dist…\n`);
        copyDir(src, dest);
        log(`Frontend dist copied.\n`);
      }
      // Update version.json
      const srcVf  = path.join(extractedRoot, "version.json");
      const destVf = path.join(wsRoot,         "version.json");
      if (existsSync(srcVf)) {
        cpSync(srcVf, destVf, { force: true });
        log(`version.json updated to v${version}.\n`);
      }

      log(`\n✓ ZIP update applied. Server will restart now.\n`);
      pendingZip = null;
      setTimeout(() => process.exit(42), 1000);
    } catch (err: any) {
      log(`\n✗ ZIP update failed: ${err.message}\n`);
      updateInProgress = false;
    }
  }, 100);
});

// ─── Push to Dropbox ─────────────────────────────────────────────────────────
// Builds the update ZIP in memory and uploads it to Dropbox, then saves the
// resulting shared-link as the `update_download_url` in app settings.
router.post("/push-to-dropbox", async (req, res) => {
  if (!isValidAdminSession(req.headers["x-admin-token"] as string | undefined)) {
    return res.status(401).json({ error: "Admin authentication required." });
  }

  const wsRoot          = findWorkspaceRoot();
  const versionInfo     = readVersionFile();
  const apiDistPath     = path.join(wsRoot, "artifacts", "api-server",   "dist");
  const frontendDistPath = path.join(wsRoot, "artifacts", "slalom-stream", "dist");
  const versionFilePath = path.join(wsRoot, "version.json");
  const frontendIndexPath = path.join(wsRoot, "artifacts", "slalom-stream", "dist", "public", "index.html");
  const hasApiDist       = existsSync(path.join(apiDistPath, "index.cjs"));
  const hasFrontendDist  = existsSync(frontendIndexPath);

  if (!hasApiDist && !hasFrontendDist) {
    return res.status(503).json({
      error: "No built dist files found. Build the app before pushing to Dropbox.",
    });
  }

  try {
    // 1. Build the ZIP buffer
    const zip = new AdmZip();
    if (existsSync(versionFilePath)) zip.addLocalFile(versionFilePath, "");
    if (hasApiDist)      zip.addLocalFolder(apiDistPath,      "artifacts/api-server/dist");
    if (hasFrontendDist) zip.addLocalFolder(frontendDistPath, "artifacts/slalom-stream/dist");
    const zipBuffer = zip.toBuffer();

    const filename   = `slalomstream-v${versionInfo.version}.zip`;
    const dropboxPath = `/SlalomStream/${filename}`;

    // 2. Upload to Dropbox
    const dbx = await getUncachableDropboxClient();
    const uploadRes = await dbx.filesUpload({
      path:     dropboxPath,
      contents: zipBuffer,
      mode:     { ".tag": "overwrite" },
    });
    const uploadedPath = (uploadRes.result as any).path_display as string;

    // 3. Create (or retrieve existing) shared link
    let sharedUrl: string;
    try {
      const linkRes = await dbx.sharingCreateSharedLinkWithSettings({
        path:     uploadedPath,
        settings: { requested_visibility: { ".tag": "public" } },
      });
      sharedUrl = (linkRes.result as any).url as string;
    } catch (linkErr: any) {
      // Dropbox returns a 409 when the link already exists — fetch the existing one
      const summary: string = linkErr?.error?.error_summary ?? "";
      if (summary.includes("shared_link_already_exists")) {
        const listRes = await dbx.sharingListSharedLinks({ path: uploadedPath, direct_only: true });
        const firstLink = (listRes.result as any).links?.[0];
        if (!firstLink) throw new Error("Could not retrieve existing Dropbox shared link.");
        sharedUrl = firstLink.url as string;
      } else {
        throw linkErr;
      }
    }

    // 4. Convert viewer URL → direct-download URL (?dl=0 or &dl=0 → dl=1)
    const downloadUrl = /[?&]dl=\d/.test(sharedUrl)
      ? sharedUrl.replace(/([?&])dl=\d/, "$1dl=1")
      : sharedUrl + (sharedUrl.includes("?") ? "&dl=1" : "?dl=1");

    // 5. Persist in app settings so venues can Fetch Update with one click
    const [existing] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1));
    if (existing) {
      await db.update(appSettingsTable).set({ update_download_url: downloadUrl }).where(eq(appSettingsTable.id, 1));
    } else {
      await db.insert(appSettingsTable).values({ id: 1, update_download_url: downloadUrl });
    }

    return res.json({
      ok:          true,
      version:     versionInfo.version,
      downloadUrl,
      fileSize:    zipBuffer.length,
      dropboxPath: uploadedPath,
    });
  } catch (err: any) {
    console.error("[push-to-dropbox]", err);
    return res.status(500).json({ error: err.message ?? "Dropbox upload failed." });
  }
});

export default router;
