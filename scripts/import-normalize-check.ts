/**
 * Does the importer still destroy data?
 *
 *   npm run check:normalize
 *
 * Every case here is a real way agency data arrives broken, and every one of
 * them is silent — nothing throws, the import reports success, and a field is
 * wrong or gone. Those are the only kind worth this much test surface.
 */

import {
  normalizePolicyStatus, normalizePremiumMode, normalizePolicyNumber,
  splitName, parseImportDate, parseAmount,
} from "../src/lib/import-normalize";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE_SHEETS, coworkPrompt, MIGRATION_SOURCES } from "../src/lib/migration-sources";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("\n1. Policy status");
for (const [raw, want] of [
  ["A", "active"], ["IF", "active"], ["In Force", "active"], ["Paid", "active"],
  ["LP", "lapse_pending"], ["Grace Period", "lapse_pending"],
  ["L", "lapsed"], ["Terminated", "lapsed"],
  ["NT", "not_taken"], ["Not Taken Out", "not_taken"],
  ["UW", "in_review"], ["Under Review", "in_review"],
] as const) {
  check(`"${raw}" → ${want}`, normalizePolicyStatus(raw) === want, `got ${normalizePolicyStatus(raw)}`);
}
// The one that matters: an unknown status must not become "active".
check("an unrecognised status returns null, not active",
  normalizePolicyStatus("Zzz Unknown") === null, `got ${normalizePolicyStatus("Zzz Unknown")}`);
check("empty returns null", normalizePolicyStatus("") === null);

console.log("\n2. Premium mode");
for (const [raw, want] of [
  ["M", "monthly"], ["Mo", "monthly"], ["Monthly", "monthly"],
  ["Q", "quarterly"], ["Semi-Annual", "semi_annual"], ["Annually", "annual"],
] as const) {
  check(`"${raw}" → ${want}`, normalizePremiumMode(raw) === want, `got ${normalizePremiumMode(raw)}`);
}

// The trap: mode encoded as payments per year. 12 is monthly, not "twelve
// somethings". Getting this backwards multiplies reported production by 12.
check("12 (payments/year) → monthly", normalizePremiumMode(12) === "monthly", `got ${normalizePremiumMode(12)}`);
check("1 (payments/year) → annual", normalizePremiumMode(1) === "annual", `got ${normalizePremiumMode(1)}`);
check("4 → quarterly", normalizePremiumMode(4) === "quarterly");
check('"12" as a string also reads as payments/year', normalizePremiumMode("12") === "monthly");
check("an unknown payment count returns null, not a guess",
  normalizePremiumMode(7) === null, `got ${normalizePremiumMode(7)}`);

console.log("\n3. Policy numbers — what Excel did");
check("scientific notation is reconstructed",
  normalizePolicyNumber("1.23457E+14") === "123457000000000",
  `got ${normalizePolicyNumber("1.23457E+14")}`);
check("lower-case e is handled", normalizePolicyNumber("1.5e+10") === "15000000000",
  `got ${normalizePolicyNumber("1.5e+10")}`);
check("a float round-trip loses its .0", normalizePolicyNumber("4820193.0") === "4820193");
check("an ordinary alphanumeric number is untouched",
  normalizePolicyNumber("MUT-4820193") === "MUT-4820193");
// Deliberately NOT padded without being told the width — inventing zeros
// would be a second corruption dressed as a fix.
check("leading zeros are not invented",
  normalizePolicyNumber("123456") === "123456", `got ${normalizePolicyNumber("123456")}`);
check("leading zeros are restored when the width is known",
  normalizePolicyNumber("123456", { expectedLength: 8 }) === "00123456");
check("null in, null out", normalizePolicyNumber(null) === null);

console.log("\n4. Names — the split that breaks surnames");
const vdb = splitName("Mary Jo Van Der Berg");
check('"Mary Jo Van Der Berg" keeps the whole surname',
  vdb?.first === "Mary" && vdb?.middle === "Jo" && vdb?.last === "Van Der Berg",
  JSON.stringify(vdb));
const simple = splitName("Willie Jenkins");
check("a two-part name is unremarkable", simple?.first === "Willie" && simple?.last === "Jenkins");
const comma = splitName("Delgado, Gloria M");
check('"Last, First M" is read from the comma',
  comma?.first === "Gloria" && comma?.last === "Delgado" && comma?.middle === "M", JSON.stringify(comma));
const jr = splitName("Robert Downey Jr");
check("a suffix belongs to neither name",
  jr?.first === "Robert" && jr?.last === "Downey" && jr?.suffix === "Jr", JSON.stringify(jr));
