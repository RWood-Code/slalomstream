/**
 * SurePath / WaterskiConnect WebSocket Client
 *
 * Connects to the WaterskiConnect server as an observer.
 * When the SurePath rover reports boat speed above the trigger threshold,
 * a "pass start" event is received and SlalomStream automatically creates
 * a pending pass in the active tournament.
 *
 * WaterskiConnect architecture (per SurePath docs):
 *   - All apps connect using Event Name + Event Sub ID
 *   - Observer apps (like this one) require a PIN shown in scoring software
 *   - Messages flow between rover, scoring software, and observers
 *
 * The WebSocket URL is configurable in Admin → SurePath settings.
 * Default: wss://waterskiconnect.com/ws  (verify with your WaterskiConnect setup)
 */

import WebSocket from "ws";
import { db } from "@workspace/db";
import { appSettingsTable, passesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type SurePathStatus = {
  connected: boolean;
  connecting: boolean;
  eventName: string | null;
  lastMessage: { ts: string; type: string; raw: unknown } | null;
  passesCreated: number;
  error: string | null;
  connectedAt: string | null;
};

let ws: WebSocket | null = null;
let status: SurePathStatus = {
  connected: false,
  connecting: false,
  eventName: null,
  lastMessage: null,
  passesCreated: 0,
  error: null,
  connectedAt: null,
};
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function getSurePathStatus(): SurePathStatus {
  return { ...status };
}

export async function startSurePathClient() {
  const [settings] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1));
  if (!settings?.surepath_enabled) return;

  const wsUrl = settings.waterskiconnect_url || "wss://waterskiconnect.com/ws";
  const eventName = settings.surepath_event_name;
  const subId = settings.surepath_event_sub_id || "";
  const pin = settings.surepath_observer_pin;

  if (!eventName) {
    status.error = "SurePath Event Name not configured. Set it in Admin → SurePath.";
    return;
  }

  connect(wsUrl, eventName, subId, pin ?? undefined, settings.active_tournament_id ?? undefined);
}

export function stopSurePathClient() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) {
    ws.removeAllListeners();
    ws.close();
    ws = null;
  }
  status = { ...status, connected: false, connecting: false, error: null };
}

function connect(wsUrl: string, eventName: string, subId: string, pin?: string, tournamentId?: number) {
  stopSurePathClient();
  status = { ...status, connecting: true, error: null, eventName };
  console.log(`[SurePath] Connecting to ${wsUrl} (event: ${eventName})`);

  try {
    ws = new WebSocket(wsUrl, { handshakeTimeout: 10000 });
  } catch (err: any) {
    status = { ...status, connecting: false, connected: false, error: String(err.message) };
    scheduleReconnect(wsUrl, eventName, subId, pin, tournamentId);
    return;
  }

  ws.on("open", () => {
    status = { ...status, connecting: false, connected: true, connectedAt: new Date().toISOString(), error: null };
    console.log("[SurePath] Connected. Registering as observer…");

    // Send registration message (format per WaterskiConnect protocol)
    const registration = {
      type: "register",
      role: "observer",
      eventName,
      eventSubId: subId,
      ...(pin ? { pin } : {}),
      app: "SlalomStream",
    };
    ws!.send(JSON.stringify(registration));
  });

  ws.on("message", async (data) => {
    let msg: any;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    status.lastMessage = { ts: new Date().toISOString(), type: msg.type ?? "unknown", raw: msg };
    console.log("[SurePath] Message:", msg.type, JSON.stringify(msg).slice(0, 200));

    await handleMessage(msg, tournamentId);
  });

  ws.on("error", (err) => {
    status.error = err.message;
    status.connected = false;
    console.error("[SurePath] WebSocket error:", err.message);
  });

  ws.on("close", (code, reason) => {
    status.connected = false;
    status.connecting = false;
    console.log(`[SurePath] Disconnected (${code}): ${reason}`);
    scheduleReconnect(wsUrl, eventName, subId, pin, tournamentId);
  });
}

async function handleMessage(msg: any, tournamentId?: number) {
  const type: string = (msg.type || msg.messageType || "").toLowerCase();

  // "pass_start" or "boat_start" — boat has exceeded speed threshold, skier on water
  if (type === "pass_start" || type === "boatstart" || type === "skistart") {
    const activeTournamentId = tournamentId ?? await getActiveTournamentId();
    if (!activeTournamentId) return;

    // Cancel any existing pending passes
    await db.update(passesTable).set({ status: "cancelled" }).where(eq(passesTable.tournament_id, activeTournamentId));

    const skierName: string = msg.skierName ?? msg.skier_name ?? msg.name ?? "Unknown";
    const ropeLength: number = parseFloat(msg.ropeLength ?? msg.rope_length ?? msg.rope ?? 13);
    const speedKph: number = parseFloat(msg.speedKph ?? msg.speed_kph ?? msg.speed ?? 55);
    const roundNumber: number = parseInt(msg.roundNumber ?? msg.round_number ?? msg.round ?? 1);
    const division: string = msg.division ?? null;

    await db.insert(passesTable).values({
      tournament_id: activeTournamentId,
      skier_name: skierName,
      rope_length: isNaN(ropeLength) ? 13 : ropeLength,
      speed_kph: isNaN(speedKph) ? 55 : speedKph,
      round_number: isNaN(roundNumber) ? 1 : roundNumber,
      division,
      status: "pending",
    });

    status.passesCreated++;
    console.log(`[SurePath] Created pass for ${skierName} @ ${speedKph}kph / ${ropeLength}m`);
  }

  // "pass_end" — boat slowed below threshold (skier fell or finished)
  // SlalomStream's operator handles this manually so we just log it.
}

async function getActiveTournamentId(): Promise<number | undefined> {
  const [settings] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1));
  return settings?.active_tournament_id ?? undefined;
}

function scheduleReconnect(wsUrl: string, eventName: string, subId: string, pin?: string, tournamentId?: number) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => connect(wsUrl, eventName, subId, pin, tournamentId), 15000);
  console.log("[SurePath] Reconnecting in 15s…");
}
