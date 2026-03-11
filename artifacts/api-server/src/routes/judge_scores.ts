import { Router } from "express";
import { db } from "@workspace/db";
import { judgeScoresTable, passesTable, tournamentsTable, insertJudgeScoreSchema } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export const judgeScorePassRouter = Router({ mergeParams: true });

judgeScorePassRouter.get("/", async (req, res) => {
  const passId = parseInt((req.params as any).id);
  const scores = await db.select().from(judgeScoresTable).where(eq(judgeScoresTable.pass_id, passId)).orderBy(judgeScoresTable.submitted_at);
  res.json(scores);
});

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

  const allScores = await db.select().from(judgeScoresTable).where(eq(judgeScoresTable.pass_id, passId));
  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, pass.tournament_id));

  if (tournament && allScores.length >= tournament.judge_count) {
    const nums = allScores.map((s) => {
      return s.pass_score === "6_no_gates" ? 6 : parseFloat(s.pass_score);
    }).sort((a, b) => a - b);

    const mid = Math.floor(nums.length / 2);
    const collated = nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];

    await db.update(passesTable).set({ buoys_scored: collated, status: "complete" }).where(eq(passesTable.id, passId));
  }

  res.status(201).json(score);
});

export const judgeScoreTournamentRouter = Router({ mergeParams: true });

judgeScoreTournamentRouter.get("/", async (req, res) => {
  const tournamentId = parseInt((req.params as any).id);
  const scores = await db.select().from(judgeScoresTable).where(eq(judgeScoresTable.tournament_id, tournamentId)).orderBy(judgeScoresTable.submitted_at);
  res.json(scores);
});
