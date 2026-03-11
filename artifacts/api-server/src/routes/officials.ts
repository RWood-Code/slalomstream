import { Router } from "express";
import { db } from "@workspace/db";
import { officialsRegisterTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const { region, grade, financial } = req.query;
  let all = await db.select().from(officialsRegisterTable).orderBy(asc(officialsRegisterTable.surname), asc(officialsRegisterTable.first_name));
  if (region) all = all.filter(o => o.region === region);
  if (grade) all = all.filter(o => o.slalom_grade === grade);
  if (financial === "true") all = all.filter(o => o.financial);
  res.json(all);
});

router.post("/", async (req, res) => {
  const { first_name, surname, region, financial, slalom_grade, slalom_notes } = req.body;
  if (!first_name || !surname || !region) return res.status(400).json({ error: "first_name, surname and region required" });
  const [official] = await db.insert(officialsRegisterTable).values({ first_name, surname, region, financial: !!financial, slalom_grade: slalom_grade || null, slalom_notes: slalom_notes || null, is_active: true }).returning();
  res.status(201).json(official);
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { first_name, surname, region, financial, slalom_grade, slalom_notes, is_active } = req.body;
  const [official] = await db.update(officialsRegisterTable).set({ first_name, surname, region, financial: !!financial, slalom_grade: slalom_grade || null, slalom_notes: slalom_notes || null, is_active: is_active ?? true }).where(eq(officialsRegisterTable.id, id)).returning();
  if (!official) return res.status(404).json({ error: "Not found" });
  res.json(official);
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(officialsRegisterTable).where(eq(officialsRegisterTable.id, id));
  res.status(204).send();
});

export default router;
