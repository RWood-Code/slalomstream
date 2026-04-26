import { Router } from "express";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { db } from "@workspace/db";
import { appSettingsTable, officialsRegisterTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { startSurePathClient, stopSurePathClient } from "../services/surepath-client";

const TUNNEL_FLAG = path.join(os.tmpdir(), "slalomstream-tunnel-active");

// In-memory admin session tokens: token → expiry timestamp
export const adminSessions = new Map<string, number>();

function createAdminSession(): string {
  const token = randomUUID();
  // Token valid for 8 hours
  adminSessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
  return token;
}

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [token, expiry] of adminSessions) {
    if (now > expiry) adminSessions.delete(token);
  }
}

export function isValidAdminSession(token: string | undefined): boolean {
  if (!token) return false;
  pruneExpiredSessions();
  return adminSessions.has(token);
}

const router = Router();

/** GET /check — returns 200 if the current X-Admin-Token is valid, 401 otherwise */
router.get("/check", (req, res) => {
  const token = req.headers["x-admin-token"] as string | undefined;
  if (!isValidAdminSession(token)) {
    res.status(401).json({ valid: false });
    return;
  }
  res.json({ valid: true });
});

async function getOrCreateSettings() {
  const [settings] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1));
  if (settings) return settings;
  const [created] = await db.insert(appSettingsTable).values({ id: 1, waterskiconnect_enabled: false, surepath_enabled: false }).returning();
  return created;
}

router.get("/", async (_req, res) => {
  const settings = await getOrCreateSettings();
  // Never expose sensitive credentials over the network — the PIN is a write-auth secret,
  // returning it would allow any public client to read it and mint an admin token.
  // The frontend only needs to know whether a PIN exists, not its value.
  const { admin_pin, ...safe } = settings;
  res.json({ ...safe, has_admin_pin: admin_pin !== null && admin_pin !== "" });
});

router.put("/", async (req, res) => {
  const body = req.body as Record<string, unknown>;

  await getOrCreateSettings();

  // Build a partial update — only touch fields that were explicitly provided.
  // This makes the endpoint merge-safe: a caller sending only one field
  // will not accidentally reset admin_pin, waterskiconnect settings, etc.
  const patch: Partial<typeof appSettingsTable.$inferInsert> = {};

  if ("admin_pin"               in body) patch.admin_pin               = (body.admin_pin as string | null) ?? null;
  if ("waterskiconnect_enabled" in body) patch.waterskiconnect_enabled  = Boolean(body.waterskiconnect_enabled);
  if ("waterskiconnect_url"     in body) patch.waterskiconnect_url      = (body.waterskiconnect_url as string | null) ?? null;
  if ("waterskiconnect_token"   in body) patch.waterskiconnect_token    = (body.waterskiconnect_token as string | null) ?? null;
  if ("surepath_enabled"        in body) patch.surepath_enabled         = Boolean(body.surepath_enabled);
  if ("surepath_event_name"     in body) patch.surepath_event_name      = (body.surepath_event_name as string | null) ?? null;
  if ("surepath_event_sub_id"   in body) patch.surepath_event_sub_id    = (body.surepath_event_sub_id as string | null) ?? null;
  if ("surepath_observer_pin"   in body) patch.surepath_observer_pin    = (body.surepath_observer_pin as string | null) ?? null;
  if ("active_tournament_id"    in body) patch.active_tournament_id     = (body.active_tournament_id as number | null) ?? null;
  if ("connection_mode"            in body) patch.connection_mode             = (body.connection_mode as string) || "local";
  if ("public_url"                 in body) patch.public_url                  = (body.public_url as string | null) ?? null;
  if ("cloudflare_tunnel_token"    in body) patch.cloudflare_tunnel_token     = (body.cloudflare_tunnel_token as string | null) ?? null;
  if ("update_download_url"        in body) patch.update_download_url         = (body.update_download_url as string | null) ?? null;

  if (Object.keys(patch).length === 0) {
    const current = await getOrCreateSettings();
    return res.json(current);
  }

  const [updated] = await db
    .update(appSettingsTable)
    .set(patch)
    .where(eq(appSettingsTable.id, 1))
    .returning();

  // Restart SurePath client if its settings changed
  stopSurePathClient();
  if (updated.surepath_enabled) {
    startSurePathClient().catch(err => console.error("[SurePath] Restart error:", err));
  }

  res.json(updated);
});

export const adminRouter = Router();

adminRouter.post("/verify-pin", async (req, res) => {
  const { pin } = req.body;
  const settings = await getOrCreateSettings();
  const tunnelIsActive = fs.existsSync(TUNNEL_FLAG);

  // Always check official admin PINs first (works with or without a global PIN)
  const officialAdmin = await db
    .select()
    .from(officialsRegisterTable)
    .where(and(eq(officialsRegisterTable.is_admin, true), eq(officialsRegisterTable.pin, String(pin))))
    .limit(1);
  if (officialAdmin.length > 0) {
    return res.json({ valid: true, token: createAdminSession(), admin_name: `${officialAdmin[0].first_name} ${officialAdmin[0].surname}` });
  }

  // Check global admin PIN
  if (settings.admin_pin && settings.admin_pin === String(pin)) {
    return res.json({ valid: true, token: createAdminSession() });
  }

  // No admin PIN configured and no official admin matched:
  // - Local-only mode: allow open access (no public exposure risk)
  // - Tunnel active: REFUSE — issuing tokens without PIN validation would let
  //   any public client escalate to admin while the app is publicly reachable.
  if (!settings.admin_pin && !tunnelIsActive) {
    return res.json({ valid: true, token: createAdminSession() });
  }

  res.status(401).json({ valid: false });
});

export default router;
