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

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { periodRanges } from "../src/lib/leaderboard/board";
import {
  PRODUCTION_DATE_COLUMN,
  productionDate,
  premiumOf,
  sumPremium,
  sumPlaced,
  placementRate,
  countsAsProduction,
  NON_PRODUCTION_STATUSES,
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
  PRODUCTION_DATE_COLUMN, "production_date");

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
  tally(ROWS), { premium: 2700, policies: 4, placed: 0 });
check("a window narrows both halves",
  tallyInWindow(ROWS, "2026-08-01T00:00:00Z", "2026-08-31T23:59:59Z"),
  { premium: 1800, policies: 3, placed: 0 });

const byAgent = tallyByAgent(ROWS);
check("per-agent totals split correctly", byAgent.get("a"), { premium: 1800, policies: 2, placed: 0 });
check("…including a policy that carries no premium",
  byAgent.get("b"), { premium: 900, policies: 2, placed: 0 });
// A phantom leaderboard row is worse than a missing one.
check("an unattributed policy belongs to nobody",
  tallyByAgent([{ annual_premium: 500, posted_at: "2026-08-01T00:00:00Z" }]).size, 0);

// No status filter: production is what somebody wrote, not what survived.
// Netting lapses out here would make production and retention impossible to
// reconcile.
const lapsed = { annual_premium: 1000, posted_at: "2026-08-01T00:00:00Z", status: "lapsed" };
check("a lapsed policy still counts as production", sumPremium([lapsed]), 1000);

// ── Which statuses count, and the date that decides when ────────────────────
//
// The brief: "Exclude deleted, duplicate, withdrawn, and invalid records."
// Three statuses in this schema mean the business never placed and never will.

console.log("");

for (const status of ["withdrawn", "not_taken", "carrier_na"]) {
  check(`a ${status} policy is not production`,
    countsAsProduction({ status }), false);
  check(`…and is in no window at any date`,
    inWindow({ status, production_date: "2026-08-01T00:00:00Z" }, null, null), false);
}
// Deliberately still counted: these were placed, the premium was real and the
// commission was advanced. Netting them out would make production and
// retention impossible to reconcile.
for (const status of ["active", "issued_not_paid", "in_review", "lapse_pending", "lapsed", "cancelled", "postponed"]) {
  check(`a ${status} policy is production`, countsAsProduction({ status }), true);
}
check("a row with no status counts, rather than vanishing",
  countsAsProduction({}), true);
check("an ineligible policy contributes nothing to a sum",
  sumPremium([{ annual_premium: 500, status: "withdrawn" }]), 0);
check("…nor to a count", tally([{ annual_premium: 500, status: "withdrawn" }]).policies, 0);

// Placed premium, the figure the brief asks for beside production.
const MIXED = [
  { annual_premium: 1000, status: "active", production_date: "2026-08-01T00:00:00Z" },
  { annual_premium: 500, status: "lapsed", production_date: "2026-08-02T00:00:00Z" },
  { annual_premium: 200, status: "withdrawn", production_date: "2026-08-03T00:00:00Z" },
];
check("production counts what was written", sumPremium(MIXED), 1500);
check("placed counts what is on the books", sumPlaced(MIXED), 1000);
check("…and the withdrawn one is in neither",
  sumPremium(MIXED) + sumPlaced(MIXED), 2500);
check("the placement rate is placed over produced", placementRate(MIXED), 1000 / 1500);
// A person who wrote nothing has no rate; 0% would read as "everything lapsed".
check("nothing written has no rate, rather than zero", placementRate([]), null);

// ── The date, and the imported book it repairs ──────────────────────────────

console.log("");

// The reported contradiction: the leaderboard shows zero for a month the book
// of business plainly has business in. Two import paths stamp posted_at = now.
const IMPORTED = {
  annual_premium: 1200,
  posted_at: "2026-08-14T15:00:00Z",
  production_date: "2024-03-01T00:00:00Z",
  effective_date: "2024-03-01",
  status: "active",
};
check("an imported policy is dated when it was written",
  productionDate(IMPORTED), "2024-03-01T00:00:00Z");
