/**
 * Dedicated SurePath status endpoints — lightweight, polled by the Recording page.
 *
 * GET  /api/surepath/status     — current connection state + last message timestamp
 * POST /api/surepath/reconnect  — trigger an immediate reconnect attempt
 */
import { Router } from "express";
import { getSurePathStatus, startSurePathClient } from "../services/surepath-client";

const router = Router();

router.get("/status", (_req, res) => {
  res.json(getSurePathStatus());
});

router.post("/reconnect", async (_req, res) => {
  await startSurePathClient();
  res.json(getSurePathStatus());
});

export default router;
