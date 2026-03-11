import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const judgesTable = pgTable("judges", {
  id: serial("id").primaryKey(),
  tournament_id: integer("tournament_id").notNull(),
  name: text("name").notNull(),
  judge_role: text("judge_role").notNull(),
  judge_level: text("judge_level"),
  pin: text("pin"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const insertJudgeSchema = createInsertSchema(judgesTable).omit({ id: true, created_at: true });
export type InsertJudge = z.infer<typeof insertJudgeSchema>;
export type Judge = typeof judgesTable.$inferSelect;
