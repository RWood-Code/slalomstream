import { Router } from "express";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

async function getOrCreateSettings() {
  const [settings] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1));
  if (settings) return settings;
  const [created] = await db.insert(appSettingsTable).values({ id: 1, waterskiconnect_enabled: false }).returning();
  return created;
}

router.get("/", async (_req, res) => {
  const settings = await getOrCreateSettings();
  res.json(settings);
});

router.put("/", async (req, res) => {
  const { admin_pin, waterskiconnect_enabled, active_tournament_id } = req.body;
  await getOrCreateSettings();
  const [updated] = await db
    .update(appSettingsTable)
    .set({
      admin_pin: admin_pin ?? null,
      waterskiconnect_enabled: waterskiconnect_enabled ?? false,
      active_tournament_id: active_tournament_id ?? null,
    })
    .where(eq(appSettingsTable.id, 1))
    .returning();
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
