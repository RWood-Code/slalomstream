import { Router } from "express";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import path from "path";

const router = Router();

const UPDATE_LOG = "/tmp/slalom-update.log";

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

function readVersionFile(): { version: string; github_repo: string } {
  try {
    return JSON.parse(readFileSync(findVersionFile(), "utf-8"));
  } catch {
    return { version: "unknown", github_repo: "" };
  }
}

// ─── GET /api/update/check ────────────────────────────────────────────────────
router.get("/check", async (_req, res) => {
  const local = readVersionFile();

  const [settings] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1)).catch(() => [null]);
  const repo = (settings as any)?.github_repo || local.github_repo || "";

  if (!repo) {
    return res.json({ status: "no_repo", current: local.version });
  }

  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "SlalomStream" },
    });

    if (resp.status === 404) {
      return res.json({ status: "no_releases", current: local.version, repo });
    }
    if (!resp.ok) {
      return res.json({ status: "error", error: `GitHub API: HTTP ${resp.status}`, current: local.version });
    }

    const data: any = await resp.json();
    const latest = String(data.tag_name ?? "").replace(/^v/, "");
    const upToDate = local.version === latest || !latest;

    return res.json({
      status: upToDate ? "up_to_date" : "update_available",
      current: local.version,
      latest,
      release_notes: data.body || null,
      html_url: data.html_url || null,
    });
  } catch (err: any) {
    return res.json({ status: "error", error: err.message, current: local.version });
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
  if (updateInProgress) {
    return res.status(409).json({ error: "Update already in progress" });
  }

  updateInProgress = true;

  try {
    writeFileSync(UPDATE_LOG, `[${new Date().toISOString()}] Starting update…\n`);
  } catch {}

  res.json({ started: true });

  const log = (msg: string) => {
    try { appendFileSync(UPDATE_LOG, msg); } catch {}
    process.stdout.write("[Update] " + msg);
  };

  const rootDir = findWorkspaceRoot();

  const steps: Array<{ cmd: string; args: string[]; label: string }> = [
    { cmd: "git",  args: ["pull"],                                              label: "git pull" },
    { cmd: "pnpm", args: ["install"],                                           label: "pnpm install" },
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
            reject(new Error(`${step.label} exited with code ${code}`));
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
      log(`\n✗ Update failed: ${err.message}\n`);
      updateInProgress = false;
    });
});

export default router;
