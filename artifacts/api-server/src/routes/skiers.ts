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
