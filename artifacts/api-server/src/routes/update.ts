import { Router } from "express";
import { spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import path from "path";
import os from "os";
import { isValidAdminSession } from "./settings.js";

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
    const upToDate = current === latest || !latest;

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
    const content = existsSync(UPDATE_LOG) ? readFileSync(UPDATE_LOG, "utf-8") : "";
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

export default router;
