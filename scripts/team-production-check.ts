/**
 * Own versus team, over a range — and an At Risk column that does not pretend
 * to be a debt column.
 *
 *   npx tsx scripts/team-production-check.ts
 *
 * The pure half exercises the rollup. It is the piece most likely to be wrong
 * in a way nobody notices: a team total that quietly includes the agent's own
 * writing makes a strong personal producer look like a strong builder, which
 * is exactly the distinction the two columns exist to draw.
 *
 * The wiring half pins the things that make those numbers honest — the range
 * reaching the server, the range being part of the cache key, and the at-risk
 * column being labelled per month, because `retention_cases.premium_at_risk`
 * is monthly premium while production is annualised.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RANGE_LABELS, ZERO, inRange, producedInRange, rangeBounds, rollUpDownline, type Tally,
} from "../src/lib/team/production";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const NOW = Date.parse("2026-08-14T12:00:00.000Z");

// ── The range ───────────────────────────────────────────────────────────────

check("all time has no bounds", rangeBounds("all", NOW), { start: null, end: null });
check("last week is a rolling seven days",
  rangeBounds("week", NOW).start, "2026-08-07T12:00:00.000Z");
check("last month is thirty days", rangeBounds("month", NOW).start, "2026-07-15T12:00:00.000Z");
check("last three months is ninety", rangeBounds("quarter", NOW).start, "2026-05-16T12:00:00.000Z");
check("a rolling window leaves the far end open", rangeBounds("month", NOW).end, null);
check("custom passes both bounds through",
  rangeBounds("custom", NOW, { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" }),
  { start: "2026-01-01T00:00:00.000Z", end: "2026-02-01T00:00:00.000Z" });
check("every range has a label", Object.keys(RANGE_LABELS).length, 5);

check("a policy inside the window counts",
  inRange("2026-08-10T00:00:00.000Z", "2026-08-07T12:00:00.000Z", null), true);
check("one before the start does not",
  inRange("2026-08-01T00:00:00.000Z", "2026-08-07T12:00:00.000Z", null), false);
check("one after the end does not",
  inRange("2026-03-01T00:00:00.000Z", null, "2026-02-01T00:00:00.000Z"), false);
check("open bounds accept anything dated", inRange("2020-01-01T00:00:00.000Z", null, null), true);
check("a policy with no date is never counted", inRange(null, null, null), false);

// ── The rollup ──────────────────────────────────────────────────────────────

console.log("");

//   owner
//     ├── manager        ── has a downline of two
//     │     ├── alice
//     │     └── bob
//     └── solo           ── writes personally, builds nobody
const TREE = [
  { id: "manager", upline_id: "owner" },
  { id: "alice", upline_id: "manager" },
  { id: "bob", upline_id: "manager" },
  { id: "solo", upline_id: "owner" },
];
// `placed` defaults to zero so the cases below stay about the rollup; the
// placed column has its own coverage in production-source-check.
const t = (premium: number, policies: number, placed = 0): Tally =>
  ({ premium, policies, placed });
const OWN = new Map<string, Tally>([
  ["manager", t(1000, 1)],
  ["alice", t(5000, 4)],
  ["bob", t(3000, 2)],
  ["solo", t(9000, 7)],
]);

{
  const team = rollUpDownline(TREE, OWN);
  check("a builder's team is the sum of their downline", team.get("manager"), t(8000, 6));
  // The distinction the two columns exist to draw.
  check("…and excludes their own writing", team.get("manager")!.premium, 8000);
  check("a personal producer has no team", team.get("solo"), ZERO);
  check("a leaf has no team", team.get("alice"), ZERO);
}

{
  // The owner is outside the loaded set, so manager and solo are roots here —
  // which is what the roster shows: the caller's downline, not the caller.
  const team = rollUpDownline(TREE, OWN);
  check("an upline outside the roster does not swallow the tree",
    [team.get("manager") !== undefined, team.get("solo") !== undefined], [true, true]);
}

{
  // Deeper: the grandparent's team must include the grandchildren.
  const deep = [
    { id: "m", upline_id: null },
    { id: "sub", upline_id: "m" },
    { id: "leaf", upline_id: "sub" },
  ];
  const own = new Map<string, Tally>([["m", t(1, 1)], ["sub", t(10, 1)], ["leaf", t(100, 1)]]);
  const team = rollUpDownline(deep, own);
  check("a rollup reaches grandchildren", team.get("m"), t(110, 2));
  check("…and the middle carries only what is under it", team.get("sub"), t(100, 1));
}

{
  // upline_id is not constrained acyclic. A loop must not hang the render.
  const cyclic = [
    { id: "a", upline_id: "b" },
    { id: "b", upline_id: "a" },
  ];
  const own = new Map<string, Tally>([["a", t(5, 1)], ["b", t(7, 1)]]);
  const team = rollUpDownline(cyclic, own);
  check("a cycle terminates instead of hanging", team.size, 2);
}

check("somebody who wrote nothing has not produced", producedInRange(ZERO, ZERO), false);
check("own production counts", producedInRange(t(100, 1), ZERO), true);
// A manager whose downline wrote business has not gone quiet.
check("team production counts too", producedInRange(ZERO, t(100, 1)), true);

// ── The wiring ──────────────────────────────────────────────────────────────

console.log("");

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const FNS = read("src/lib/team.functions.ts");
check("the roster takes a range", /rangeStart: z\.string\(\)\.nullable\(\)\.optional\(\)/.test(FNS), true);
// Own production comes from the shared source now rather than a loop here, so
// the roster and the leaderboard cannot answer "how much did they write"
// differently. A hand-rolled sum returning is the regression to catch.
check("own production is summed by the shared source",
  /const ownTally = tallyByAgent\(/.test(FNS), true);
check("…windowed by the shared rule",
  /inWindow\(p, data\.rangeStart \?\? null, data\.rangeEnd \?\? null\)/.test(FNS), true);
check("…and not summed by hand here",
  /held\.premium \+= Number\(p\.annual_premium/.test(FNS), false);
check("the team rollup reuses the pure model", /rollUpDownline\(/.test(FNS), true);
check("at risk reads live retention cases only",
  /\.in\("status", \["open", "working"\]\)/.test(FNS), true);
check("the downline RPC was left alone",
  /getTeamDownline[\s\S]{0,400}z\.object\(\{ fullCompany: z\.boolean\(\)\.optional\(\) \}\)/.test(FNS), true);

const UI = read("src/routes/_authenticated/team.tsx");
check("the range is part of the cache key",
  /queryKey: \["team", "roster", start \?\? "all", end \?\? "open"\]/.test(UI), true);
check("…and is sent to the server", /rangeStart: start, rangeEnd: end/.test(UI), true);
check("the table offers every range", /RANGE_LABELS\[k\]/.test(UI), true);
check("own and team are separate columns",
  /Production \(own\)/.test(UI) && /Production \(team\)/.test(UI), true);
check("the at-risk column is labelled per month, not as debt",
  /\/mo/.test(UI) && !/>Debt</.test(strip(UI)), true);
check("every column sorts", /<SortHead k="atrisk"/.test(UI) && /<SortHead k="team"/.test(UI), true);
check("the produced-in quick filter exists", /Produced in \{RANGE_LABELS\[rangeKey\]/.test(UI), true);
check("positions can be filtered", /All positions/.test(UI), true);

// The spec's one deliberate departure from the pattern it copies.
check("the org view is a list, not a canvas",
  /function OrgList/.test(UI) && !/function OrgChart/.test(UI), true);
check("…with no zoom or pan left behind",
  /ZoomIn|ZoomOut|setZoom/.test(strip(UI)), false);
check("the tree walk is cycle-guarded", /placed\.has\(a\.id\)/.test(UI), true);
check("the org list shows position and policies",
  /<PositionPill name=\{node\.position_name\}/.test(UI) && /polic\{node\.policies_count === 1/.test(UI), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
