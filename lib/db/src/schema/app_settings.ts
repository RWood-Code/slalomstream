import { pgTable, text, integer, boolean } from "drizzle-orm/pg-core";

export const appSettingsTable = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  admin_pin: text("admin_pin"),
  waterskiconnect_enabled: boolean("waterskiconnect_enabled").notNull().default(false),
  waterskiconnect_url: text("waterskiconnect_url"),
  waterskiconnect_token: text("waterskiconnect_token"),
  active_tournament_id: integer("active_tournament_id"),
});

export type AppSettings = typeof appSettingsTable.$inferSelect;
