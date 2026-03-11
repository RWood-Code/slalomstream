/**
 * Seed — NZTWSA Officials Register (as at 13 Feb 2026)
 * Run: pnpm --filter @workspace/db run seed:officials
 */

import { db } from "./index.js";
import { officialsRegisterTable } from "./schema/officials_register.js";

const officials = [
  // Auckland
  { first_name: "Ed",       surname: "Donald",         region: "Auckland",    financial: true,  slalom_grade: "J2*" },
  { first_name: "James",    surname: "Donald",         region: "Auckland",    financial: true,  slalom_grade: "J3",  slalom_notes: "J2S, J3J" },
  { first_name: "Kyle",     surname: "Eade",           region: "Auckland",    financial: false, slalom_grade: "J2" },
  { first_name: "Anne",     surname: "Evans",          region: "Auckland",    financial: true,  slalom_grade: "J2*" },
  { first_name: "Cameron",  surname: "Evans",          region: "Auckland",    financial: true,  slalom_grade: "J3",  slalom_notes: "J3, J2* eyetrick" },
  { first_name: "Mark",     surname: "Evans",          region: "Auckland",    financial: true,  slalom_grade: "J2",  slalom_notes: "J2 / J3 for T" },
  { first_name: "Thomas",   surname: "Gilbert",        region: "Auckland",    financial: true,  slalom_grade: "J1",  slalom_notes: "J1 review date 11/08/2028" },
  { first_name: "Lance",    surname: "Green",          region: "Auckland",    financial: false, slalom_grade: "J3*" },
  { first_name: "Murray",   surname: "Greer",          region: "Auckland",    financial: false, slalom_grade: "J2*" },
  { first_name: "Scott",    surname: "Keenan",         region: "Auckland",    financial: true,  slalom_grade: "J2" },
  { first_name: "Scott",    surname: "Kelly",          region: "Auckland",    financial: true,  slalom_grade: "J2",  slalom_notes: "J2SJ" },
  { first_name: "Simon",    surname: "Millward",       region: "Auckland",    financial: true,  slalom_grade: "J2*" },
  { first_name: "Mark",     surname: "O'Connell",      region: "Auckland",    financial: false, slalom_grade: "J2",  slalom_notes: "J2 / J3 for T" },
  { first_name: "Lynley",   surname: "Ross",           region: "Auckland",    financial: true,  slalom_grade: "J2" },
  { first_name: "Mike",     surname: "Ross",           region: "Auckland",    financial: true,  slalom_grade: null },
  { first_name: "Braden",   surname: "Shaw",           region: "Auckland",    financial: true,  slalom_grade: "J3" },
  { first_name: "Chris",    surname: "Shaw",           region: "Auckland",    financial: true,  slalom_grade: "J1",  slalom_notes: "J1 review date 20.8.29" },
  // BOP
  { first_name: "Ian",      surname: "Barker",         region: "BOP",         financial: true,  slalom_grade: "J3*" },
  { first_name: "Michael",  surname: "Evans",          region: "BOP",         financial: true,  slalom_grade: "J2" },
  { first_name: "Ben",      surname: "Klein",          region: "BOP",         financial: true,  slalom_grade: "J2*" },
  { first_name: "Steve",    surname: "Klein",          region: "BOP",         financial: false, slalom_grade: null },
  { first_name: "Megan",    surname: "Peters",         region: "BOP",         financial: false, slalom_grade: null },
  { first_name: "Piko",     surname: "Peters",         region: "BOP",         financial: false, slalom_grade: null },
  // Canterbury
  { first_name: "Emma",     surname: "Bainbridge",     region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Mark",     surname: "Bainbridge",     region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Sam",      surname: "Bainbridge",     region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Brad",     surname: "Barr",           region: "Canterbury",  financial: true,  slalom_grade: null },
  { first_name: "Chris",    surname: "Brown",          region: "Canterbury",  financial: false, slalom_grade: "J2*" },
  { first_name: "Morgan",   surname: "Diehl",          region: "Canterbury",  financial: false, slalom_grade: "J2*" },
  { first_name: "George",   surname: "Donaldson",      region: "Canterbury",  financial: false, slalom_grade: "J2*" },
  { first_name: "Hugh",     surname: "Donaldson",      region: "Canterbury",  financial: false, slalom_grade: "J2*" },
  { first_name: "Janeen",   surname: "Donaldson",      region: "Canterbury",  financial: true,  slalom_grade: "J2" },
  { first_name: "Karl",     surname: "Donaldson",      region: "Canterbury",  financial: true,  slalom_grade: "J2" },
  { first_name: "Neil",     surname: "Donaldson",      region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Courtney", surname: "Donaldson",      region: "Canterbury",  financial: true,  slalom_grade: null },
  { first_name: "Jack",     surname: "Engel",          region: "Canterbury",  financial: false, slalom_grade: "J3*" },
  { first_name: "Peter",    surname: "Engel",          region: "Canterbury",  financial: true,  slalom_grade: null },
  { first_name: "Liz",      surname: "Gellaty",        region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Taine",    surname: "Gibson",         region: "Canterbury",  financial: false, slalom_grade: "J2*" },
  { first_name: "Will",     surname: "Gibson",         region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Gavin",    surname: "Green",          region: "Canterbury",  financial: true,  slalom_grade: "J2" },
  { first_name: "Tom",      surname: "Green",          region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Ellie",    surname: "Hill",           region: "Canterbury",  financial: false, slalom_grade: "J2*" },
  { first_name: "Harriet",  surname: "Hill",           region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Shane",    surname: "Hill",           region: "Canterbury",  financial: false, slalom_grade: "J3",  slalom_notes: "J2* plus IWWF J3" },
  { first_name: "Grant",    surname: "Hood",           region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Leighton", surname: "Hood",           region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Rachel",   surname: "Hood",           region: "Canterbury",  financial: false, slalom_grade: "J2*", slalom_notes: "nee Donaldson" },
  { first_name: "Ilco",     surname: "Jansen",         region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Megan",    surname: "Jansen",         region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Quinn",    surname: "Jansen",         region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Alex",     surname: "King",           region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Graham",   surname: "King",           region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Rachel",   surname: "King",           region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Lana",     surname: "Leckenby",       region: "Canterbury",  financial: false, slalom_grade: "J2",  slalom_notes: "nee Donaldson" },
  { first_name: "Lee",      surname: "McFadden",       region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Diaz",     surname: "McKay",          region: "Canterbury",  financial: true,  slalom_grade: null },
  { first_name: "Bronwyn",  surname: "Munro",          region: "Canterbury",  financial: false, slalom_grade: "J2*" },
  { first_name: "Lydia",    surname: "Munro",          region: "Canterbury",  financial: false, slalom_grade: "J2" },
  { first_name: "Hilary",   surname: "Miller",         region: "Canterbury",  financial: true,  slalom_grade: "J2",  slalom_notes: "née Munro" },
  { first_name: "Phil",     surname: "Paterson",       region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Genevieve",surname: "Rogers",         region: "Canterbury",  financial: false, slalom_grade: null },
  { first_name: "Keith",    surname: "Summerill",      region: "Canterbury",  financial: true,  slalom_grade: null },
  { first_name: "Carrie",   surname: "Wallis",         region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Genevieve",surname: "Wallis",         region: "Canterbury",  financial: true,  slalom_grade: null },
  { first_name: "Katrina",  surname: "Wallis",         region: "Canterbury",  financial: true,  slalom_grade: null },
  { first_name: "Steve",    surname: "Wayne",          region: "Canterbury",  financial: true,  slalom_grade: "J2*" },
  { first_name: "Richard",  surname: "Wood",           region: "Canterbury",  financial: true,  slalom_grade: "J2" },
  { first_name: "Sammy",    surname: "Wood",           region: "Canterbury",  financial: true,  slalom_grade: null },
  // Central
  { first_name: "Nick",     surname: "Bakker",         region: "Central",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Ron",      surname: "Bakker",         region: "Central",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Sharon",   surname: "Bakker",         region: "Central",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Iain",     surname: "Bill",           region: "Central",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Nikki",    surname: "England",        region: "Central",     financial: true,  slalom_grade: null },
  { first_name: "Royce",    surname: "England",        region: "Central",     financial: true,  slalom_grade: null },
  { first_name: "Trevor",   surname: "Fowler",         region: "Central",     financial: true,  slalom_grade: "J2" },
  { first_name: "John",     surname: "Gibbons",        region: "Central",     financial: true,  slalom_grade: "J2" },
  { first_name: "Blake",    surname: "Hagan",          region: "Central",     financial: false, slalom_grade: null },
  { first_name: "Melanie",  surname: "Hagan",          region: "Central",     financial: false, slalom_grade: null },
  { first_name: "John",     surname: "Lory",           region: "Central",     financial: true,  slalom_grade: null },
  { first_name: "Mathew",   surname: "McKenzie",       region: "Central",     financial: false, slalom_grade: null },
  { first_name: "Sam",      surname: "McKenzie",       region: "Central",     financial: true,  slalom_grade: null },
  { first_name: "Lily",     surname: "Meade",          region: "Central",     financial: false, slalom_grade: "J2" },
  { first_name: "Steve",    surname: "Parker",         region: "Central",     financial: false, slalom_grade: "J2*" },
  { first_name: "Denise",   surname: "Shailer",        region: "Central",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Leigh",    surname: "Signal",         region: "Central",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Jack",     surname: "Silver",         region: "Central",     financial: true,  slalom_grade: null },
  { first_name: "Colin",    surname: "Smith",          region: "Central",     financial: false, slalom_grade: null },
  { first_name: "Lochie",   surname: "Stewart",        region: "Central",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Thomas",   surname: "Thomas",         region: "Central",     financial: true,  slalom_grade: null,  slalom_notes: "snr" },
  // Northland
  { first_name: "Ned",      surname: "Aickin",         region: "Northland",   financial: false, slalom_grade: "J3" },
  { first_name: "Cole",     surname: "Atkinson",       region: "Northland",   financial: false, slalom_grade: "J2" },
  { first_name: "Janet",    surname: "Atkinson",       region: "Northland",   financial: true,  slalom_grade: "J3*" },
  { first_name: "Toni",     surname: "Atkinson",       region: "Northland",   financial: true,  slalom_grade: "J2*" },
  { first_name: "Chris",    surname: "Lincoln",        region: "Northland",   financial: false, slalom_grade: "J3",  slalom_notes: "J3SJ" },
  { first_name: "Nichola",  surname: "Luxford",        region: "Northland",   financial: false, slalom_grade: "J2",  slalom_notes: "J2SJ, J3T" },
  { first_name: "Karen",    surname: "Parr",           region: "Northland",   financial: false, slalom_grade: "J3*" },
  { first_name: "Bernadine",surname: "Paterson",       region: "Northland",   financial: true,  slalom_grade: "J2" },
  { first_name: "Josh",     surname: "Wainwright",     region: "Northland",   financial: true,  slalom_grade: "J3",  slalom_notes: "J3SJ" },
  { first_name: "Maddie",   surname: "Wainwright",     region: "Northland",   financial: true,  slalom_grade: "J2" },
  { first_name: "Sarah",    surname: "Wainwright",     region: "Northland",   financial: true,  slalom_grade: "J1",  slalom_notes: "J1 review date 05/06/2028" },
  { first_name: "Brian",    surname: "Williams",       region: "Northland",   financial: true,  slalom_grade: "J2",  slalom_notes: "J2 / J3 for T" },
  { first_name: "Curtis",   surname: "Williams",       region: "Northland",   financial: true,  slalom_grade: "J1",  slalom_notes: "J1 review date 06/09/2029" },
  { first_name: "Courtney", surname: "Williams",       region: "Northland",   financial: true,  slalom_grade: "J2",  slalom_notes: "J2 / J3 for T" },
  { first_name: "Glen",     surname: "Williams",       region: "Northland",   financial: true,  slalom_grade: "J2" },
  { first_name: "Julie",    surname: "Williams",       region: "Northland",   financial: true,  slalom_grade: null },
  { first_name: "John",     surname: "Weller",         region: "Northland",   financial: true,  slalom_grade: "J2",  slalom_notes: "J2 / J3 for T" },
  // Southern
  { first_name: "Gerald",   surname: "Harraway",       region: "Southern",    financial: false, slalom_grade: "J2*" },
  { first_name: "Charlie",  surname: "Light",          region: "Southern",    financial: false, slalom_grade: null },
  { first_name: "Ashley",   surname: "Simpson",        region: "Southern",    financial: false, slalom_grade: null },
  { first_name: "Greg",     surname: "Sise",           region: "Southern",    financial: false, slalom_grade: null },
  { first_name: "Brent",    surname: "Wilson",         region: "Southern",    financial: true,  slalom_grade: "J2*" },
  // Waikato
  { first_name: "Les",      surname: "Atkinson",       region: "Waikato",     financial: true,  slalom_grade: "J3*" },
  { first_name: "Richard",  surname: "Carlson",        region: "Waikato",     financial: true,  slalom_grade: "J2",  slalom_notes: "J2, eyetrick" },
  { first_name: "John",     surname: "Connell",        region: "Waikato",     financial: false, slalom_grade: "J2" },
  { first_name: "Kevin",    surname: "Firth",          region: "Waikato",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Barry",    surname: "Fowler",         region: "Waikato",     financial: true,  slalom_grade: "J3" },
  { first_name: "Thorsten", surname: "Froebel",        region: "Waikato",     financial: false, slalom_grade: "J2*" },
  { first_name: "Warren",   surname: "Hanna",          region: "Waikato",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Andrew",   surname: "Haultain",       region: "Waikato",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Katrina",  surname: "Haultain",       region: "Waikato",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Aaron",    surname: "Larkin",         region: "Waikato",     financial: true,  slalom_grade: "J2*" },
  { first_name: "Tim",      surname: "Lawton",         region: "Waikato",     financial: false, slalom_grade: null },
  { first_name: "Campbell", surname: "McCracken",      region: "Waikato",     financial: true,  slalom_grade: null },
  { first_name: "Margaret", surname: "McCracken",      region: "Waikato",     financial: true,  slalom_grade: "J2" },
  { first_name: "Ethan",    surname: "McKenzie",       region: "Waikato",     financial: true,  slalom_grade: null },
  { first_name: "Hunter",   surname: "McKenzie",       region: "Waikato",     financial: true,  slalom_grade: null },
  { first_name: "Mike",     surname: "Oxley",          region: "Waikato",     financial: false, slalom_grade: "J2*" },
  { first_name: "Ged",      surname: "Robbins",        region: "Waikato",     financial: true,  slalom_grade: null },
  { first_name: "Josh",     surname: "Runciman",       region: "Waikato",     financial: true,  slalom_grade: null },
  { first_name: "Julie",    surname: "Runciman",       region: "Waikato",     financial: false, slalom_grade: null },
  { first_name: "Tracey",   surname: "Tordoff",        region: "Waikato",     financial: false, slalom_grade: "J3*" },
  { first_name: "Nigel",    surname: "Wilson",         region: "Waikato",     financial: true,  slalom_grade: null },
  { first_name: "Vicki",    surname: "Wilson",         region: "Waikato",     financial: true,  slalom_grade: "J3*", slalom_notes: "J3*/J2*" },
  { first_name: "Hank",     surname: "Wortman",        region: "Waikato",     financial: true,  slalom_grade: "J2*" },
];

async function main() {
  console.log("Seeding NZTWSA Officials Register…");

  // Clear existing
  await db.delete(officialsRegisterTable);

  const inserted = await db
    .insert(officialsRegisterTable)
    .values(officials.map(o => ({ ...o, is_active: true })))
    .returning();

  const byRegion = inserted.reduce<Record<string, number>>((acc, o) => {
    acc[o.region] = (acc[o.region] || 0) + 1;
    return acc;
  }, {});

  console.log(`\nInserted ${inserted.length} officials:\n`);
  Object.entries(byRegion).sort().forEach(([r, n]) => console.log(`  ${r.padEnd(12)} ${n}`));

  const graded = inserted.filter(o => o.slalom_grade);
  const j1 = graded.filter(o => o.slalom_grade?.startsWith('J1')).length;
  const j2 = graded.filter(o => o.slalom_grade === 'J2').length;
  const j2s = graded.filter(o => o.slalom_grade === 'J2*').length;
  const j3 = graded.filter(o => o.slalom_grade?.startsWith('J3')).length;

  console.log(`\nSlalom grades: J1=${j1}  J2=${j2}  J2*=${j2s}  J3/J3*=${j3}  Ungraded=${inserted.length - graded.length}\n`);
  console.log("✓ Done! Source: NZTWSA Judges Register 13 February 2026");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
