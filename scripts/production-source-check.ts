/**
 * Every screen counts production the same way.
 *
 *   npx tsx scripts/production-source-check.ts
 *
 * The defect this closes was visible on one screen at one time. The dashboard's
 * KPI tiles sum `annual_premium` over `posted_at`. The production chart
 * directly beneath them bucketed on `COALESCE(effective_date, posted_at)`,
 * carrying a comment saying it matched `get_dashboard_metrics` — which it had
 * not since the July 2026 rewrite dropped that formula.
 *
 * So an agent posts a deal today with next month's effective date. The tiles
 * count it today; the chart files it under next month, and if that is past the
 * end of the range, drops it. A back-dated policy falls the other way: posted
 * in range, bucketed before the window, gone. Same agent, same window, two
 * numbers, no way to tell which is wrong.
 *
 * The pure half fixes the definition; the wiring half asserts that nothing
 * still keeps its own.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PRODUCTION_DATE_COLUMN,
  productionDate,
  premiumOf,
  sumPremium,
  tally,
  tallyInWindow,
  tallyByAgent,
  inWindow,
} from "../src/lib/production/source";
import { inRange } from "../src/lib/team/production";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass++;
    console.log(`ok    ${name}`);
  } else {
    fail++;
    console.log(
      `FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`,
    );
  }
}

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) =>
  s
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── The date, which is the whole bug ────────────────────────────────────────

// Posted today, effective next month: the exact shape that fell in two places.
const futureDated = {
  annual_premium: 1200,
  posted_at: "2026-08-14T10:00:00Z",
  effective_date: "2026-09-01",
};
check("production is dated by when it was posted",
  productionDate(futureDated), "2026-08-14T10:00:00Z");
check("…not by when the policy takes effect",
  productionDate(futureDated) === futureDated.effective_date, false);
check("a policy posted in August counts in August",
  inWindow(futureDated, "2026-08-01T00:00:00Z", "2026-08-31T23:59:59Z"), true);
// Under the old chart formula this landed in September and vanished from an
// August range entirely.
check("…and not in September",
  inWindow(futureDated, "2026-09-01T00:00:00Z", "2026-09-30T23:59:59Z"), false);

const backDated = {
  annual_premium: 600,
  posted_at: "2026-08-14T10:00:00Z",
  effective_date: "2026-01-01",
};
check("a back-dated policy still counts when it was posted",
  inWindow(backDated, "2026-08-01T00:00:00Z", "2026-08-31T23:59:59Z"), true);

// An unposted policy is not production yet. Treating a missing date as the
// epoch would park it in whichever bucket happens to be earliest.
check("a policy with no posted date is in no window",
  inWindow({ annual_premium: 100, posted_at: null }, null, null), false);

// The end is inclusive: the leaderboard and the scope rollup both send
// `.lte(posted_at, rangeEnd)`, and a range ending at the last instant of a day
// must include that day.
check("the end of a window is inclusive",
  inWindow({ annual_premium: 1, posted_at: "2026-08-31T23:59:59Z" }, null, "2026-08-31T23:59:59Z"),
  true);

check("the column every window filters on is named once",
  PRODUCTION_DATE_COLUMN, "posted_at");

// ── Summing ─────────────────────────────────────────────────────────────────

console.log("");

const ROWS = [
  { annual_premium: 1200, posted_at: "2026-08-01T00:00:00Z", agent_id: "a" },
  { annual_premium: "600", posted_at: "2026-08-15T00:00:00Z", agent_id: "a" },
  { annual_premium: null, posted_at: "2026-08-20T00:00:00Z", agent_id: "b" },
  { annual_premium: 900, posted_at: "2026-07-01T00:00:00Z", agent_id: "b" },
];

check("premium sums across rows", sumPremium(ROWS), 2700);
// PostgREST returns numerics as strings often enough that a silent NaN here
// would zero a whole agency's board.
check("…parsing a numeric that arrived as a string", premiumOf({ annual_premium: "600" }), 600);
check("…and treating a missing premium as zero, not NaN",
  premiumOf({ annual_premium: null }), 0);
// A policy with no premium is still a policy: the count and the money are
// different questions.
check("a policy with no premium still counts as a policy",
  tally(ROWS), { premium: 2700, policies: 4 });
check("a window narrows both halves",
  tallyInWindow(ROWS, "2026-08-01T00:00:00Z", "2026-08-31T23:59:59Z"),
  { premium: 1800, policies: 3 });

const byAgent = tallyByAgent(ROWS);
check("per-agent totals split correctly", byAgent.get("a"), { premium: 1800, policies: 2 });
check("…including a policy that carries no premium",
  byAgent.get("b"), { premium: 900, policies: 2 });
// A phantom leaderboard row is worse than a missing one.
check("an unattributed policy belongs to nobody",
  tallyByAgent([{ annual_premium: 500, posted_at: "2026-08-01T00:00:00Z" }]).size, 0);

// No status filter: production is what somebody wrote, not what survived.
// Netting lapses out here would make production and retention impossible to
// reconcile.
const lapsed = { annual_premium: 1000, posted_at: "2026-08-01T00:00:00Z", status: "lapsed" };
check("a lapsed policy still counts as production", sumPremium([lapsed]), 1000);

// The roster reaches the same answer through its own name for it.
check("the roster's inRange is the same window",
  inRange("2026-08-14T10:00:00Z", "2026-08-01T00:00:00Z", "2026-08-31T23:59:59Z"), true);
check("…including its treatment of a missing date", inRange(null, null, null), false);

// ── Nothing keeps its own copy ──────────────────────────────────────────────

console.log("");

const DASH = strip(read("src/lib/dashboard.functions.ts"));

// The bug itself: gone, and it cannot come back unnoticed.
check("the chart no longer prefers the effective date",
  /effective_date \?\? p\.posted_at/.test(DASH), false);
check("…and no longer reads effective_date at all",
  /effective_date/.test(DASH), false);
check("the chart buckets on the shared date",
  /const when = productionDate\(p\)/.test(DASH), true);
// The 400-day back-pad existed only to compensate for filtering on one column
// and bucketing on another.
check("…so the 400-day fetch pad is gone", /400 \* 86400000/.test(DASH), false);

check("every window filters on the named column",
  (DASH.match(/\.gte\("posted_at"/g) ?? []).length, 0);
check("…by name, not by literal",
  (DASH.match(/PRODUCTION_DATE_COLUMN/g) ?? []).length >= 5, true);

check("the leaderboard totals through the shared tally",
  /tallyByAgent\(\(agents \?\? \[\]\) as ProductionRow\[\]\)/.test(DASH), true);
check("the scope rollup sums through it too",
  /return sumPremium\(\(rows \?\? \[\]\) as ProductionRow\[\]\)/.test(DASH), true);
check("my numbers sum through it as well", /sumPremium\(\s*rows\.filter/.test(DASH), true);

const TEAM = strip(read("src/lib/team/production.ts"));
check("the roster delegates rather than restating",
  /return inWindow\(\{ posted_at: postedAt \?\? null \}, start, end\)/.test(TEAM), true);
check("…and takes its zero from the same module", /ZERO: Tally = ZERO_TALLY/.test(TEAM), true);

// The live RPC is the thing the TypeScript is meant to agree with. If somebody
// reintroduces a business date there, this fails and the disagreement is
// caught in the repository rather than on a screen.
const RPC = read("supabase/migrations/20260715120000_dashboard-real-data.sql");
check("the live dashboard RPC windows on posted_at",
  /pol\.posted_at >= _range_start/.test(RPC), true);
check("…and does not coalesce an effective date",
  /COALESCE\(pol\.effective_date/i.test(RPC), false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
