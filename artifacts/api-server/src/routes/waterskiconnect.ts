/**
 * WaterskiConnect Integration
 *
 * This module provides an inbound webhook endpoint that boat-side scoring
 * software (or a WaterskiConnect bridge) can POST to in order to automatically
 * create passes inside SlalomStream.
 *
 * Expected POST body (application/json):
 * {
 *   "skier_name": "Jane Smith",
 *   "division": "Open Women",
 *   "rope_length": 13,
 *   "speed_kph": 55,
 *   "round_number": 1,
 *   "token": "your-secret-token"   // optional auth
 * }
 *
 * The endpoint auto-creates a pending pass in the currently active tournament.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { appSettingsTable, passesTable, judgesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// Store last-received inbound event in memory for status polling
let lastInbound: { ts: string; data: Record<string, unknown> } | null = null;
let inboundCount = 0;

router.get("/status", async (_req, res) => {
  const [settings] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1));
  res.json({
    enabled: settings?.waterskiconnect_enabled ?? false,
    last_inbound: lastInbound,
    inbound_count: inboundCount,
  });
});

router.post("/inbound", async (req, res) => {
  const [settings] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1));

  if (!settings?.waterskiconnect_enabled) {
    return res.status(403).json({ error: "WaterskiConnect integration is disabled" });
  }

  // Token auth (optional — if a token is configured, it must match)
  if (settings.waterskiconnect_token) {
    const provided = req.body?.token || req.headers["x-waterskiconnect-token"];
    if (provided !== settings.waterskiconnect_token) {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  const {
    skier_name,
    division,
    rope_length,
    speed_kph,
    round_number = 1,
    skier_id,
  } = req.body;

  if (!skier_name || !rope_length || !speed_kph) {
    return res.status(400).json({ error: "Missing required fields: skier_name, rope_length, speed_kph" });
  }

  const tournamentId = settings.active_tournament_id;
  if (!tournamentId) {
    return res.status(409).json({ error: "No active tournament selected in SlalomStream" });
  }

  // Cancel any existing pending passes for this tournament
  await db
    .update(passesTable)
    .set({ status: "cancelled" })
    .where(eq(passesTable.tournament_id, tournamentId));

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

  res.status(201).json({ success: true, pass });
});

export default router;
