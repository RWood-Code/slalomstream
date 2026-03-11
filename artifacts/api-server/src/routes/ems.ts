/**
 * IWWF EMS (Event Management System) Integration
 *
 * Fetches competition participant data from ems.iwwf.sport.
 *
 * Accepts:
 *   1. Bare GUID:      "305af060-ddf5-4643-b4dd-bde48ead863f"
 *   2. Full EMS URL:   "https://ems.iwwf.sport/Competitions/Details?Id=305af060..."
 *   3. Sanction code:  "26NZL018" — tries to locate GUID automatically (may fail
 *                      if EMS calendar is JS-rendered; ask user to paste URL if so)
 *
 * JSON API endpoint (no auth required):
 *   GET /Competitions/GetCompetitionParticipations?competitionId={GUID}
 *   Response: { data: [{ Name, Country, Category, YearOfBirthday, Event_1..5 }], headers: [...] }
 */

import { Router } from "express";
import * as cheerio from "cheerio";

const router = Router();
const EMS_BASE = "https://ems.iwwf.sport";
const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "text/html,application/xhtml+xml,application/json,*/*",
};

const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const CODE_RE = /^\d{2}[A-Z]{3}\d+$/i;

function extractGuid(s: string): string | null {
  const m = s.match(GUID_RE);
  return m ? m[0] : null;
}

/** Map EMS category string → SlalomStream division label */
function mapCategory(cat: string): string {
  const m = cat.trim().match(/^(\w+)\s+([MF])/);
  if (!m) return cat.trim();
  const [, group, sex] = m;
  const genderWord = sex === "M" ? "Men" : "Women";
  if (group.startsWith("U")) return `${group} ${sex === "M" ? "Boys" : "Girls"}`;
  if (group === "Open") return `Open ${genderWord}`;
  return `${group} ${genderWord}`;
}

/** Parse "SURNAME Firstname" into { first_name, surname } */
function parseName(fullName: string): { first_name: string; surname: string } {
  // Find first lowercase letter after a space → that's where first name starts
  const spaceIdx = fullName.search(/\s[A-Z][a-z]/);
  if (spaceIdx > 0) {
    return {
      surname: fullName.slice(0, spaceIdx).trim(),
      first_name: fullName.slice(spaceIdx + 1).trim(),
    };
  }
  // Fallback: split by space; all-caps words = surname
  const parts = fullName.split(/\s+/);
  if (parts.length === 1) return { surname: parts[0], first_name: "" };
  // Find boundary between ALL-CAPS surname and mixed-case first name
  let i = 0;
  while (i < parts.length - 1 && parts[i] === parts[i].toUpperCase() && /^[A-Z'-]+$/.test(parts[i])) {
    i++;
  }
  if (i === 0) i = 1; // at least one surname word
  return {
    surname: parts.slice(0, i).join(" "),
    first_name: parts.slice(i).join(" "),
  };
}

/** Parse participants JSON from GetCompetitionParticipations response */
function parseParticipants(data: any[], headers: string[]) {
  return data.map(raw => {
    const { surname, first_name } = parseName(raw.Name ?? "");
    const country = raw.Country ?? raw.AthleteFedarationAbbr ?? "NZL";
    const category = (raw.Category ?? "").trim();
    const yob: number | null = raw.YearOfBirthday ? parseInt(raw.YearOfBirthday) : null;

    // Events are in Event_1 … Event_5 and correspond to headers array
    const events: string[] = [];
    for (let i = 0; i < headers.length; i++) {
      const val = raw[`Event_${i + 1}`];
      if (val && val !== "-") events.push(headers[i]);
    }
    if (events.length === 0 && category) events.push("Slalom");

    return {
      first_name: first_name || surname,
      surname: first_name ? surname : "",
      country,
      category,
      division: mapCategory(category),
      yob,
      events,
    };
  }).filter(p => p.surname || p.first_name);
}

/** Fetch participants JSON from EMS using a competition GUID */
async function fetchParticipants(guid: string): Promise<{ participants: ReturnType<typeof parseParticipants>; headers: string[] }> {
  const url = `${EMS_BASE}/Competitions/GetCompetitionParticipations?competitionId=${guid}`;
  const res = await fetch(url, {
    headers: { ...FETCH_HEADERS, Accept: "application/json, */*" },
  });
  if (!res.ok) throw new Error(`EMS participants API returned HTTP ${res.status}`);
  const json = await res.json();
  const rawData: any[] = Array.isArray(json) ? json : (json.data ?? json.Data ?? []);
  const headers: string[] = json.headers ?? json.Headers ?? ["Slalom", "Tricks", "Jump", "Overall"];
  return { participants: parseParticipants(rawData, headers), headers };
}

/** Fetch competition name/site/date from the Details page HTML */
async function fetchCompetitionMeta(guid: string): Promise<{ name: string; site: string; date: string }> {
  const url = `${EMS_BASE}/Competitions/Details?Id=${guid}`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) return { name: "", site: "", date: "" };
  const html = await res.text();
  const $ = cheerio.load(html);

  // Competition name: look for text containing a year (2020-2030) — most reliable signal
  let name = "";
  $("strong, b, h1, h2, h3, h4, h5, .card-title, .card-header").each((_i, el) => {
    const t = $(el).text().trim();
    if (t.length > 8 && t.length < 120 && /202\d/.test(t) && !name) name = t;
  });
  if (!name) {
    // Fallback: first reasonably long strong tag
    $("strong, b").each((_i, el) => {
      const t = $(el).text().trim();
      if (t.length > 15 && t.length < 120 && !name) name = t;
    });
  }

  const site = $("a[href*='Site/Details']").first().text().trim();
  let date = "";
  $("td, p, span").each((_i, el) => {
    const t = $(el).text().trim();
    if (/\d{1,2}\s*[-–]\s*\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i.test(t)) {
      date = t; return false;
    }
  });

  return { name, site, date };
}