check("…so it counts in the month it was written",
  inWindow(IMPORTED, "2024-03-01T00:00:00Z", "2024-03-31T23:59:59Z"), true);
check("…and not in the month it was imported",
  inWindow(IMPORTED, "2026-08-01T00:00:00Z", "2026-08-31T23:59:59Z"), false);

// The rule only ever moves a date backwards, so the #144 bug cannot return.
const FORWARD = {
  annual_premium: 600,
  posted_at: "2026-08-14T10:00:00Z",
  production_date: "2026-08-14T10:00:00Z",
  effective_date: "2026-09-01",
  status: "active",
};
check("a forward-dated sale still counts when it was posted",
  inWindow(FORWARD, "2026-08-01T00:00:00Z", "2026-08-31T23:59:59Z"), true);
check("…and not in the month it takes effect",
  inWindow(FORWARD, "2026-09-01T00:00:00Z", "2026-09-30T23:59:59Z"), false);

// A row read before the migration applied has no production_date.
check("a row without the new column falls back to posted_at",
  productionDate({ posted_at: "2026-08-14T10:00:00Z" }), "2026-08-14T10:00:00Z");

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
// Every production read goes through the one helper that knows what to do
// while the column is still pending. One added the old way would be right
// today and wrong for the hours between shipping and the migration applying.
//
// A floor rather than an exact count: this asserted "exactly four" and went
// red the moment a fifth READER was added correctly, which teaches whoever
// hits it to edit the number rather than look. The guard that actually
// matters is the assertion above — no window filtered by hand — and this one
// says the helper is still what the file reaches for.
check("…through the helper, not by hand",
  (DASH.match(/selectProduction</g) ?? []).length >= 4, true);
check("…which is where the pending-column fallback lives",
  /from "@\/lib\/production\/source\.server"/.test(DASH), true);