const oconnor = splitName("Sean O'Connor");
check("an apostrophe surname survives", oconnor?.last === "O'Connor", JSON.stringify(oconnor));
const one = splitName("Cher");
check("a single name does not invent a surname",
  one?.first === "Cher" && one?.last === "", JSON.stringify(one));
check("empty returns null", splitName("") === null);

console.log("\n5. Dates — the ambiguity that moves a commission period");
check("ISO is taken as ISO", parseImportDate("2026-03-04")?.iso === "2026-03-04");
check("ISO is never ambiguous", parseImportDate("2026-03-04")?.ambiguous === false);
// 13 cannot be a month, so this one is decidable whatever the locale.
const unamb = parseImportDate("13/04/2026");
check("a component over 12 forces the reading",
  unamb?.iso === "2026-04-13" && unamb.ambiguous === false, JSON.stringify(unamb));
// This one genuinely is not decidable, and must say so.
const amb = parseImportDate("03/04/2026");
check("03/04/2026 is flagged ambiguous", amb?.ambiguous === true, JSON.stringify(amb));
check("US assumption reads month first", parseImportDate("03/04/2026")?.iso === "2026-03-04");
check("EU assumption reads day first",
  parseImportDate("03/04/2026", { assume: "EU" })?.iso === "2026-04-03");
check("a two-digit year in the 70s is last century",
  parseImportDate("01/15/72")?.iso === "1972-01-15", JSON.stringify(parseImportDate("01/15/72")));
check("a two-digit year in the 20s is this one",
  parseImportDate("01/15/26")?.iso === "2026-01-15");
check("nonsense returns null", parseImportDate("not a date") === null);
check("an impossible month returns null", parseImportDate("13/13/2026") === null);

console.log("\n6. Amounts");
check("$1,234.56", parseAmount("$1,234.56") === 1234.56, String(parseAmount("$1,234.56")));
check("European 1.234,56", parseAmount("1.234,56") === 1234.56, String(parseAmount("1.234,56")));
check("accounting negative (1,234.56)", parseAmount("(1,234.56)") === -1234.56, String(parseAmount("(1,234.56)")));
check("a bare number passes through", parseAmount(62) === 62);
// Zero would look like a free policy.
check("unparseable returns null, not zero",
  parseAmount("n/a") === null, String(parseAmount("n/a")));
check("empty returns null", parseAmount("") === null);

// ── 7. The migration template cannot drift from what the importer reads ─────
//
// The Cowork prompt tells Claude to produce a workbook with exact sheet and
// column names. If the importer's expectations move and the template does not,
// every agency that follows the instructions gets a file that imports nothing
// — and nothing would fail until somebody tried it for real.

console.log("\n7. Migration template matches the importer");

const importerSrc = readFileSync(join(process.cwd(), "src/lib/admin-import.functions.ts"), "utf8");

for (const sheet of TEMPLATE_SHEETS) {
  check(
    `the importer reads a sheet named "${sheet.sheet}"`,
    importerSrc.includes(`"${sheet.sheet}"`),
    "not referenced in admin-import.functions.ts",
  );
  for (const col of sheet.columns) {
    check(
      `  ${sheet.sheet} → "${col}" is read by the importer`,
      importerSrc.includes(`r["${col}"]`),
      "the importer never reads this header",
    );
  }
}

const prompt = coworkPrompt(MIGRATION_SOURCES[0]);
check("the Cowork prompt inlines every sheet name",
  TEMPLATE_SHEETS.every((s) => prompt.includes(s.sheet)));
check("the Cowork prompt tells Claude to format IDs as text",
  /TEXT, not numbers/i.test(prompt));
check("the Cowork prompt pins an unambiguous date format",
  prompt.includes("YYYY-MM-DD"));
check("every source is either an export path or a cowork path",
  MIGRATION_SOURCES.every((s) => s.path === "export" || s.path === "cowork"));
check("every export-path source carries steps",
  MIGRATION_SOURCES.filter((s) => s.path === "export").every((s) => (s.steps?.length ?? 0) > 0),
  MIGRATION_SOURCES.filter((s) => s.path === "export" && !s.steps?.length).map((s) => s.id).join(", "));

console.log(
  `\n${passed} passed, ${failures.length} failed${failures.length ? ":" : "."}\n` +
    failures.map((f) => `  ${f}`).join("\n"),
);
process.exit(failures.length ? 1 : 0);
