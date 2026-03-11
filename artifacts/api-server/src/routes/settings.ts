import { Router } from "express";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { startSurePathClient, stopSurePathClient } from "../services/surepath-client";

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
  if (!settings.admin_pin) return res.json({ valid: true });
  if (settings.admin_pin === String(pin)) return res.json({ valid: true });
  res.status(401).json({ valid: false });
});

export default router;
