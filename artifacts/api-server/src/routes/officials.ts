import { Router } from "express";
import { db } from "@workspace/db";
import { officialsRegisterTable, judgesTable } from "@workspace/db";
import { eq, asc, isNull, or } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const { region, grade, financial } = req.query;
  let all = await db.select().from(officialsRegisterTable).orderBy(asc(officialsRegisterTable.surname), asc(officialsRegisterTable.first_name));
  if (region) all = all.filter(o => o.region === region);
  if (grade) all = all.filter(o => o.slalom_grade === grade);
  if (financial === "true") all = all.filter(o => o.financial);
  res.json(all);
});

router.post("/", async (req, res) => {
  const { first_name, surname, region, financial, slalom_grade, slalom_notes } = req.body;
  if (!first_name || !surname || !region) return res.status(400).json({ error: "first_name, surname and region required" });
  const [official] = await db.insert(officialsRegisterTable).values({ first_name, surname, region, financial: !!financial, slalom_grade: slalom_grade || null, slalom_notes: slalom_notes || null, is_active: true }).returning();
  res.status(201).json(official);
});

/** POST /auto-assign-pins — generate unique 4-digit PINs for every active official who doesn't have one */
router.post("/auto-assign-pins", async (req, res) => {
  // Collect all PINs already in use (officials + tournament judges)
  const existing = await db.select({ pin: officialsRegisterTable.pin }).from(officialsRegisterTable);
  const judges   = await db.select({ pin: judgesTable.pin }).from(judgesTable);

  const usedPins = new Set<string>(
    [...existing, ...judges]
      .map(r => r.pin)
      .filter((p): p is string => !!p)
  );

  // Officials who need a PIN
  const needsPin = await db
    .select()
    .from(officialsRegisterTable)
    .where(eq(officialsRegisterTable.is_active, true))
    .orderBy(asc(officialsRegisterTable.id));

  const toAssign = needsPin.filter(o => !o.pin);

  let assigned = 0;
  const results: Array<{ id: number; name: string; pin: string }> = [];

  for (const official of toAssign) {
    // Generate a unique 4-digit PIN
    let pin: string;
    let attempts = 0;
    do {
      pin = String(Math.floor(1000 + Math.random() * 9000));
      attempts++;
    } while (usedPins.has(pin) && attempts < 1000);

    usedPins.add(pin);

    await db
      .update(officialsRegisterTable)
      .set({ pin })
      .where(eq(officialsRegisterTable.id, official.id));

    results.push({ id: official.id, name: `${official.first_name} ${official.surname}`, pin });
    assigned++;
  }

  res.json({ assigned, results });
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { first_name, surname, region, financial, slalom_grade, slalom_notes, is_active, pin, judge_role, is_admin } = req.body;
  const [official] = await db.update(officialsRegisterTable).set({
    first_name,
    surname,
    region,
    financial: !!financial,
    slalom_grade: slalom_grade || null,
    slalom_notes: slalom_notes || null,
    is_active: is_active ?? true,
    pin: pin !== undefined ? (pin === '' ? null : String(pin)) : undefined,
    judge_role: judge_role !== undefined ? (judge_role === '' ? null : judge_role) : undefined,
    is_admin: is_admin !== undefined ? !!is_admin : undefined,
  }).where(eq(officialsRegisterTable.id, id)).returning();
  if (!official) return res.status(404).json({ error: "Not found" });
  res.json(official);
});

/** PATCH /:id/pin — set or clear a PIN, role, and admin flag for an official */
router.patch("/:id/pin", async (req, res) => {
  const id = parseInt(req.params.id);
  const { pin, judge_role, is_admin } = req.body;
  const update: Record<string, string | boolean | null | undefined> = {
    pin: pin === '' || pin == null ? null : String(pin),
  };
  if (judge_role !== undefined) update.judge_role = judge_role === '' ? null : judge_role;
  if (is_admin !== undefined) update.is_admin = !!is_admin;
  const [official] = await db.update(officialsRegisterTable).set(update as any).where(eq(officialsRegisterTable.id, id)).returning();
  if (!official) return res.status(404).json({ error: "Not found" });
  res.json(official);
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(officialsRegisterTable).where(eq(officialsRegisterTable.id, id));
  res.status(204).send();
});

export default router;
