import { Router } from "express";
import os from "os";

const router = Router();

router.get("/", (_req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses: { name: string; address: string; family: string }[] = [];

  for (const [name, iface] of Object.entries(interfaces)) {
    if (!iface) continue;
    for (const entry of iface) {
      if (entry.internal) continue;
      if (entry.family === "IPv4") {
        addresses.push({ name, address: entry.address, family: entry.family });
      }
    }
  }

  const port = process.env.PORT || "8080";
  const urls = addresses.map((a) => `http://${a.address}:${port}`);

  res.json({ addresses, port, urls });
});

export default router;
