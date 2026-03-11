/**
 * Seed Script — Test Tournament
 *
 * Creates a realistic "System Test" tournament pre-loaded with:
 *   - 8 skiers across multiple divisions
 *   - 3 judges with PINs (Grade L / 3-judge panel)
 *   - 6 completed scored passes
 *   - 1 pending pass (to test the live judging flow)
 *
 * Run with:  pnpm tsx scripts/seed-test-tournament.ts
 *
 * The tournament is flagged `is_test = true` so it is hidden from
 * the normal Home page and live Scoreboard. It only appears in Admin
 * when "Show Test Data" is toggled on.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  tournamentsTable,
  skiersTable,
  judgesTable,
  passesTable,
  judgeScoresTable,
} from "../lib/db/src/schema/index.js";
import { eq } from "drizzle-orm";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  console.log("Seeding test tournament…");

  // --- Remove any existing test tournament with this exact name ---
  const existing = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.name, "⚙ System Test Tournament"));

  if (existing.length > 0) {
    const tid = existing[0].id;
    await db.delete(judgeScoresTable).where(eq(judgeScoresTable.tournament_id, tid));
    await db.delete(passesTable).where(eq(passesTable.tournament_id, tid));
    await db.delete(judgesTable).where(eq(judgesTable.tournament_id, tid));
    await db.delete(skiersTable).where(eq(skiersTable.tournament_id, tid));
    await db.delete(tournamentsTable).where(eq(tournamentsTable.id, tid));
    console.log("  Removed previous test tournament.");
  }

  // --- Tournament ---
  const [tournament] = await db
    .insert(tournamentsTable)
    .values({
      name: "⚙ System Test Tournament",
      status: "active",
      tournament_class: "L",
      judge_count: 3,
      num_rounds: 2,
      region: "Test Region",
      notes: "SYSTEM TEST — hidden from live views. Use this to verify judge login, score submission, and collation before a real event.",
      is_test: true,
    })
    .returning();

  console.log(`  Created tournament: ${tournament.name} (id ${tournament.id})`);

  // --- Skiers ---
  const skierData = [
    { first_name: "Alice",   surname: "Wetherstone", division: "Open Women" },
    { first_name: "Ben",     surname: "Kanaloa",     division: "Open Men" },
    { first_name: "Carla",   surname: "Rivetti",     division: "Open Women" },
    { first_name: "Dave",    surname: "Murchison",   division: "Open Men" },
    { first_name: "Emma",    surname: "Thorne",      division: "U21 Women" },
    { first_name: "Felix",   surname: "Ortega",      division: "U21 Men" },
    { first_name: "Grace",   surname: "Lennox",      division: "Open Women" },
    { first_name: "Hamish",  surname: "Wallace",     division: "O35 Men" },
  ];

  const skiers = await db
    .insert(skiersTable)
    .values(skierData.map(s => ({ ...s, tournament_id: tournament.id, is_financial: true })))
    .returning();

  console.log(`  Created ${skiers.length} skiers.`);

  // --- Judges (PIN = role number repeated, e.g. 1111, 2222, 3333) ---
  const judgeData = [
    { name: "Test Judge A",    judge_role: "judge_a",    judge_level: "Grade 1", pin: "1111" },
    { name: "Test Judge B",    judge_role: "judge_b",    judge_level: "Grade 2", pin: "2222" },
    { name: "Test Boat Judge", judge_role: "boat_judge", judge_level: "Grade 1", pin: "3333" },
  ];

  const judges = await db
    .insert(judgesTable)
    .values(judgeData.map(j => ({ ...j, tournament_id: tournament.id, is_active: true })))
    .returning();

  console.log(`  Created ${judges.length} judges.`);

  // --- Completed passes with scores ---
  const completedPasses = [
    { skier: skiers[0], rope: 16,    speed: 55, round: 1, scores: ["4", "4", "4.5"] },
    { skier: skiers[1], rope: 13,    speed: 58, round: 1, scores: ["5.5", "5",   "5.5"] },
    { skier: skiers[2], rope: 18.25, speed: 52, round: 1, scores: ["3",   "3",   "3.5"] },
    { skier: skiers[3], rope: 11.25, speed: 58, round: 1, scores: ["2",   "2.5", "2"]   },
    { skier: skiers[0], rope: 14.25, speed: 55, round: 2, scores: ["5",   "4.5", "5"]   },
    { skier: skiers[1], rope: 11.25, speed: 58, round: 2, scores: ["6",   "6",   "5.5"] },
  ];

  for (const p of completedPasses) {
    const medianScore = median(p.scores.map(s => parseFloat(s)));
    const [pass] = await db
      .insert(passesTable)
      .values({
        tournament_id: tournament.id,
        skier_id: p.skier.id,
        skier_name: `${p.skier.first_name} ${p.skier.surname}`,
        division: p.skier.division,
        rope_length: p.rope,
        speed_kph: p.speed,
        round_number: p.round,
        status: "scored",
        buoys_scored: medianScore,
      })
      .returning();

    // Insert individual judge scores
    const roleNames = ["judge_a", "judge_b", "boat_judge"];
    for (let i = 0; i < judges.length; i++) {
      await db.insert(judgeScoresTable).values({
        pass_id: pass.id,
        tournament_id: tournament.id,
        judge_id: judges[i].id,
        judge_name: judges[i].name,
        judge_role: roleNames[i],
        pass_score: p.scores[i],
      });
    }
  }

  console.log(`  Created ${completedPasses.length} completed passes.`);

  // --- 1 pending pass (lets you test live judging without starting from scratch) ---
  await db.insert(passesTable).values({
    tournament_id: tournament.id,
    skier_id: skiers[4].id,
    skier_name: `${skiers[4].first_name} ${skiers[4].surname}`,
    division: skiers[4].division,
    rope_length: 18.25,
    speed_kph: 49,
    round_number: 1,
    status: "pending",
  });

  console.log("  Created 1 pending pass (ready for judge scoring).");
  console.log("\nDone!");
  console.log(`\n  Tournament ID : ${tournament.id}`);
  console.log("  Judges        : Test Judge A (PIN 1111) · Test Judge B (PIN 2222) · Test Boat Judge (PIN 3333)");
  console.log("  Hidden from   : Home page, Live Scoreboard");
  console.log("  Visible in    : Admin → Show Test Tournaments\n");

  await pool.end();
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
