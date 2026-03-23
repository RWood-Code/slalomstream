import { Router } from "express";
import os from "os";
import path from "path";
import fs from "fs";

const router = Router();

// POST /api/system/shutdown — graceful server stop (admin only)
router.post("/shutdown", (_req, res) => {
  res.json({ ok: true, message: "Server shutting down in 1 second…" });
  setTimeout(() => process.exit(0), 1000);
});

// GET /api/system/network — returns local IP addresses and port
router.get("/network", (_req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses: { name: string; address: string }[] = [];
  for (const [name, iface] of Object.entries(interfaces)) {
    if (!iface) continue;
    for (const entry of iface) {
      if (!entry.internal && entry.family === "IPv4") {
        addresses.push({ name, address: entry.address });
      }
    }
  }
  const port = process.env.PORT || "8080";
  res.json({ addresses, port, urls: addresses.map(a => `http://${a.address}:${port}`) });
});

// GET /api/system/backups — list available database backups
router.get("/backups", (_req, res) => {
  const dataDir = process.env.DB_DATA_DIR;
  if (!dataDir) return res.json({ backups: [], offline: false });
  const backupRoot = path.join(path.dirname(dataDir), "backups");
  if (!fs.existsSync(backupRoot)) return res.json({ backups: [], offline: true });
  const entries = fs.readdirSync(backupRoot).sort().reverse().slice(0, 10);
  const backups = entries.map(name => {
    try {
      const ts = name.replace("slalomstream-", "");
      return { name, timestamp: ts };
    } catch { return { name, timestamp: name }; }
  });
  res.json({ backups, offline: true });
});

export default router;
