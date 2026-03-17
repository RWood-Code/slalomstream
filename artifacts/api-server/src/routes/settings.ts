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
  const {
    admin_pin,
    waterskiconnect_enabled,
    waterskiconnect_url,
    waterskiconnect_token,
    surepath_enabled,
    surepath_event_name,
    surepath_event_sub_id,
    surepath_observer_pin,
    active_tournament_id,
    connection_mode,
    public_url,
    github_repo,
  } = req.body;

  await getOrCreateSettings();

  const [updated] = await db
    .update(appSettingsTable)
    .set({
      admin_pin: admin_pin ?? null,
      waterskiconnect_enabled: waterskiconnect_enabled ?? false,
      waterskiconnect_url: waterskiconnect_url ?? null,
      waterskiconnect_token: waterskiconnect_token ?? null,
      surepath_enabled: surepath_enabled ?? false,
      surepath_event_name: surepath_event_name ?? null,
      surepath_event_sub_id: surepath_event_sub_id ?? null,
      surepath_observer_pin: surepath_observer_pin ?? null,
      active_tournament_id: active_tournament_id ?? null,
      connection_mode: connection_mode ?? "local",
      public_url: public_url ?? null,
      github_repo: github_repo ?? null,
    })
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
