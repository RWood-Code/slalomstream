import app from "./app";
import { startSurePathClient } from "./services/surepath-client";
import { runStartupChecks, db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
// Default to 3000 in dev mode (Tauri sidecar always sets PORT=3000 explicitly in production).
const rawPort = process.env["PORT"] ?? "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Sync the in-memory middleware tunnel flag from the DB on startup.
 *
 * If the app shut down cleanly, connection_mode should already be 'local'.
 * If it crashed while a tunnel was active, the DB retains connection_mode='tunnel'
 * but no tunnel process is running. In that case we reset to 'local' and clear
 * the public URL so the UI reflects the correct state.
 *
 * Note: middleware enforcement uses the in-memory flag (not DB), so this reset
 * is only needed for UI consistency; the middleware starts as false regardless.
 */
async function syncTunnelStateOnStartup(): Promise<void> {
  try {
    const [settings] = await db
      .select({ connection_mode: appSettingsTable.connection_mode })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.id, 1));

    if (settings?.connection_mode === "tunnel") {
      // No tunnel process is running at startup — clear stale DB state for UI
      await db
        .update(appSettingsTable)
        .set({ connection_mode: "local", public_url: null })
        .where(eq(appSettingsTable.id, 1));
      console.log("[Startup] Stale tunnel state cleared from DB (UI sync).");
    }
    // In-memory flag stays false (set only when Rust emits tunnel-url via PUT /api/settings)
  } catch {
    // Non-fatal
  }
}

runStartupChecks()
  .then(async () => {
    await syncTunnelStateOnStartup();
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
      startSurePathClient().catch(err => console.error("[SurePath] Startup error:", err));
    });
  })
  .catch(err => {
    console.error("[DB] Startup checks failed — cannot start server.");
    console.error("[DB]", err instanceof Error ? err.message : String(err));
    console.error("[DB] Check DATABASE_URL in slalomstream.conf and restart.");
    process.exit(1);
  });
