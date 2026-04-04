/**
 * WaterskiConnect / SurePath Integration Routes
 *
 * POST /api/waterskiconnect/inbound  — Inbound webhook for scoring software
 * GET  /api/waterskiconnect/status   — Webhook + SurePath WS client status
 * POST /api/waterskiconnect/surepath/connect — Start/restart WS client
 * POST /api/waterskiconnect/surepath/disconnect — Stop WS client
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { appSettingsTable, passesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSurePathStatus, startSurePathClient, stopSurePathClient, recordExternalMessage } from "../services/surepath-client";

const router = Router();

let lastInbound: { ts: string; data: Record<string, unknown> } | null = null;
let inboundCount = 0;

router.get("/status", async (_req, res) => {
  const [settings] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1));
  res.json({
    webhook: {
      enabled: settings?.waterskiconnect_enabled ?? false,
      last_inbound: lastInbound,
      inbound_count: inboundCount,
    },
    surepath: getSurePathStatus(),
  });
});

router.post("/surepath/connect", async (_req, res) => {
  await startSurePathClient();
  res.json({ status: getSurePathStatus() });
});

router.post("/surepath/disconnect", (_req, res) => {
  stopSurePathClient();
  res.json({ status: getSurePathStatus() });
});

router.post("/inbound", async (req, res) => {
  const [settings] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1));

  if (!settings?.waterskiconnect_enabled) {
    return res.status(403).json({ error: "WaterskiConnect integration is disabled" });
  }

  if (settings.waterskiconnect_token) {
    const provided = req.body?.token || req.headers["x-waterskiconnect-token"];
    if (provided !== settings.waterskiconnect_token) {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  const { skier_name, division, rope_length, speed_kph, round_number = 1, skier_id } = req.body;

  if (!skier_name || !rope_length || !speed_kph) {
    return res.status(400).json({ error: "Missing required fields: skier_name, rope_length, speed_kph" });
  }

  const tournamentId = settings.active_tournament_id;
  if (!tournamentId) {
    return res.status(409).json({ error: "No active tournament selected in SlalomStream" });
  }

  await db.update(passesTable).set({ status: "cancelled" }).where(eq(passesTable.tournament_id, tournamentId));

  const [pass] = await db
    .insert(passesTable)
    .values({
      tournament_id: tournamentId,
      skier_id: skier_id ?? null,
      skier_name: String(skier_name),
      division: division ?? null,
      rope_length: Number(rope_length),
      speed_kph: Number(speed_kph),
      round_number: Number(round_number),
      status: "pending",
    })
    .returning();

  lastInbound = { ts: new Date().toISOString(), data: req.body };
  inboundCount++;
  // Keep the SurePath status indicator up-to-date even when using the webhook path
  recordExternalMessage('webhook_inbound');

  res.status(201).json({ success: true, pass });
});

export default router;
