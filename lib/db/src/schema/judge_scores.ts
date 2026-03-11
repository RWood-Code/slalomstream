import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const judgeScoresTable = pgTable("judge_scores", {
  id: serial("id").primaryKey(),
  pass_id: integer("pass_id").notNull(),
  tournament_id: integer("tournament_id").notNull(),
  judge_id: integer("judge_id"),
  judge_name: text("judge_name").notNull(),
  judge_role: text("judge_role").notNull(),
  judge_level: text("judge_level"),
  pass_score: text("pass_score").notNull(),
  submitted_at: timestamp("submitted_at").notNull().defaultNow(),
});

export const insertJudgeScoreSchema = createInsertSchema(judgeScoresTable).omit({ id: true, submitted_at: true });
export type InsertJudgeScore = z.infer<typeof insertJudgeScoreSchema>;
export type JudgeScore = typeof judgeScoresTable.$inferSelect;
