import { pgTable, text, serial, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tournamentsTable = pgTable("tournaments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("upcoming"),
  judge_count: integer("judge_count").notNull().default(1),
  tournament_class: text("tournament_class").notNull().default("G"),
  event_id: text("event_id"),
  event_sub_id: text("event_sub_id"),
  region: text("region"),
  num_rounds: integer("num_rounds").notNull().default(2),
  admin_pin: text("admin_pin"),
  notes: text("notes"),
  is_test: boolean("is_test").notNull().default(false),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTournamentSchema = createInsertSchema(tournamentsTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type Tournament = typeof tournamentsTable.$inferSelect;
