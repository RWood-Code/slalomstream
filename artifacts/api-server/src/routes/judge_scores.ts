import { Router } from "express";
import { db } from "@workspace/db";
import { judgeScoresTable, passesTable, tournamentsTable, insertJudgeScoreSchema } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

// ─── Panel helpers ─────────────────────────────────────────────────────────────
// Only the numbered scoring judges count toward collation.
// Chief judge is oversight only. Boat judge = the last numbered judge (C or E),
// so they already have a scoring role (judge_c / judge_e).
const ALL_SCORING_ROLES = ['judge_a', 'judge_b', 'judge_c', 'judge_d', 'judge_e'];

function getScoringRoles(judgeCount: number): string[] {
  return ALL_SCORING_ROLES.slice(0, Math.min(Math.max(judgeCount, 1), 5));
}

function collate(scores: { pass_score: string }[]): number {
  const nums = scores
    .map(s => (s.pass_score === '6_no_gates' ? 6 : parseFloat(s.pass_score)))
    .sort((a, b) => a - b);
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

async function maybeAutoCollate(passId: number, tournamentId: number) {
  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, tournamentId));
  if (!tournament) return;

  const scoringRoles = getScoringRoles(tournament.judge_count);

  const panelScores = await db
    .select()
    .from(judgeScoresTable)
    .where(and(
      eq(judgeScoresTable.pass_id, passId),
      inArray(judgeScoresTable.judge_role, scoringRoles)
    ));

  // Auto-collate only when ALL panel judges have scored
  if (panelScores.length >= tournament.judge_count) {
    const collated = collate(panelScores);
    await db
      .update(passesTable)
      .set({ buoys_scored: collated, status: 'complete' })
      .where(eq(passesTable.id, passId));
  }
}

// ─── Routes: /api/passes/:id/judge-scores ──────────────────────────────────────
export const judgeScorePassRouter = Router({ mergeParams: true });

// GET — all scores for a pass
judgeScorePassRouter.get("/", async (req, res) => {
  const passId = parseInt((req.params as any).id);
  const scores = await db
    .select()
    .from(judgeScoresTable)
    .where(eq(judgeScoresTable.pass_id, passId))
    .orderBy(judgeScoresTable.submitted_at);
  res.json(scores);
});

// POST — submit or update a judge's score (upserts by judge_role)
judgeScorePassRouter.post("/", async (req, res) => {
  const passId = parseInt((req.params as any).id);

  const [pass] = await db.select().from(passesTable).where(eq(passesTable.id, passId));
  if (!pass) return res.status(404).json({ error: "Pass not found" });

  const body = insertJudgeScoreSchema.parse({ ...req.body, pass_id: passId });

  const [existing] = await db
    .select()
    .from(judgeScoresTable)
    .where(and(eq(judgeScoresTable.pass_id, passId), eq(judgeScoresTable.judge_role, body.judge_role)));

  let score;
  if (existing) {
    const [updated] = await db
      .update(judgeScoresTable)
      .set({ pass_score: body.pass_score, judge_name: body.judge_name, submitted_at: new Date() })
      .where(eq(judgeScoresTable.id, existing.id))
      .returning();
    score = updated;
  } else {
    const [inserted] = await db.insert(judgeScoresTable).values(body).returning();
    score = inserted;
  }

  await maybeAutoCollate(passId, pass.tournament_id);

  res.status(201).json(score);
});

// PATCH /:scoreId — chief judge correction of a specific score
judgeScorePassRouter.patch("/:scoreId", async (req, res) => {
  const passId  = parseInt((req.params as any).id);
  const scoreId = parseInt(req.params.scoreId);
  const { pass_score } = req.body;

  if (!pass_score) return res.status(400).json({ error: "pass_score required" });

  const [updated] = await db
    .update(judgeScoresTable)
    .set({ pass_score: String(pass_score), submitted_at: new Date() })
    .where(and(eq(judgeScoresTable.id, scoreId), eq(judgeScoresTable.pass_id, passId)))
    .returning();

  if (!updated) return res.status(404).json({ error: "Score not found" });

  const [pass] = await db.select().from(passesTable).where(eq(passesTable.id, passId));
  if (pass) await maybeAutoCollate(passId, pass.tournament_id);

  res.json(updated);
});

// ─── Routes: /api/tournaments/:id/judge-scores ─────────────────────────────────
export const judgeScoreTournamentRouter = Router({ mergeParams: true });

judgeScoreTournamentRouter.get("/", async (req, res) => {
  const tournamentId = parseInt((req.params as any).id);
  const scores = await db
    .select()
    .from(judgeScoresTable)
    .where(eq(judgeScoresTable.tournament_id, tournamentId))
    .orderBy(judgeScoresTable.submitted_at);
  res.json(scores);
});
