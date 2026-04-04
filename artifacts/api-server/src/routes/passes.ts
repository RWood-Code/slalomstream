import { Router } from "express";
import { db } from "@workspace/db";
import { passesTable, judgeScoresTable, tournamentsTable, insertPassSchema } from "@workspace/db";
import { eq, desc, and, inArray, ilike, ne, isNotNull, isNull, or, max } from "drizzle-orm";

const ALL_SCORING_ROLES = ['judge_a', 'judge_b', 'judge_c', 'judge_d', 'judge_e'];
function getScoringRoles(judgeCount: number): string[] {
  return ALL_SCORING_ROLES.slice(0, Math.min(Math.max(judgeCount, 1), 5));
}

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  const tournamentId = parseInt((req.params as any).id);
  const passes = await db.select().from(passesTable).where(eq(passesTable.tournament_id, tournamentId)).orderBy(desc(passesTable.created_at));
  res.json(passes);
});

router.post("/", async (req, res) => {
  const tournamentId = parseInt((req.params as any).id);
  const body = insertPassSchema.parse({ ...req.body, tournament_id: tournamentId });
  const [pass] = await db.insert(passesTable).values(body).returning();
  res.status(201).json(pass);
});

export const passRouter = Router();

// GET /api/passes/personal-best?name=X&division=Y&exclude_pass_id=Z
// Returns the all-time highest buoys_scored for a given skier (by name+division),
// excluding one pass ID (the current one being checked, to avoid counting it as its own PB).
// Division "Open" is treated as equivalent to NULL — both map to the same logical division.
passRouter.get("/personal-best", async (req, res) => {
  const name = String(req.query.name ?? '').trim();
  const division = String(req.query.division ?? '').trim();
  const excludeId = req.query.exclude_pass_id ? parseInt(String(req.query.exclude_pass_id)) : null;

  if (!name) return res.status(400).json({ error: "name required" });
  if (!division) return res.status(400).json({ error: "division required" });

  // "Open" and NULL are the same logical division — match both in the query
  const divisionCondition = division === 'Open'
    ? or(isNull(passesTable.division), eq(passesTable.division, 'Open'))
    : eq(passesTable.division, division);

  const conditions = [
    eq(passesTable.skier_name, name),
    divisionCondition!,
    ne(passesTable.status, 'pending'),
    isNotNull(passesTable.buoys_scored),
    ...(excludeId ? [ne(passesTable.id, excludeId)] : []),
  ];

  const [result] = await db
    .select({ best: max(passesTable.buoys_scored) })
    .from(passesTable)
    .where(and(...conditions));

  res.json({ best: result?.best ?? null });
});

// GET /api/passes/personal-bests?tournament_id=X
// Returns a map of "skierName||division" → all-time max buoys_scored for every skier
// who has a pass in that tournament (across all tournaments).
passRouter.get("/personal-bests", async (req, res) => {
  const tournamentId = parseInt(String(req.query.tournament_id ?? ''));
  if (!tournamentId || isNaN(tournamentId)) return res.status(400).json({ error: "tournament_id required" });

  // Get distinct skier names in this tournament
  const tournamentSkiers = await db
    .selectDistinct({ skier_name: passesTable.skier_name, division: passesTable.division })
    .from(passesTable)
    .where(eq(passesTable.tournament_id, tournamentId));

  if (tournamentSkiers.length === 0) return res.json({});

  const names = tournamentSkiers.map(s => s.skier_name);

  // Single query: max buoys_scored grouped by (skier_name, division) across ALL tournaments
  const rows = await db
    .select({
      skier_name: passesTable.skier_name,
      division: passesTable.division,
      best: max(passesTable.buoys_scored),
    })
    .from(passesTable)
    .where(and(
      inArray(passesTable.skier_name, names),
      ne(passesTable.status, 'pending'),
      isNotNull(passesTable.buoys_scored),
    ))
    .groupBy(passesTable.skier_name, passesTable.division);

  // Normalize NULL and 'Open' into the same key so legacy null-division rows
  // are correctly merged with explicitly-set 'Open' rows.
  const map: Record<string, number> = {};
  for (const row of rows) {
    if (row.best === null || row.best === undefined) continue;
    const key = `${row.skier_name}||${row.division ?? 'Open'}`;
    const existing = map[key];
    if (existing === undefined || row.best > existing) {
      map[key] = row.best;
    }
  }
  res.json(map);
});

// GET /api/passes/search?q=skierName — search passes across all tournaments
passRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q || q.length < 2) return res.json([]);

  const passes = await db
    .select()
    .from(passesTable)
    .where(ilike(passesTable.skier_name, `%${q}%`))
    .orderBy(desc(passesTable.created_at))
    .limit(50);
  res.json(passes);
});

passRouter.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [pass] = await db.select().from(passesTable).where(eq(passesTable.id, id));
  if (!pass) return res.status(404).json({ error: "Not found" });
  res.json(pass);
});

passRouter.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const updateSchema = insertPassSchema.partial();
  const body = updateSchema.parse(req.body);

  // When operator manually ends a pass, collate only the scoring-panel scores submitted so far.
  if ((body.status === 'scored' || body.status === 'complete') && body.buoys_scored === undefined) {
    const [pass] = await db.select().from(passesTable).where(eq(passesTable.id, id));
    if (pass) {
      const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, pass.tournament_id));
      const scoringRoles = tournament ? getScoringRoles(tournament.judge_count) : ALL_SCORING_ROLES;
      const scores = await db
        .select()
        .from(judgeScoresTable)
        .where(and(eq(judgeScoresTable.pass_id, id), inArray(judgeScoresTable.judge_role, scoringRoles)));
      if (scores.length > 0) {
        const nums = scores
          .map(s => (s.pass_score === '6_no_gates' ? 6 : parseFloat(s.pass_score)))
          .sort((a, b) => a - b);
        const mid = Math.floor(nums.length / 2);
        body.buoys_scored = nums.length % 2 === 0
          ? (nums[mid - 1] + nums[mid]) / 2
          : nums[mid];
      }
    }
  }

  const [pass] = await db.update(passesTable).set(body).where(eq(passesTable.id, id)).returning();
  if (!pass) return res.status(404).json({ error: "Not found" });
  res.json(pass);
});

// POST /api/passes/:id/flag — append a FALL or GATE MISS flag to pass notes
passRouter.post("/:id/flag", async (req, res) => {
  const id = parseInt(req.params.id);
  const { flag } = req.body as { flag: string };
  if (!flag) return res.status(400).json({ error: "flag required" });

  const [pass] = await db.select().from(passesTable).where(eq(passesTable.id, id));
  if (!pass) return res.status(404).json({ error: "Not found" });

  const ts = new Date().toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
  const entry = `[${ts}] ${flag}`;
  const newNotes = pass.notes ? `${pass.notes}\n${entry}` : entry;

  const [updated] = await db
    .update(passesTable)
    .set({ notes: newNotes })
    .where(eq(passesTable.id, id))
    .returning();
  res.json(updated);
});

passRouter.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(passesTable).where(eq(passesTable.id, id));
  res.status(204).send();
});

export default router;
