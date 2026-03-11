import { Router } from "express";
import { db } from "@workspace/db";
import { tournamentsTable, insertTournamentSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const router = Router();

router.get("/", async (_req, res) => {
  const tournaments = await db.select().from(tournamentsTable).orderBy(tournamentsTable.created_at);
  res.json(tournaments);
});

router.post("/", async (req, res) => {
  const body = insertTournamentSchema.parse(req.body);
  const [tournament] = await db.insert(tournamentsTable).values(body).returning();
  res.status(201).json(tournament);
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id));
  if (!tournament) return res.status(404).json({ error: "Not found" });
  res.json(tournament);
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const updateSchema = insertTournamentSchema.partial();
  const body = updateSchema.parse(req.body);
  const [tournament] = await db
    .update(tournamentsTable)
    .set({ ...body, updated_at: new Date() })
    .where(eq(tournamentsTable.id, id))
    .returning();
  if (!tournament) return res.status(404).json({ error: "Not found" });
  res.json(tournament);
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(tournamentsTable).where(eq(tournamentsTable.id, id));
  res.status(204).send();
});

export default router;
