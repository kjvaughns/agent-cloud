/**
 * A deal written today counts today.
 *
 *   npx tsx scripts/production-window-check.ts
 *
 * ── The defect ──
 *
 * "Total production (team) — my numbers aren't being added in."
 *
 * They were. What was missing was a deal, and the reason is two individually
 * sensible decisions that are jointly wrong.
 *
 * `saleDateToTimestamp` stamps a production date at MIDDAY UTC, deliberately:
 * midnight cast to `timestamptz` lands in the previous day everywhere west of
 * UTC, which would push a sale on the 1st into the previous month for a US
 * agency. So a production date is a DAY.
 *
 * Every "this month so far" window was built as `end: now` — the current
 * instant. For the first twelve hours of each UTC day `now` is EARLIER than the
 * midday stamp on a deal sold that day, so the deal sits in the future as far
 * as the window is concerned and drops out of the figure.
 *
 * For a US agency that is the entire working morning. The roster passes no
 * upper bound at all, so it kept showing the deal — two screens, one table,
 * different answers, and nothing on either saying a window had been applied.
 *
 * Comparing a day-granular value against a sub-day instant is the category
 * error. These assertions pin the boundary at the end of the day instead, and
 * check the two things that must both hold: today is in, tomorrow is out.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { productionWindowEnd, endOfProductionDay, inWindow } from "../src/lib/production/source";
import { periodRanges } from "../src/lib/leaderboard/board";
import { saleDateToTimestamp } from "../src/lib/sale-date";

const ROOT = join(import.meta.dirname, "..");

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const sold = (day: string) => ({
  agent_id: "a",
  annual_premium: 1000,
  status: "active",
  production_date: saleDateToTimestamp(day),
  posted_at: saleDateToTimestamp(day),
}) as any;

// ── The reported moment: 5:27am US Eastern, which is 09:27 UTC ──────────────
//
// Before midday UTC, and therefore before the stamp on anything sold today.

const EARLY = new Date("2026-08-18T09:27:00Z");
const monthStart = "2026-08-01T04:00:00.000Z"; // local month start, US Eastern

check(
  "the window ends after today's midday stamp, not at the current moment",
  productionWindowEnd(EARLY).toISOString(),
  "2026-08-18T23:59:59.999Z",
);
check(
  "a deal sold today is inside a window read before midday UTC",
  inWindow(sold("2026-08-18"), monthStart, productionWindowEnd(EARLY).toISOString()),
  true,
);
check(
  "…which it was NOT when the window ended at the current instant",
  inWindow(sold("2026-08-18"), monthStart, EARLY.toISOString()),
  false,
);
check(
  "tomorrow's deal is still outside",
  inWindow(sold("2026-08-19"), monthStart, productionWindowEnd(EARLY).toISOString()),
  false,
);
check(
  "and an earlier deal this month is unaffected",
  inWindow(sold("2026-08-11"), monthStart, productionWindowEnd(EARLY).toISOString()),
  true,
);

// Late in the UTC day the answer must not change — the bug was invisible in
// the afternoon, which is how it survived.
const LATE = new Date("2026-08-18T21:27:00Z");
check(
  "the boundary is the same whatever time of day it is read",
  productionWindowEnd(LATE).toISOString(),
  productionWindowEnd(EARLY).toISOString(),
);

// ── Every leaderboard period ends on a day boundary ─────────────────────────

for (const p of ["today", "week", "month", "ytd"] as const) {
  const r = periodRanges(p, EARLY);
  check(
    `periodRanges("${p}") ends at the end of a UTC day`,
    r.end.toISOString().slice(10),
    "T23:59:59.999Z",
  );
  check(
    `…so a deal sold today is on the ${p} board`,
    inWindow(sold("2026-08-18"), r.start.toISOString(), r.end.toISOString()),
    true,
  );
  check(
    `…and the period it is compared against ends on one too`,
    r.prevEnd.toISOString().slice(10),
    "T23:59:59.999Z",
  );
}

// `last_month` is two complete months and was never truncated, so it must keep
// ending where the current month begins rather than gaining a day.
{
  const r = periodRanges("last_month", EARLY);
  check(
    "last_month still excludes the first of this month",
    inWindow(sold("2026-08-01"), r.start.toISOString(), r.end.toISOString()),
    false,
  );
  check(
    "…and includes the last day of the month it names",
    inWindow(sold("2026-07-31"), r.start.toISOString(), r.end.toISOString()),
    true,
  );
}

// The prior window must be a real comparison, not an empty one: this is what
// made every delta on the board meaningless before midday.
{
  const r = periodRanges("today", EARLY);
  check(
    "yesterday's deal is inside today's comparison window",
    inWindow(sold("2026-08-17"), r.prevStart.toISOString(), r.prevEnd.toISOString()),
    true,
  );
}

check(
  "endOfProductionDay does not shift the day it is given",
  endOfProductionDay(new Date("2026-03-09T00:00:00Z")).toISOString(),
  "2026-03-09T23:59:59.999Z",
);

// ── No screen ends a production window at the current instant ───────────────

const strip = (s: string) =>
  s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const read = (p: string) => strip(readFileSync(join(ROOT, p), "utf8"));

const DASH = read("src/routes/_authenticated/dashboard.tsx");
const BOARD = read("src/lib/leaderboard/board.ts");

check("the dashboard no longer ends a range at now", /end: now\b/.test(DASH), false);
check("…and uses the shared rule", /productionWindowEnd\(now\)/.test(DASH), true);
check("the leaderboard no longer ends a range at now", /end: now\b/.test(BOARD), false);
check("…and uses the shared rule", /productionWindowEnd\(now\)/.test(BOARD), true);

// The roster passes no upper bound, which is why it was right all along. If it
// ever grows one it must come from the same place.
const ROSTER = read("src/lib/team/production.ts");
check("the roster still leaves its window open at the end", /end: null/.test(ROSTER), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
