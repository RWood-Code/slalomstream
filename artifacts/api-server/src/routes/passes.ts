import { Router } from "express";
import { db } from "@workspace/db";
import { passesTable, judgeScoresTable, tournamentsTable, insertPassSchema } from "@workspace/db";
import { eq, desc, and, inArray, ilike } from "drizzle-orm";

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