const SRV = strip(read("src/lib/production/source.server.ts"));
check("the fallback triggers on a missing column", /42703/.test(SRV), true);
// Retrying a permissions failure against a different column would answer a
// different question and look like success.
check("…and only on a missing column",
  /if \(!isMissingColumn\(first\.error\)\) \{/.test(SRV), true);
check("…falling back to what the product does today",
  /await build\("posted_at"\)/.test(SRV), true);

// Naming the column in the projection is the same 42703 as naming it in a
// filter, so every production read asks for the row.
check("no production read names the pending column",
  /production_date/.test(DASH), false);
const TEAMFN = strip(read("src/lib/team.functions.ts"));
check("…nor does the roster", /production_date/.test(TEAMFN), false);

check("the leaderboard totals through the shared tally",
  /tallyByAgent\(\(agents \?\? \[\]\) as ProductionRow\[\]\)/.test(DASH), true);
check("the scope rollup sums through it too",
  /return sumPremium\(\(rows \?\? \[\]\) as ProductionRow\[\]\)/.test(DASH), true);
check("my numbers sum through it as well", /sumPremium\(\s*rows\.filter/.test(DASH), true);

const TEAM = strip(read("src/lib/team/production.ts"));
check("the roster delegates rather than restating",
  /return inWindow\(\{ posted_at: postedAt \?\? null \}, start, end\)/.test(TEAM), true);
check("…and takes its zero from the same module", /ZERO: Tally = ZERO_TALLY/.test(TEAM), true);

// ── The database agrees with the module ─────────────────────────────────────
//
// The dashboard's headline figures come from an RPC, not from the TypeScript
// above. A definition the TypeScript honours and the RPC does not is worse
// than the original bug: one screen would disagree with every other, which
// reads as the others being wrong.

const sql = (s: string) => s.replace(/--[^\n]*/g, "");
const RPC = sql(read("supabase/migrations/20260814250000_production-date.sql"));

check("the dashboard RPC windows on the shared date",
  /pol\.production_date >= _range_start/.test(RPC), true);
check("…and no longer windows on posted_at",
  /pol\.posted_at >= _range_start/.test(RPC), false);
check("…including the twelve-month chart",
  /ON pol\.production_date >= m\.m_start/.test(RPC), true);
check("…and does not coalesce an effective date",
  /COALESCE\(pol\.effective_date/i.test(RPC), false);

// Migrations apply in filename order, so the LAST file to define the RPC is
// the definition the database ends up with. Asserting the filename ordering by
// hand proved nothing — it compared two constants. This reads the directory,
// so a migration added later that redefines the function on `posted_at` fails
// here rather than quietly winning at apply time.
const definers = readdirSync(join(ROOT, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => /CREATE OR REPLACE FUNCTION public\.get_dashboard_metrics/i
    .test(read(`supabase/migrations/${f}`)))
  .sort();
// Assert the BEHAVIOUR of whichever file defines it last, not its name.
// Applying a migration by hand records it under a generated filename, so the
// last definer is legitimately not always the one written here — but whatever
// it is, it must still window on the production date.
const lastDefiner = read(`supabase/migrations/${definers.at(-1)}`);
check("the last migration to define the dashboard RPC windows on production_date",
  /pol\.production_date >= _range_start/.test(lastDefiner), true);
check("…and not on posted_at",
  /pol\.posted_at >= _range_start/.test(lastDefiner), false);
check("…and its twelve-month chart agrees",
  /ON pol\.production_date >= m\.m_start/.test(lastDefiner), true);

// One list of statuses, on both sides of the wire.
const fnBody = RPC.match(
  /create or replace function public\.policy_counts_as_production[\s\S]*?\$\$([\s\S]*?)\$\$/i,
)?.[1] ?? "";
check("the database has one eligibility function", fnBody.length > 0, true);
check("…excluding exactly the statuses the module excludes",
  (fnBody.match(/'([a-z_]+)'/g) ?? []).map((s) => s.replace(/'/g, "")).sort(),
  [...NON_PRODUCTION_STATUSES].sort());
// A null status means "not recorded", not "not production". Dropping those
// would silently delete production from the dashboard only.
check("…and letting a null status through, as the module does",
  /_status is null/.test(fnBody), true);

check("the RPC's production figures use that function",
  /where public\.policy_counts_as_production\(status::text\)/i.test(RPC), true);
check("…and so does the chart",
  /public\.policy_counts_as_production\(pol\.status::text\)/i.test(RPC), true);
// The status grid is a pipeline view. A withdrawn application is exactly what
// somebody opens it to see, so it must read the unfiltered set.
check("the pipeline grid still shows every status",
  /status_grid AS \(\s*SELECT status::text AS status, COUNT\(\*\) AS cnt\s*FROM range_policies/.test(RPC),
  true);
check("…as does the donut", /donut AS \([\s\S]*?FROM range_policies/.test(RPC), true);

// The backfill runs once. Without a trigger the next import writes another
// four hundred policies dated the afternoon of the import.
check("new rows get a production date too",
  /create trigger policies_set_production_date\s*before insert on public\.policies/.test(RPC), true);
check("…by the same rule as the backfill",
  /when new\.effective_date is not null\s*and new\.effective_date::timestamptz < coalesce\(new\.posted_at, now\(\)\)/.test(RPC),
  true);
// A caller that knows a better date must be able to say so.
check("…and only when the caller did not set one",
  /if new\.production_date is null then/.test(RPC), true);
// A column default is applied before a BEFORE INSERT trigger sees the row, so
// `default now()` would make the trigger's null test permanently false and the
// import bug would survive the migration meant to fix it.
check("…which a column default would make impossible",
  /alter column production_date drop default/.test(RPC), true);
check("…so no default is set", /production_date set default/.test(RPC), false);

// ── The brief's own test ────────────────────────────────────────────────────
//
// "Add tests proving that a policy shown in the book of business appears in
// the correct leaderboard period."
//
// The book of business has no date window: it lists everything. The
// leaderboard windows on production_date. So the property to prove is that
// every policy the book shows lands in exactly one period, and in the right
// one — which is what the imported book was failing at.

console.log("");

const BOOK = [
  // Written March 2024, imported August 2026. The reported bug.
  { id: "1", annual_premium: 1200, posted_at: "2026-08-14T15:00:00Z",
    production_date: "2024-03-11T00:00:00Z", status: "active" },
  // Written and posted the same day, last month.
  { id: "2", annual_premium: 900, posted_at: "2026-07-09T10:00:00Z",
    production_date: "2026-07-09T10:00:00Z", status: "active" },
  // Posted this month, effective next.
  { id: "3", annual_premium: 600, posted_at: "2026-08-03T10:00:00Z",
    production_date: "2026-08-03T10:00:00Z", effective_date: "2026-09-01", status: "issued_not_paid" },
  // Withdrawn: in the book, and not production.
  { id: "4", annual_premium: 400, posted_at: "2026-08-04T10:00:00Z",
    production_date: "2026-08-04T10:00:00Z", status: "withdrawn" },
];

const NOW = new Date(2026, 7, 14, 14, 0, 0);
const inPeriod = (row: any, p: Parameters<typeof periodRanges>[0]) => {
  const r = periodRanges(p, NOW);
  return inWindow(row, r.start.toISOString(), r.end.toISOString());
};

check("a policy written in March 2024 is in year-to-date? no — a prior year",
  inPeriod(BOOK[0], "ytd"), false);
check("…and it is in a custom range covering March 2024",
  inWindow(BOOK[0], "2024-03-01T00:00:00Z", "2024-03-31T23:59:59Z"), true);
// Before the migration this policy was dated the import afternoon, so it
// appeared in "This Month" and nowhere else.
check("…and NOT in this month, where the import put it",
  inPeriod(BOOK[0], "month"), false);

check("a policy written last month is in Last Month", inPeriod(BOOK[1], "last_month"), true);
check("…and not in This Month", inPeriod(BOOK[1], "month"), false);
check("…and is in year to date", inPeriod(BOOK[1], "ytd"), true);

check("a policy posted this month is in This Month", inPeriod(BOOK[2], "month"), true);
check("…even though it takes effect next month", inPeriod(BOOK[2], "ytd"), true);

// In the book, not on the board. Both are correct and they are different
// questions: the book lists the record, the leaderboard counts production.
check("a withdrawn policy is in the book and in no period",
  [inPeriod(BOOK[3], "month"), inPeriod(BOOK[3], "ytd")], [false, false]);

// Every eligible policy counted once, never twice.
const eligible = BOOK.filter(countsAsProduction);
check("every eligible policy in the book counts exactly once",
  eligible.length, 3);
check("…and the periods do not double-count it",
  tallyInWindow(BOOK, "2026-08-01T00:00:00Z", "2026-08-31T23:59:59Z").policies, 1);

// ── Every screen, not just the dashboard ────────────────────────────────────
//
// Reports is the screen somebody opens to ask "how much did we write", and it
// was the last one still answering differently: windowed on `posted_at`, so an
// imported book read zero for the months it was written in, and no status
// filter at all, so withdrawn and not-taken premium was in the headline.

console.log("");

const REPORTS = strip(read("src/lib/reports.functions.ts"));
check("reports go through the shared source",
  /from "@\/lib\/production\/source"/.test(REPORTS), true);
check("…windowing on the shared column, not posted_at",
  /\.gte\("posted_at"/.test(REPORTS), false);
check("…and excluding what is not production",
  /if \(!countsAsProduction\(p\)\) continue;/.test(REPORTS), true);
check("…while the status breakdown still shows every status",
  /byStatus\.set\(p\.status[\s\S]{0,80}?if \(!countsAsProduction/.test(REPORTS), true);
check("…and reports placed premium beside production",
  /placed: sumPlaced\(eligible\)/.test(REPORTS), true);

// The chart drawn under a KPI tile must not count what the tile excludes.
check("the MTD sparkline applies the status rule",
  (DASH.match(/if \(!countsAsProduction\(/g) ?? []).length, 2);

const RECRUIT = strip(read("src/lib/recruiting.functions.ts"));
// This was a lifetime sum of every policy whatever became of it.
check("recruited production excludes what never placed",
  /if \(!countsAsProduction\(pol\)\) continue;/.test(RECRUIT), true);

// ── The analytics RPCs ──────────────────────────────────────────────────────

console.log("");

const ANALYTICS = sql(read("supabase/migrations/20260815030000_analytics-production-source.sql"));
for (const fn of [
  "get_carrier_breakdown", "get_agent_analytics", "get_team_leaderboard",
  "get_analytics_overview", "get_trends_12mo",
]) {
  check(`${fn} is redefined`,
    new RegExp(`create or replace function public\\.${fn}\\b`, "i").test(ANALYTICS), true);
}
// Fourteen windows across the five, each gaining the same status guard.
check("every window moved to the production date",
  (ANALYTICS.match(/production_date >= /g) ?? []).length, 14);
check("…and each gained the eligibility guard",
  (ANALYTICS.match(/public\.policy_counts_as_production\(/g) ?? []).length, 14);
check("no window is left on posted_at",
  /posted_at\s*(>=|<)/.test(ANALYTICS), false);
// The activity feed shows when a deal was ENTERED, which is a real fact and a
// different question from when the business was written.
check("…but the activity feed keeps its posted timestamp",
  /pol\.posted_at AS at/.test(ANALYTICS), true);
// Behaviour only: no schema change hiding in a behavioural migration.
check("nothing structural changes",
  /alter table|create table|drop /i.test(ANALYTICS), false);

// ── A failed read is not zero production ────────────────────────────────────
//
// `selectProduction` swallowed every error that was not a missing column and
// returned `[]`, with a comment calling that honest because nothing had been
// read. It is not honest, because nothing renders it that way: the leaderboard
// draws "$0 ALP · 0 policies written" and the dashboard draws zeros, and both
// are statements about the agency's business rather than about the query.
//
// So a broken read and a genuinely quiet month were the same picture, and the
// error object was discarded so the logs were empty too — leaving nothing to
// look at when somebody says "it still shows 0".

console.log("");

const SRC = readFileSync(join(process.cwd(), "src/lib/production/source.server.ts"), "utf8");

check("a real read failure throws rather than reading as zero",
  /throw new Error\(\s*`Could not read production:/.test(SRC), true);
check("…and is logged with its code, so there is something to look at",
  /console\.error\("\[production\] read failed"/.test(SRC), true);
// The one case that legitimately falls back is a column that is not there yet.
check("a missing column still falls back to posted_at",
  /console\.warn\("\[production\] production_date is missing/.test(SRC) &&
  /const second = await build\("posted_at"\)/.test(SRC), true);
check("…and the fallback failing is not silent either",
  /\[production\] fallback read failed/.test(SRC), true);
// The empty return is gone. A caller receiving [] now means the query ran and
// matched nothing, which is the only thing it should ever have meant.
check("no path returns an empty array to mean failure",
  /^\s*return \[\];\s*$/m.test(SRC), false);

// ── A name must not be able to delete production ────────────────────────────
//
// The leaderboard read `.select("*, profiles!inner(...)")`. An inner join drops
// the policy row whenever the embedded profile does not come back, so a board
// sitting beside dashboard tiles reading $1,553 and 1 policy — same month, same
// agent, same table — reported "No production yet this period". The three tile
// queries select `*`; this one did not, and that was the entire difference.
//
// Nothing errored. The rows simply were not there, which is the worst shape a
// bug can take on a screen whose job is to report a number.

console.log("");

check("no production read joins a table it does not need",
  /!inner/.test(DASH), false);
// All four reads of `policies` now have the same shape, so one of them cannot
// quietly return a different answer from the other three.
check("every production read selects the row and nothing else",
  (DASH.match(/\.from\("policies"\)[\s\S]{0,300}?\.select\("\*"\)/g) ?? []).length >= 4, true);
check("the leaderboard resolves names in its own query",
  /\.from\("profiles"\)\.select\("id, first_name, last_name"\)\.in\("id", producerIds\)/.test(DASH), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
