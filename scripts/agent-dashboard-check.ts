/**
 * One agent, everything about how they are doing.
 *
 *   npx tsx scripts/agent-dashboard-check.ts
 *
 * The pure half is the arithmetic behind the tiles and the two charts. It is
 * worth testing rather than eyeballing because every one of these has a quiet
 * wrong answer that still renders:
 *
 *   * a daily series that skips empty days draws a fortnight of silence as a
 *     straight climb
 *   * a carrier split that drops unresolved carriers stops adding up to the
 *     total on the tile above it
 *   * an average over zero deals is NaN, which React will happily print
 *
 * The wiring half is mostly about what the page must NOT do: an owner may see
 * a downline agent's contact details and producer identity, and may not see
 * their SSN, date of birth or banking. Sharing an org is deliberately not
 * enough to read somebody's book.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  dealDate, inRange, summarize, dailySeries, byCarrier, rangeBounds, RANGE_LABELS,
  type DealRow,
} from "../src/lib/team/agent-dashboard";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const deal = (o: Partial<DealRow> & { id: string }): DealRow => ({
  annual_premium: 1000, posted_at: null, effective_date: null, carrier_name: "Ethos", ...o,
});

// ── When a deal counts ──────────────────────────────────────────────────────

check("a posted deal counts on the day it was posted",
  dealDate(deal({ id: "a", posted_at: "2026-03-04T12:00:00Z", effective_date: "2026-01-01" })), "2026-03-04T12:00:00Z");
// The whole reason for the fallback: an imported book was never "posted".
check("an imported deal falls back to its effective date",
  dealDate(deal({ id: "b", posted_at: null, effective_date: "2026-02-02" })), "2026-02-02");
check("a deal with neither date counts nowhere",
  dealDate(deal({ id: "c" })), null);
check("…and is excluded from a range rather than defaulting into it",
  inRange(deal({ id: "c" }), "2026-01-01", "2026-12-31"), false);

check("range bounds are inclusive at both ends",
  [inRange(deal({ id: "d", posted_at: "2026-03-01" }), "2026-03-01", "2026-03-31"),
   inRange(deal({ id: "e", posted_at: "2026-03-31" }), "2026-03-01", "2026-03-31")], [true, true]);
check("…and exclude the day either side",
  [inRange(deal({ id: "f", posted_at: "2026-02-28" }), "2026-03-01", "2026-03-31"),
   inRange(deal({ id: "g", posted_at: "2026-04-01" }), "2026-03-01", "2026-03-31")], [false, false]);
// A timestamp late in the day must not fall out of its own range.
check("a late-in-the-day timestamp still counts on that day",
  inRange(deal({ id: "h", posted_at: "2026-03-31T23:59:00Z" }), "2026-03-01", "2026-03-31"), true);

// ── The three tiles ─────────────────────────────────────────────────────────

console.log("");

check("summary totals premium and counts deals",
  summarize([deal({ id: "1", annual_premium: 1200 }), deal({ id: "2", annual_premium: 800 })]),
  { premium: 2000, deals: 2, average: 1000 });
check("average is per deal, not per day",
  summarize([deal({ id: "1", annual_premium: 900 }), deal({ id: "2", annual_premium: 300 }), deal({ id: "3", annual_premium: 300 })]).average, 500);
// NaN renders. Zero is the honest answer, and the UI shows a dash for it.
check("no deals is zero, never NaN", summarize([]), { premium: 0, deals: 0, average: 0 });
check("a null premium reads as zero rather than poisoning the total",
  summarize([deal({ id: "1", annual_premium: null }), deal({ id: "2", annual_premium: 500 })]).premium, 500);

// ── The trend ───────────────────────────────────────────────────────────────

console.log("");

const SERIES = dailySeries(
  [deal({ id: "1", posted_at: "2026-03-01", annual_premium: 100 }),
   deal({ id: "2", posted_at: "2026-03-01", annual_premium: 50 }),
   deal({ id: "3", posted_at: "2026-03-04", annual_premium: 200 })],
  "2026-03-01", "2026-03-05",
);
check("the series covers every day in the window, gaps included",
  SERIES.map((d) => d.day), ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"]);
check("…quiet days are zero, not missing", SERIES.map((d) => d.premium), [150, 0, 0, 200, 0]);
check("…and same-day deals accumulate", SERIES[0].deals, 2);
check("an imported deal lands on its effective date",
  dailySeries([deal({ id: "1", posted_at: null, effective_date: "2026-03-02", annual_premium: 70 })],
    "2026-03-01", "2026-03-03").map((d) => d.premium), [0, 70, 0]);
// A reversed range would otherwise loop forever.
check("a backwards range returns nothing rather than hanging",
  dailySeries([], "2026-03-05", "2026-03-01"), []);

// ── The carrier split ───────────────────────────────────────────────────────

console.log("");

const SLICES = byCarrier([
  deal({ id: "1", carrier_name: "Ethos", annual_premium: 300 }),
  deal({ id: "2", carrier_name: "Mutual of Omaha", annual_premium: 900 }),
  deal({ id: "3", carrier_name: "Ethos", annual_premium: 100 }),
  deal({ id: "4", carrier_name: null, annual_premium: 50 }),
]);
check("carriers are biggest first",
  SLICES.map((s) => s.carrier), ["Mutual of Omaha", "Ethos", "Unknown carrier"]);
check("…summed per carrier", SLICES.find((s) => s.carrier === "Ethos"), { carrier: "Ethos", premium: 400, deals: 2 });
// Dropping the unresolved ones is how the slices stop matching the tile.
check("an unresolved carrier is grouped, never dropped",
  SLICES.reduce((s, x) => s + x.premium, 0), 1350);

check("all-time has no bounds", rangeBounds("all", Date.parse("2026-03-10T00:00:00Z")), { start: null, end: null });
// Seven days should be a week of data, not eight days.
check("7d is inclusive of today",
  rangeBounds("7d", Date.parse("2026-03-10T12:00:00Z")), { start: "2026-03-04", end: "2026-03-10" });
check("every range has a label", Object.keys(RANGE_LABELS).length, 5);

// ── The page and its guard ──────────────────────────────────────────────────

console.log("");

const ROUTE = "src/routes/_authenticated/team.agent.$agentId.tsx";
check("the dashboard is a route, so it deep-links", existsSync(join(ROOT, ROUTE)), true);
const PAGE = read(ROUTE);
for (const section of [
  "Agent information", "Annual premium", "Contracts", "Production trend",
  "By carrier", "Book of business", "Their team",
]) {
  check(`the ${section} section renders`, PAGE.includes(section), true);
}
check("the range drives production, and production only",
  /rangeBounds\(rangeKey/.test(PAGE), true);

const FN = read("src/lib/team.functions.ts");
check("the dashboard has its own server function", /export const getAgentDashboard/.test(FN), true);
// Sharing an org is NOT enough: two agents under different uplines share one.
check("reading somebody else needs downline or agency admin",
  /is_in_downline/.test(FN) && /administersAgency\(userId\)/.test(FN), true);
check("…with same-org as the outer bound", /await assertSameOrg\(userId, target\)/.test(FN), true);

// The line the spec drew, and the one this repo just spent a PR enforcing.
// Comments stripped: the function's docblock names what it withholds on
// purpose, so the next person widening the select knows the rule exists.
const dashSelect = FN.slice(FN.indexOf("export const getAgentDashboard"))
  .replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
for (const banned of ["ssn_last4", "date_of_birth", "producer_banking", "drivers_license"]) {
  check(`the dashboard never reads ${banned}`, dashSelect.includes(banned), false);
}
check("…but does show producer identity", /npn_number/.test(dashSelect), true);

// ── The page it replaced ────────────────────────────────────────────────────

console.log("");

check("the old agent page redirects here",
  /redirect\(\{ to: "\/team\/agent\/\$agentId"/.test(read("src/routes/_authenticated/agency/agents/$agentId.tsx")), true);
check("nothing still links at the old path",
  ["src/components/onboarding/get-ready.tsx",
   "src/routes/_authenticated/contracting-ops/licensing.tsx",
   "src/routes/_authenticated/contracting-ops/requests/$requestId.tsx"]
    .filter((f) => read(f).includes("/agency/agents/$agentId")), []);
check("the roster opens it from a row",
  /to="\/team\/agent\/\$agentId"/.test(read("src/routes/_authenticated/team.tsx")), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
