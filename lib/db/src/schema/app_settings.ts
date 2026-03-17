import { pgTable, text, integer, boolean } from "drizzle-orm/pg-core";

export const appSettingsTable = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  admin_pin: text("admin_pin"),
  waterskiconnect_enabled: boolean("waterskiconnect_enabled").notNull().default(false),
  waterskiconnect_url: text("waterskiconnect_url"),
  waterskiconnect_token: text("waterskiconnect_token"),
  surepath_event_name: text("surepath_event_name"),
  surepath_event_sub_id: text("surepath_event_sub_id"),
  surepath_observer_pin: text("surepath_observer_pin"),
  surepath_enabled: boolean("surepath_enabled").notNull().default(false),
  active_tournament_id: integer("active_tournament_id"),
  connection_mode: text("connection_mode").notNull().default("local"),
  public_url: text("public_url"),
  github_repo: text("github_repo"),
  update_download_url: text("update_download_url"),
});

export type AppSettings = typeof appSettingsTable.$inferSelect;
