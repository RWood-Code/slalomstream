import { Request, Response, NextFunction } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { isValidAdminSession } from "../routes/settings";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Path to the flag file the Rust process creates when a Cloudflare tunnel is
 * active and deletes when it stops. Using the filesystem (rather than an HTTP
 * endpoint) makes this unforgeable from the public network — no remote client
 * can create this file.
 *
 * Rust lifecycle:
 *   setup()          → fs::remove_file (clears crash-state)
 *   URL received     → fs::write       (tunnel is live)
 *   Terminated/stop  → fs::remove_file
 *   ExitRequested    → fs::remove_file
 */
const TUNNEL_FLAG = path.join(os.tmpdir(), "slalomstream-tunnel-active");

/** Simple TTL cache so we don't stat() the file on every write request. */
let cachedActive: boolean | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 500;

function isTunnelActive(): boolean {
  const now = Date.now();
  if (cachedActive !== null && now < cacheExpiry) {
    return cachedActive;
  }
  cachedActive = fs.existsSync(TUNNEL_FLAG);
  cacheExpiry = now + CACHE_TTL_MS;
  return cachedActive;
}

export async function requireAdminIfPublic(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!WRITE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (!isTunnelActive()) {
    next();
    return;
  }

  const token = req.headers["x-admin-token"] as string | undefined;
  if (!isValidAdminSession(token)) {
    res.status(403).json({
      error: "Admin token required",
      message:
        "The tunnel is active. Write operations require a valid X-Admin-Token header.",
    });
    return;
  }

  next();
}
