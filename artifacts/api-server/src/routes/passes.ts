import { Router } from "express";
import { db } from "@workspace/db";
import { passesTable, judgeScoresTable, tournamentsTable, insertPassSchema } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";

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

passRouter.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(passesTable).where(eq(passesTable.id, id));
  res.status(204).send();
});

export default router;
