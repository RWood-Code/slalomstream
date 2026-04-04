import { Router } from "express";
import { db } from "@workspace/db";
import { skiersTable, insertSkierSchema } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  const tournamentId = parseInt((req.params as any).id);
  const skiers = await db.select().from(skiersTable).where(eq(skiersTable.tournament_id, tournamentId)).orderBy(skiersTable.surname);
  res.json(skiers);
});

router.post("/", async (req, res) => {
  const tournamentId = parseInt((req.params as any).id);
  const body = insertSkierSchema.parse({ ...req.body, tournament_id: tournamentId });
  const [skier] = await db.insert(skiersTable).values(body).returning();
  res.status(201).json(skier);
});

// POST /bulk — import multiple skiers at once from a CSV start list.
// Body: { skiers: Array<{ first_name, surname, division?, club?, pin? }> }
// Skips rows where first_name+surname already exist in this tournament (case-insensitive).
router.post("/bulk", async (req, res) => {
  const tournamentId = parseInt((req.params as any).id);
  const rows: any[] = Array.isArray(req.body.skiers) ? req.body.skiers : [];

  const existing = await db
    .select({ first_name: skiersTable.first_name, surname: skiersTable.surname })
    .from(skiersTable)
    .where(eq(skiersTable.tournament_id, tournamentId));

  const existingKeys = new Set(
    existing.map(s => `${s.first_name.toLowerCase()}||${s.surname.toLowerCase()}`)
  );

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const first_name = String(row.first_name ?? '').trim();
    const surname = String(row.surname ?? '').trim();
    if (!first_name || !surname) {
      errors.push({ row: i + 1, reason: 'Missing name' });
      continue;
    }
    const key = `${first_name.toLowerCase()}||${surname.toLowerCase()}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    try {
      const body = insertSkierSchema.parse({
        tournament_id: tournamentId,
        first_name,
        surname,
        division: row.division || null,
        club: row.club || null,
        pin: row.pin || null,
      });
      await db.insert(skiersTable).values(body);
      existingKeys.add(key);
      imported++;
    } catch (err: any) {
      errors.push({ row: i + 1, reason: err.message ?? 'Insert failed' });
    }
  }

  res.json({ imported, skipped, errors });
});

export const skierRouter = Router();

skierRouter.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const updateSchema = insertSkierSchema.partial();
  const body = updateSchema.parse(req.body);
  const [skier] = await db.update(skiersTable).set(body).where(eq(skiersTable.id, id)).returning();
  if (!skier) return res.status(404).json({ error: "Not found" });
  res.json(skier);
});

skierRouter.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(skiersTable).where(eq(skiersTable.id, id));
  res.status(204).send();
});

export default router;
