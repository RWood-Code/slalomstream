import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const passesTable = pgTable("passes", {
  id: serial("id").primaryKey(),
  tournament_id: integer("tournament_id").notNull(),
  skier_id: integer("skier_id").notNull(),
  skier_name: text("skier_name").notNull(),
  division: text("division"),
  rope_length: real("rope_length").notNull(),
  speed_kph: real("speed_kph"),
  round_number: integer("round_number").notNull().default(1),
  buoys_scored: real("buoys_scored"),
  status: text("status").notNull().default("pending"),
  start_time: timestamp("start_time"),
  end_time: timestamp("end_time"),
  notes: text("notes"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const insertPassSchema = createInsertSchema(passesTable).omit({ id: true, created_at: true });
export type InsertPass = z.infer<typeof insertPassSchema>;
export type Pass = typeof passesTable.$inferSelect;