/**
 * Try to find a competition GUID from a sanction code by searching the EMS
 * calendar HTML. The EMS calendar is normally JS-rendered, but we try
 * cheerio parsing of the static HTML as a best-effort.
 */
async function findGuidByCode(code: string): Promise<{ guid: string; name: string } | null> {
  const country = code.slice(2, 5).toUpperCase();
  const urls = [
    `${EMS_BASE}/?Country=${country}`,
    `${EMS_BASE}/?Country=${country}&Discipline=Waterski`,
    `${EMS_BASE}/`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: FETCH_HEADERS });
      const html = await res.text();
      const $ = cheerio.load(html);
      let found: { guid: string; name: string } | null = null;

      $("a[href*='Competitions/Details']").each((_i, el) => {
        const href = $(el).attr("href") ?? "";
        const rowText = $(el).closest("tr").text() + " " + $(el).text();
        if (rowText.toUpperCase().includes(code.toUpperCase())) {
          const guid = extractGuid(href);
          if (guid && !found) {
            found = { guid, name: $(el).text().trim() };
          }
        }
      });

      if (found) return found;
    } catch {
      // try next URL
    }
  }
  return null;
}

// ─── Route Handler ────────────────────────────────────────────────────────────
router.get("/search", async (req, res) => {
  const input = ((req.query.code as string) ?? "").trim();
  if (!input) {
    return res.status(400).json({
      error: "?code= is required. Provide a sanction code (e.g. 26NZL018), a bare GUID, or the full EMS competition URL.",
    });
  }

  try {
    let guid: string | null = null;
    let knownName: string | null = null;

    // ── Determine GUID from input ──────────────────────────────────────────
    if (GUID_RE.test(input)) {
      // Bare GUID or URL containing GUID
      guid = extractGuid(input)!;
    } else if (CODE_RE.test(input)) {
      // Sanction code
      const code = input.toUpperCase();
      const found = await findGuidByCode(code);
      if (found) {
        guid = found.guid;
        knownName = found.name;
      } else {
        return res.status(404).json({
          error: `Could not auto-locate "${code}" — the IWWF EMS calendar is JavaScript-rendered and cannot be parsed server-side.`,
          hint: 'Open ems.iwwf.sport in your browser, click on the competition, then copy the full URL from the address bar (it looks like: https://ems.iwwf.sport/Competitions/Details?Id=xxxxxxxx-xxxx-...) and paste that into SlalomStream instead of just the code.',
        });
      }
    } else {
      return res.status(400).json({ error: `"${input}" is not a recognised EMS sanction code, GUID, or URL.` });
    }

    // ── Fetch participants + meta ───────────────────────────────────────────
    const [{ participants }, meta] = await Promise.all([
      fetchParticipants(guid),
      fetchCompetitionMeta(guid),
    ]);

    res.json({
      guid,
      code: input.toUpperCase(),
      name: knownName || meta.name || input,
      site: meta.site,
      date: meta.date,
      details_url: `${EMS_BASE}/Competitions/Details?Id=${guid}`,
      participant_count: participants.length,
      participants,
    });
  } catch (err: any) {
    console.error("[EMS]", err.message);
    res.status(502).json({ error: `IWWF EMS fetch failed: ${err.message}` });
  }
});

export default router;
