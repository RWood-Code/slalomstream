import { Router } from "express";
import { db } from "@workspace/db";
import { judgesTable, insertJudgeSchema } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  const tournamentId = parseInt((req.params as any).id);
  const judges = await db.select().from(judgesTable).where(eq(judgesTable.tournament_id, tournamentId)).orderBy(judgesTable.name);
  res.json(judges);
});

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

judgeRouter.post("/verify-pin", async (req, res) => {
  const { tournament_id, pin } = req.body;
  if (!tournament_id || !pin) return res.status(400).json({ error: "tournament_id and pin required" });
  const [judge] = await db
    .select()
    .from(judgesTable)
    .where(and(eq(judgesTable.tournament_id, tournament_id), eq(judgesTable.pin, String(pin))));
  if (!judge) return res.status(401).json({ error: "Invalid PIN" });
  res.json(judge);
});

export default router;
