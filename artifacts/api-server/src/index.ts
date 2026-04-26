import app from "./app";
import { startSurePathClient } from "./services/surepath-client";
import { runStartupChecks } from "@workspace/db";

// Default to 3000 in dev mode (Tauri sidecar always sets PORT=3000 explicitly in production).
const rawPort = process.env["PORT"] ?? "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

runStartupChecks()
  .then(() => {
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
