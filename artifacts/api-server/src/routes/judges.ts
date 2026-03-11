import { Router } from "express";
import { db } from "@workspace/db";
import { judgesTable, insertJudgeSchema, officialsRegisterTable } from "@workspace/db";
import { eq, and, isNotNull, ne } from "drizzle-orm";

const router = Router({ mergeParams: true });

/** Map official slalom grade → default judge role */
function gradeToRole(grade: string | null | undefined): string {
  if (!grade) return "judge_a";
  const g = grade.toUpperCase();
  if (g.includes("J1")) return "chief_judge";
  if (g.includes("J2*")) return "judge_b";
  if (g.includes("J2")) return "judge_a";
  if (g.includes("J3*")) return "judge_c";
  if (g.includes("J3")) return "boat_judge";
  return "judge_a";
}

/**
 * Virtual judge ID offset for officials. Officials from the register are
 * included in the judge list with id = OFFICIAL_ID_OFFSET + official.id
 * to avoid clashing with tournament-specific judge IDs.
 */
const OFFICIAL_ID_OFFSET = 100000;

// GET /api/tournaments/:id/judges
// Returns tournament-specific judges PLUS all officials who have a PIN set.
router.get("/", async (req, res) => {
  const tournamentId = parseInt((req.params as any).id);

  // Tournament-specific judges
  const judges = await db
    .select()
    .from(judgesTable)
    .where(eq(judgesTable.tournament_id, tournamentId))
    .orderBy(judgesTable.name);

  // Officials with PINs set — auto-available for any tournament
  const officials = await db
    .select()
    .from(officialsRegisterTable)
    .where(and(isNotNull(officialsRegisterTable.pin), ne(officialsRegisterTable.pin, "")))
    .orderBy(officialsRegisterTable.surname);

  const officialJudges = officials.map(o => ({
    id: OFFICIAL_ID_OFFSET + o.id,
    tournament_id: tournamentId,
    name: `${o.first_name} ${o.surname}`,
    judge_role: o.judge_role || gradeToRole(o.slalom_grade),
    pin: "***", // never expose actual PIN
    is_official: true,
    official_id: o.id,
    slalom_grade: o.slalom_grade,
    region: o.region,
    created_at: o.created_at,
  }));

  res.json([...judges, ...officialJudges]);
});

// POST /api/tournaments/:id/judges
router.post("/", async (req, res) => {
  const tournamentId = parseInt((req.params as any).id);
  const body = insertJudgeSchema.parse({ ...req.body, tournament_id: tournamentId });
  const [judge] = await db.insert(judgesTable).values(body).returning();
  res.status(201).json(judge);
});

export const judgeRouter = Router();

judgeRouter.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const updateSchema = insertJudgeSchema.partial();
  const body = updateSchema.parse(req.body);
  const [judge] = await db.update(judgesTable).set(body).where(eq(judgesTable.id, id)).returning();
  if (!judge) return res.status(404).json({ error: "Not found" });
  res.json(judge);
});

judgeRouter.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(judgesTable).where(eq(judgesTable.id, id));
  res.status(204).send();
});

/**
 * POST /api/judges/verify-pin
 * Checks both the tournament judges table and the officials register.
 * Returns judge info in a normalised shape on success.
 */
judgeRouter.post("/verify-pin", async (req, res) => {
  const { tournament_id, pin } = req.body;
  if (!tournament_id || !pin) return res.status(400).json({ error: "tournament_id and pin required" });

  // 1. Check tournament-specific judges first
  const [judge] = await db
    .select()
    .from(judgesTable)
    .where(and(eq(judgesTable.tournament_id, tournament_id), eq(judgesTable.pin, String(pin))));

  if (judge) return res.json(judge);

  // 2. Check officials register
  const [official] = await db
    .select()
    .from(officialsRegisterTable)
    .where(and(isNotNull(officialsRegisterTable.pin), eq(officialsRegisterTable.pin, String(pin))));

  if (official) {
    return res.json({
      id: OFFICIAL_ID_OFFSET + official.id,
      tournament_id,
      name: `${official.first_name} ${official.surname}`,
      judge_role: official.judge_role || gradeToRole(official.slalom_grade),
      pin: "***",
      is_official: true,
      official_id: official.id,
    });
  }

  return res.status(401).json({ error: "Invalid PIN" });
});

export default router;
