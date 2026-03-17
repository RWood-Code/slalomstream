import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { appSettingsTable, officialsRegisterTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { startSurePathClient, stopSurePathClient } from "../services/surepath-client";

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

async function getOrCreateSettings() {
  const [settings] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1));
  if (settings) return settings;
  const [created] = await db.insert(appSettingsTable).values({ id: 1, waterskiconnect_enabled: false, surepath_enabled: false }).returning();
  return created;
}

router.get("/", async (_req, res) => {
  const settings = await getOrCreateSettings();
  res.json(settings);
});

router.put("/", async (req, res) => {
  const body = req.body as Record<string, unknown>;

  await getOrCreateSettings();

  // Build a partial update — only touch fields that were explicitly provided.
  // This makes the endpoint merge-safe: a caller sending only { github_repo }
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
  if ("connection_mode"         in body) patch.connection_mode          = (body.connection_mode as string) || "local";
  if ("public_url"              in body) patch.public_url               = (body.public_url as string | null) ?? null;
  if ("github_repo"             in body) patch.github_repo              = (body.github_repo as string | null) ?? null;
  if ("update_download_url"     in body) patch.update_download_url      = (body.update_download_url as string | null) ?? null;

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

  // No admin PIN configured → open access
  if (!settings.admin_pin) {
    // Still allow if the pin matches an official admin PIN
    const officialAdmin = await db
      .select()
      .from(officialsRegisterTable)
      .where(and(eq(officialsRegisterTable.is_admin, true), eq(officialsRegisterTable.pin, String(pin))))
      .limit(1);
    const token = createAdminSession();
    if (officialAdmin.length > 0) return res.json({ valid: true, token, admin_name: `${officialAdmin[0].first_name} ${officialAdmin[0].surname}` });
    return res.json({ valid: true, token });
  }

  // Check global admin PIN
  if (settings.admin_pin === String(pin)) return res.json({ valid: true, token: createAdminSession() });

  // Check official admin PINs
  const officialAdmin = await db
    .select()
    .from(officialsRegisterTable)
    .where(and(eq(officialsRegisterTable.is_admin, true), eq(officialsRegisterTable.pin, String(pin))))
    .limit(1);
  if (officialAdmin.length > 0) return res.json({ valid: true, token: createAdminSession(), admin_name: `${officialAdmin[0].first_name} ${officialAdmin[0].surname}` });

  res.status(401).json({ valid: false });
});

export default router;
