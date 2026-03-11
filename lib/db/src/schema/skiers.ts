import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const skiersTable = pgTable("skiers", {
  id: serial("id").primaryKey(),
  tournament_id: integer("tournament_id").notNull(),
  first_name: text("first_name").notNull(),
  surname: text("surname").notNull(),
  division: text("division"),
  skier_id: text("skier_id"),
  pin: text("pin"),
  is_financial: boolean("is_financial").notNull().default(true),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const insertSkierSchema = createInsertSchema(skiersTable).omit({ id: true, created_at: true });
export type InsertSkier = z.infer<typeof insertSkierSchema>;
export type Skier = typeof skiersTable.$inferSelect;
