import { Router } from "express";
import { db } from "@workspace/db";
import { passesTable, insertPassSchema } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

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
