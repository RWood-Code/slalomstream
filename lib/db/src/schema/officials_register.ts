import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";

export const officialsRegisterTable = pgTable("officials_register", {
  id: serial("id").primaryKey(),
  first_name: text("first_name").notNull(),
  surname: text("surname").notNull(),
  region: text("region").notNull(),
  financial: boolean("financial").notNull().default(false),
  slalom_grade: text("slalom_grade"),
  slalom_notes: text("slalom_notes"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export type Official = typeof officialsRegisterTable.$inferSelect;
