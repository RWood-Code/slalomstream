import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { existsSync } from "fs";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve the built frontend when running as a standalone local server.
// Set SERVE_STATIC=true and STATIC_DIR to the path of the built frontend files.
const serveStatic = process.env.SERVE_STATIC === "true";
const staticDir = process.env.STATIC_DIR || path.resolve(process.cwd(), "public");

if (serveStatic && existsSync(staticDir)) {
  app.use(express.static(staticDir));
  // SPA fallback — all non-API routes serve index.html
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
  console.log(`Serving static frontend from: ${staticDir}`);
}

export default app;
