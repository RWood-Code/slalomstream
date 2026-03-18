/**
 * Startup checks — run once when the API server starts.
 * Safe to call on every boot: idempotent, non-destructive.
 *
 * 1. Creates all tables if they don't exist (needed for fresh PGlite offline installs).
 * 2. Ensures the DB schema has all required columns (ALTER TABLE ADD COLUMN IF NOT EXISTS).
 * 3. Seeds the NZTWSA officials register if the table is empty.
 * 4. Ensures Richard Wood has admin access (pin 2452).
 * 5. Ensures the app_settings default row exists.
 */

import { sql } from "drizzle-orm";
import { db } from "./index.js";
import { officialsRegisterTable } from "./schema/officials_register.js";

// ─── Table creation ────────────────────────────────────────────────────────────
// Each CREATE TABLE is wrapped in IF NOT EXISTS so it is safely skipped when
// the table already exists (cloud PostgreSQL, or subsequent local restarts).
const CREATE_TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS tournaments (
    id          serial PRIMARY KEY,
    name        text NOT NULL,
    status      text NOT NULL DEFAULT 'upcoming',
    judge_count integer NOT NULL DEFAULT 1,
    tournament_class text NOT NULL DEFAULT 'G',
    event_id    text,
    event_sub_id text,
    region      text,
    num_rounds  integer NOT NULL DEFAULT 2,
    admin_pin   text,
    notes       text,
    is_test     boolean NOT NULL DEFAULT false,
    created_at  timestamp NOT NULL DEFAULT now(),
    updated_at  timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS officials_register (
    id           serial PRIMARY KEY,
    first_name   text NOT NULL,
    surname      text NOT NULL,
    region       text NOT NULL,
    financial    boolean NOT NULL DEFAULT false,
    slalom_grade text,
    slalom_notes text,
    is_active    boolean NOT NULL DEFAULT true,
    pin          text,
    judge_role   text,
    is_admin     boolean NOT NULL DEFAULT false,
    created_at   timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    id                       integer PRIMARY KEY DEFAULT 1,
    admin_pin                text,
    waterskiconnect_enabled  boolean NOT NULL DEFAULT false,
    waterskiconnect_url      text,
    waterskiconnect_token    text,
    surepath_event_name      text,
    surepath_event_sub_id    text,
    surepath_observer_pin    text,
    surepath_enabled         boolean NOT NULL DEFAULT false,
    active_tournament_id     integer,
    connection_mode          text NOT NULL DEFAULT 'local',
    public_url               text,
    github_repo              text,
    update_download_url      text
  )`,
  `CREATE TABLE IF NOT EXISTS judges (
    id            serial PRIMARY KEY,
    tournament_id integer NOT NULL,
    name          text NOT NULL,
    judge_role    text NOT NULL,
    judge_level   text,
    pin           text,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS skiers (
    id            serial PRIMARY KEY,
    tournament_id integer NOT NULL,
    first_name    text NOT NULL,
    surname       text NOT NULL,
    division      text,
    skier_id      text,
    pin           text,
    is_financial  boolean NOT NULL DEFAULT true,
    created_at    timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS passes (
    id            serial PRIMARY KEY,
    tournament_id integer NOT NULL,
    skier_id      integer NOT NULL,
    skier_name    text NOT NULL,
    division      text,
    rope_length   real NOT NULL,
    speed_kph     real,
    round_number  integer NOT NULL DEFAULT 1,
    buoys_scored  real,
    status        text NOT NULL DEFAULT 'pending',
    start_time    timestamp,
    end_time      timestamp,
    notes         text,
    created_at    timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS judge_scores (
    id            serial PRIMARY KEY,
    pass_id       integer NOT NULL,
    tournament_id integer NOT NULL,
    judge_id      integer,
    judge_name    text NOT NULL,
    judge_role    text NOT NULL,
    judge_level   text,
    pass_score    text NOT NULL,
    submitted_at  timestamp NOT NULL DEFAULT now()
  )`,
];

async function createTablesIfNotExist() {
  for (const stmt of CREATE_TABLES) {
    await db.execute(sql.raw(stmt));
  }
  // Ensure the single app_settings row always exists
  await db.execute(sql.raw(
    `INSERT INTO app_settings (id) VALUES (1) ON CONFLICT DO NOTHING`
  ));
}

// ─── Schema patches ────────────────────────────────────────────────────────────
// Add any new columns here as the schema evolves. Each statement is wrapped in
// a try/catch so a column that already exists is silently ignored.
const COLUMN_PATCHES: string[] = [
  `ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS connection_mode text NOT NULL DEFAULT 'local'`,
  `ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS public_url text`,
  `ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS github_repo text`,
  `ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS update_download_url text`,
  `ALTER TABLE officials_register ADD COLUMN IF NOT EXISTS pin text`,
  `ALTER TABLE officials_register ADD COLUMN IF NOT EXISTS judge_role text`,
  `ALTER TABLE officials_register ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false`,
];

async function applySchemaPatches() {
  for (const stmt of COLUMN_PATCHES) {
    try {
      await db.execute(sql.raw(stmt));
    } catch {
      // Column already exists or other non-fatal error — continue.
    }
  }
}

// ─── Officials seed data ───────────────────────────────────────────────────────
const OFFICIALS = [
  // Auckland
  { first_name: "Ed",        surname: "Donald",      region: "Auckland",    financial: true,  slalom_grade: "J2*" },
  { first_name: "James",     surname: "Donald",      region: "Auckland",    financial: true,  slalom_grade: "J3",  slalom_notes: "J2S, J3J" },
  { first_name: "Kyle",      surname: "Eade",        region: "Auckland",    financial: false, slalom_grade: "J2" },
  { first_name: "Anne",      surname: "Evans",       region: "Auckland",    financial: true,  slalom_grade: "J2*" },
  { first_name: "Cameron",   surname: "Evans",       region: "Auckland",    financial: true,  slalom_grade: "J3",  slalom_notes: "J3, J2* eyetrick" },
  { first_name: "Mark",      surname: "Evans",       region: "Auckland",    financial: true,  slalom_grade: "J2",  slalom_notes: "J2 / J3 for T" },
  { first_name: "Thomas",    surname: "Gilbert",     region: "Auckland",    financial: true,  slalom_grade: "J1",  slalom_notes: "J1 review date 11/08/2028" },
  { first_name: "Lance",     surname: "Green",       region: "Auckland",    financial: false, slalom_grade: "J3*" },
  { first_name: "Murray",    surname: "Greer",       region: "Auckland",    financial: false, slalom_grade: "J2*" },
  { first_name: "Scott",     surname: "Keenan",      region: "Auckland",    financial: true,  slalom_grade: "J2" },
  { first_name: "Scott",     surname: "Kelly",       region: "Auckland",    financial: true,  slalom_grade: "J2",  slalom_notes: "J2SJ" },
  { first_name: "Simon",     surname: "Millward",    region: "Auckland",    financial: true,  slalom_grade: "J2*" },
  { first_name: "Mark",      surname: "O'Connell",   region: "Auckland",    financial: false, slalom_grade: "J2",  slalom_notes: "J2 / J3 for T" },
  { first_name: "Lynley",    surname: "Ross",        region: "Auckland",    financial: true,  slalom_grade: "J2" },
  { first_name: "Mike",      surname: "Ross",        region: "Auckland",    financial: true,  slalom_grade: null },
  { first_name: "Braden",    surname: "Shaw",        region: "Auckland",    financial: true,  slalom_grade: "J3" },
  { first_name: "Chris",     surname: "Shaw",        region: "Auckland",    financial: true,  slalom_grade: "J1",  slalom_notes: "J1 review date 20.8.29" },
  // BOP
  { first_name: "Ian",       surname: "Barker",      region: "BOP",         financial: true,  slalom_grade: "J3*" },
  { first_name: "Michael",   surname: "Evans",       region: "BOP",         financial: true,  slalom_grade: "J2" },
  { first_name: "Ben",       surname: "Klein",       region: "BOP",         financial: true,  slalom_grade: "J2*" },
  { first_name: "Steve",     surname: "Klein",       region: "BOP",         financial: false, slalom_grade: null },
  { first_name: "Megan",     surname: "Peters",      region: "BOP",         financial: false, slalom_grade: null },
  { first_name: "Piko",      surname: "Peters",      region: "BOP",         financial: false, slalom_grade: null },
  // Canterbury
  { first_name: "Emma",      surname: "Bainbridge",  region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Mark",      surname: "Bainbridge",  region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Sam",       surname: "Bainbridge",  region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Brad",      surname: "Barr",        region: "Canterbury",  financial: true,  slalom_grade: null },
  { first_name: "Chris",     surname: "Brown",       region: "Canterbury",  financial: false, slalom_grade: "J2*" },
  { first_name: "Morgan",    surname: "Diehl",       region: "Canterbury",  financial: false, slalom_grade: "J2*" },
  { first_name: "George",    surname: "Donaldson",   region: "Canterbury",  financial: false, slalom_grade: "J2*" },
  { first_name: "Hugh",      surname: "Donaldson",   region: "Canterbury",  financial: false, slalom_grade: "J2*" },
  { first_name: "Janeen",    surname: "Donaldson",   region: "Canterbury",  financial: true,  slalom_grade: "J2" },
  { first_name: "Karl",      surname: "Donaldson",   region: "Canterbury",  financial: true,  slalom_grade: "J2" },
  { first_name: "Neil",      surname: "Donaldson",   region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Courtney",  surname: "Donaldson",   region: "Canterbury",  financial: true,  slalom_grade: null },
  { first_name: "Jack",      surname: "Engel",       region: "Canterbury",  financial: false, slalom_grade: "J3*" },
  { first_name: "Peter",     surname: "Engel",       region: "Canterbury",  financial: true,  slalom_grade: null },
  { first_name: "Liz",       surname: "Gellaty",     region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Taine",     surname: "Gibson",      region: "Canterbury",  financial: false, slalom_grade: "J2*" },
  { first_name: "Will",      surname: "Gibson",      region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Gavin",     surname: "Green",       region: "Canterbury",  financial: true,  slalom_grade: "J2" },
  { first_name: "Tom",       surname: "Green",       region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Ellie",     surname: "Hill",        region: "Canterbury",  financial: false, slalom_grade: "J2*" },
  { first_name: "Harriet",   surname: "Hill",        region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Shane",     surname: "Hill",        region: "Canterbury",  financial: false, slalom_grade: "J3",  slalom_notes: "J2* plus IWWF J3" },
  { first_name: "Grant",     surname: "Hood",        region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Leighton",  surname: "Hood",        region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Rachel",    surname: "Hood",        region: "Canterbury",  financial: false, slalom_grade: "J2*", slalom_notes: "nee Donaldson" },
  { first_name: "Ilco",      surname: "Jansen",      region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Megan",     surname: "Jansen",      region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Quinn",     surname: "Jansen",      region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Alex",      surname: "King",        region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Graham",    surname: "King",        region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Rachel",    surname: "King",        region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Lana",      surname: "Leckenby",    region: "Canterbury",  financial: false, slalom_grade: "J2",  slalom_notes: "nee Donaldson" },
  { first_name: "Lee",       surname: "McFadden",    region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Diaz",      surname: "McKay",       region: "Canterbury",  financial: true,  slalom_grade: null },
  { first_name: "Bronwyn",   surname: "Munro",       region: "Canterbury",  financial: false, slalom_grade: "J2*" },
  { first_name: "Lydia",     surname: "Munro",       region: "Canterbury",  financial: false, slalom_grade: "J2" },
  { first_name: "Hilary",    surname: "Miller",      region: "Canterbury",  financial: true,  slalom_grade: "J2",  slalom_notes: "née Munro" },
  { first_name: "Phil",      surname: "Paterson",    region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Genevieve", surname: "Rogers",      region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Keith",     surname: "Summerill",   region: "Canterbury",  financial: true,  slalom_grade: null },
  { first_name: "Carrie",    surname: "Wallis",      region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Genevieve", surname: "Wallis",      region: "Canterbury",  financial: true,  slalom_grade: null },
  { first_name: "Katrina",   surname: "Wallis",      region: "Canterbury",  financial: true,  slalom_grade: null },
  { first_name: "Steve",     surname: "Wayne",       region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  // Richard Wood — master admin (pin 2452, full admin access)
  { first_name: "Richard",   surname: "Wood",        region: "Canterbury",  financial: true,  slalom_grade: "J2", pin: "2452", is_admin: true },
  { first_name: "Sammy",     surname: "Wood",        region: "Canterbury",  financial: true,  slalom_grade: null },
  // Central
  { first_name: "Nick",      surname: "Bakker",      region: "Central",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Ron",       surname: "Bakker",      region: "Central",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Sharon",    surname: "Bakker",      region: "Central",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Iain",      surname: "Bill",        region: "Central",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Nikki",     surname: "England",     region: "Central",     financial: true,  slalom_grade: null },
  { first_name: "Royce",     surname: "England",     region: "Central",     financial: true,  slalom_grade: null },
  { first_name: "Trevor",    surname: "Fowler",      region: "Central",     financial: true,  slalom_grade: "J2" },
  { first_name: "John",      surname: "Gibbons",     region: "Central",     financial: true,  slalom_grade: "J2" },
  { first_name: "Blake",     surname: "Hagan",       region: "Central",     financial: false, slalom_grade: null },
  { first_name: "Melanie",   surname: "Hagan",       region: "Central",     financial: false, slalom_grade: null },
  { first_name: "John",      surname: "Lory",        region: "Central",     financial: true,  slalom_grade: null },
  { first_name: "Mathew",    surname: "McKenzie",    region: "Central",     financial: false, slalom_grade: null },
  { first_name: "Sam",       surname: "McKenzie",    region: "Central",     financial: true,  slalom_grade: null },
  { first_name: "Lily",      surname: "Meade",       region: "Central",     financial: false, slalom_grade: "J2" },
  { first_name: "Steve",     surname: "Parker",      region: "Central",     financial: false, slalom_grade: "J2*" },
  { first_name: "Denise",    surname: "Shailer",     region: "Central",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Leigh",     surname: "Signal",      region: "Central",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Jack",      surname: "Silver",      region: "Central",     financial: true,  slalom_grade: null },
  { first_name: "Colin",     surname: "Smith",       region: "Central",     financial: false, slalom_grade: null },
  { first_name: "Lochie",    surname: "Stewart",     region: "Central",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Thomas",    surname: "Thomas",      region: "Central",     financial: true,  slalom_grade: null, slalom_notes: "snr" },
  // Northland
  { first_name: "Ned",       surname: "Aickin",      region: "Northland",   financial: false, slalom_grade: "J3" },
  { first_name: "Cole",      surname: "Atkinson",    region: "Northland",   financial: false, slalom_grade: "J2" },
  { first_name: "Janet",     surname: "Atkinson",    region: "Northland",   financial: true,  slalom_grade: "J3*" },
  { first_name: "Toni",      surname: "Atkinson",    region: "Northland",   financial: true,  slalom_grade: "J2*" },
  { first_name: "Chris",     surname: "Lincoln",     region: "Northland",   financial: false, slalom_grade: "J3",  slalom_notes: "J3SJ" },
  { first_name: "Nichola",   surname: "Luxford",     region: "Northland",   financial: false, slalom_grade: "J2",  slalom_notes: "J2SJ, J3T" },
  { first_name: "Karen",     surname: "Parr",        region: "Northland",   financial: false, slalom_grade: "J3*" },
  { first_name: "Bernadine", surname: "Paterson",    region: "Northland",   financial: true,  slalom_grade: "J2" },
  { first_name: "Josh",      surname: "Wainwright",  region: "Northland",   financial: true,  slalom_grade: "J3",  slalom_notes: "J3SJ" },
  { first_name: "Maddie",    surname: "Wainwright",  region: "Northland",   financial: true,  slalom_grade: "J2" },
  { first_name: "Sarah",     surname: "Wainwright",  region: "Northland",   financial: true,  slalom_grade: "J1",  slalom_notes: "J1 review date 05/06/2028" },
  { first_name: "Brian",     surname: "Williams",    region: "Northland",   financial: true,  slalom_grade: "J2",  slalom_notes: "J2 / J3 for T" },
  { first_name: "Curtis",    surname: "Williams",    region: "Northland",   financial: true,  slalom_grade: "J1",  slalom_notes: "J1 review date 06/09/2029" },
  { first_name: "Courtney",  surname: "Williams",    region: "Northland",   financial: true,  slalom_grade: "J2",  slalom_notes: "J2 / J3 for T" },
  { first_name: "Glen",      surname: "Williams",    region: "Northland",   financial: true,  slalom_grade: "J2" },
  { first_name: "Julie",     surname: "Williams",    region: "Northland",   financial: true,  slalom_grade: null },
  { first_name: "John",      surname: "Weller",      region: "Northland",   financial: true,  slalom_grade: "J2",  slalom_notes: "J2 / J3 for T" },
  // Southern
  { first_name: "Gerald",    surname: "Harraway",    region: "Southern",    financial: false, slalom_grade: "J2*" },
  { first_name: "Charlie",   surname: "Light",       region: "Southern",    financial: false, slalom_grade: null },
  { first_name: "Ashley",    surname: "Simpson",     region: "Southern",    financial: false, slalom_grade: null },
  { first_name: "Greg",      surname: "Sise",        region: "Southern",    financial: false, slalom_grade: null },
  { first_name: "Brent",     surname: "Wilson",      region: "Southern",    financial: true,  slalom_grade: "J2*" },
  // Waikato
  { first_name: "Les",       surname: "Atkinson",    region: "Waikato",     financial: true,  slalom_grade: "J3*" },
  { first_name: "Richard",   surname: "Carlson",     region: "Waikato",     financial: true,  slalom_grade: "J2",  slalom_notes: "J2, eyetrick" },
  { first_name: "John",      surname: "Connell",     region: "Waikato",     financial: false, slalom_grade: "J2" },
  { first_name: "Kevin",     surname: "Firth",       region: "Waikato",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Barry",     surname: "Fowler",      region: "Waikato",     financial: true,  slalom_grade: "J3" },
  { first_name: "Thorsten",  surname: "Froebel",     region: "Waikato",     financial: false, slalom_grade: "J2*" },
  { first_name: "Warren",    surname: "Hanna",       region: "Waikato",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Andrew",    surname: "Haultain",    region: "Waikato",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Katrina",   surname: "Haultain",    region: "Waikato",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Aaron",     surname: "Larkin",      region: "Waikato",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Tim",       surname: "Lawton",      region: "Waikato",     financial: false, slalom_grade: null },
  { first_name: "Campbell",  surname: "McCracken",   region: "Waikato",     financial: true,  slalom_grade: null },
  { first_name: "Margaret",  surname: "McCracken",   region: "Waikato",     financial: true,  slalom_grade: "J2" },
  { first_name: "Ethan",     surname: "McKenzie",    region: "Waikato",     financial: true,  slalom_grade: null },
  { first_name: "Hunter",    surname: "McKenzie",    region: "Waikato",     financial: true,  slalom_grade: null },
  { first_name: "Mike",      surname: "Oxley",       region: "Waikato",     financial: false, slalom_grade: "J2*" },
  { first_name: "Ged",       surname: "Robbins",     region: "Waikato",     financial: true,  slalom_grade: null },
  { first_name: "Josh",      surname: "Runciman",    region: "Waikato",     financial: true,  slalom_grade: null },
  { first_name: "Julie",     surname: "Runciman",    region: "Waikato",     financial: false, slalom_grade: null },
  { first_name: "Tracey",    surname: "Tordoff",     region: "Waikato",     financial: false, slalom_grade: "J3*" },
  { first_name: "Nigel",     surname: "Wilson",      region: "Waikato",     financial: true,  slalom_grade: null },
  { first_name: "Vicki",     surname: "Wilson",      region: "Waikato",     financial: true,  slalom_grade: "J3*", slalom_notes: "J3*/J2*" },
  { first_name: "Hank",      surname: "Wortman",     region: "Waikato",     financial: true,  slalom_grade: "J2*" },
];

// ─── Seed officials if table is empty ─────────────────────────────────────────
async function seedOfficialsIfEmpty() {
  const existing = await db.select().from(officialsRegisterTable).limit(1);
  if (existing.length > 0) return;

  console.log("[Startup] Officials register is empty — seeding NZTWSA data…");
  await db.insert(officialsRegisterTable).values(
    OFFICIALS.map(o => ({ ...o, is_active: true }))
  );
  console.log(`[Startup] Seeded ${OFFICIALS.length} officials.`);
}

// ─── Ensure Richard Wood always has admin access ───────────────────────────────
// This runs on every boot so that even if the database was seeded from an older
// version (without the pin / is_admin fields), Richard still gets full access.
async function ensureMasterAdmin() {
  await db.execute(sql.raw(
    `UPDATE officials_register
        SET pin = '2452', is_admin = true
      WHERE first_name = 'Richard' AND surname = 'Wood'`
  ));
}

// ─── Public entry point ────────────────────────────────────────────────────────
export async function runStartupChecks() {
  try {
    await createTablesIfNotExist();
    await applySchemaPatches();
    await seedOfficialsIfEmpty();
    await ensureMasterAdmin();
    console.log("[Startup] Database ready.");
  } catch (err) {
    console.error("[Startup] Startup checks failed (non-fatal):", err);
  }
}
