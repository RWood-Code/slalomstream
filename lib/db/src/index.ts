import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// ── Database mode selection ──────────────────────────────────────────────────
// DB_DATA_DIR → offline/local mode  (PGlite: PostgreSQL compiled to WASM)
// DATABASE_URL → cloud/server mode  (remote PostgreSQL via pg driver)
//
// PGlite stores a real PostgreSQL data directory at DB_DATA_DIR.
// Works completely offline — no internet, no external server.

export let pool: InstanceType<typeof Pool> | null = null;

function createDb() {
  if (process.env.DB_DATA_DIR) {
    const client = new PGlite(`file:${process.env.DB_DATA_DIR}`);
    return drizzlePglite({ client, schema });
  } else if (process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return drizzlePg(pool, { schema });
  } else {
    throw new Error(
      "Database not configured. Set DB_DATA_DIR (offline/local install) or DATABASE_URL (cloud).",
    );
  }
}

export const db = createDb();

export * from "./schema";
export { runStartupChecks } from "./startup.js";
