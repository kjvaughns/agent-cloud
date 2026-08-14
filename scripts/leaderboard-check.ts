/**
 * A leaderboard compares like with like, and has you on it.
 *
 *   npx tsx scripts/leaderboard-check.ts
 *
 * Two defects, both of which a person would act on.
 *
 * **The week arrow was wrong six days out of seven.** Three of the four
 * periods compared carefully: month-to-date against the prior month to the
 * same day and hour, YTD against the prior year to the same date. "This Week"
 * compared Sunday-to-now — two days, on a Tuesday — against a *complete*
 * prior week. Every agent's trend pointed down, including agents having their
 * best week of the year.
 *
 * **You were not on your own board.** The rankings are built from policy rows,
 * so an agent who wrote nothing in the period was not last — they were absent.
 * No row, no rank, and the sticky "your position" footer, whose entire job is
 * to always show where you stand, rendered nothing at all. Exactly backwards
 * for the person it matters most to: somebody having a slow month.
 *
 * `now` is a parameter to `periodRanges` precisely so the week case can be
 * checked on a Tuesday without waiting for one.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  periodRanges,
  rankBoard,
  boardTotals,
  trendOf,
  PERIODS,
  BOARD_SCOPES,
} from "../src/lib/leaderboard/board";

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

const hours = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 3_600_000);

// ── Like for like ───────────────────────────────────────────────────────────

// Tuesday 12 August 2026, 14:00 local. Two days into the week.
const TUESDAY = new Date(2026, 7, 11, 14, 0, 0);

const week = periodRanges("week", TUESDAY);
// The bug: prevEnd used to be `start`, giving a full seven days against
// however much of this week had happened.
check("the week compares the same number of hours",
  hours(week.start, week.end), hours(week.prevStart, week.prevEnd));
check("…which on a Tuesday is not a whole week",
  hours(week.prevStart, week.prevEnd) < 24 * 7, true);
check("…and the prior window starts exactly a week earlier",
  hours(week.prevStart, week.start), 24 * 7);

const month = periodRanges("month", TUESDAY);
check("the month compares to the same point last month",
  hours(month.start, month.end), hours(month.prevStart, month.prevEnd));
check("…starting on the first of each", [month.start.getDate(), month.prevStart.getDate()], [1, 1]);

// Both windows are whole months, so there is nothing to truncate.
const lastMonth = periodRanges("last_month", TUESDAY);
check("last month compares two complete months",
  lastMonth.end.getTime() - lastMonth.start.getTime() > 0 &&
    lastMonth.prevEnd.getTime() === lastMonth.start.getTime(),
  true);

const ytd = periodRanges("ytd", TUESDAY);
check("YTD starts on 1 January", [ytd.start.getMonth(), ytd.start.getDate()], [0, 1]);
check("…and compares to the same date a year earlier",
  [ytd.prevEnd.getMonth(), ytd.prevEnd.getDate()], [TUESDAY.getMonth(), TUESDAY.getDate()]);

// A Sunday is the one day the old code was accidentally right; it must still be.
const SUNDAY = new Date(2026, 7, 9, 0, 30, 0);
const sundayWeek = periodRanges("week", SUNDAY);
check("on a Sunday the week has only just started",
  hours(sundayWeek.start, sundayWeek.end) <= 1, true);
check("…and the comparison is still the same length",
  hours(sundayWeek.start, sundayWeek.end),
  hours(sundayWeek.prevStart, sundayWeek.prevEnd));

check("every period offered has a range",
  PERIODS.every((p) => Boolean(periodRanges(p.value, TUESDAY))), true);
// The brief names six.
check("the six periods the brief asks for are all offered",
  PERIODS.map((p) => p.value),
  ["today", "week", "month", "last_month", "ytd", "custom"]);

const today = periodRanges("today", TUESDAY);
check("today starts at midnight", [today.start.getHours(), today.start.getDate()],
  [0, TUESDAY.getDate()]);
// Yesterday to the same time of day, so a comparison at 2pm is against
// yesterday's 2pm rather than the whole of yesterday.
check("…and compares against the same slice of yesterday",
  hours(today.start, today.end), hours(today.prevStart, today.prevEnd));
check("…which began exactly a day earlier", hours(today.prevStart, today.start), 24);

const range = periodRanges("custom", TUESDAY, { from: "2026-06-01", to: "2026-06-30" });
check("a custom range is what was picked",
  [range.start.toISOString().slice(0, 10), range.end.toISOString().slice(0, 10)],
  ["2026-06-01", "2026-06-30"]);
check("…and its comparison is the same length, ending where it starts",
  [
    range.end.getTime() - range.start.getTime(),
    range.prevEnd.getTime() - range.prevStart.getTime(),
  ][0] === range.prevEnd.getTime() - range.prevStart.getTime() &&
    range.prevEnd.getTime() === range.start.getTime(),
  true);

check("the four views the brief asks for are all offered",
  BOARD_SCOPES.map((s) => s.value), ["mine", "team", "agency", "imo"]);

// ── You are on the board ────────────────────────────────────────────────────

console.log("");

const AGENTS = [
  { id: "a", name: "Ada", premium: 5000, policies: 4, placed: 4000 },
  { id: "b", name: "Bo", premium: 3000, policies: 2, placed: 3000 },
  { id: "c", name: "Cy", premium: 3000, policies: 3, placed: 1500 },
];

// The defect: an agent who wrote nothing never appeared in the rows the query
// returned, so their own board did not list them.
const withMe = rankBoard(AGENTS, { selfId: "z", selfName: "Zed" });
check("an agent who wrote nothing is on the board", withMe.length, 4);
check("…marked as themselves", withMe.find((r) => r.id === "z")?.isYou, true);
check("…at the bottom, not missing", withMe[withMe.length - 1].id, "z");
check("…with a real name rather than a blank", withMe.find((r) => r.id === "z")?.name, "Zed");

// And is not added twice when they did write something.
const already = rankBoard(AGENTS, { selfId: "a", selfName: "Ada" });
check("somebody already on the board is not duplicated", already.length, 3);
check("…and is still marked", already.find((r) => r.id === "a")?.isYou, true);

// ── Ranks ───────────────────────────────────────────────────────────────────

console.log("");

check("the board is ordered by premium", withMe.map((r) => r.id), ["a", "b", "c", "z"]);
// Competition ranking. Once everybody appears, most of an agency can sit on
// zero in the first week of a month, and telling the twelfth of fourteen
// agents on zero that they are 12th is not true of anything.
check("a tie shares a rank", [withMe[1].rank, withMe[2].rank], [2, 2]);
check("…and the next rank skips", withMe[3].rank, 4);
check("first is first", withMe[0].rank, 1);

const allZero = rankBoard(
  [
    { id: "a", name: "Ada", premium: 0, policies: 0 },
    { id: "b", name: "Bo", premium: 0, policies: 0 },
  ],
  { selfId: "b" },
);
check("a board where nobody has written shares one rank",
  allZero.map((r) => r.rank), [1, 1]);
// Ties sort by name so the order does not change between renders.
check("…in a stable order", allZero.map((r) => r.id), ["a", "b"]);

// ── Totals and trend ────────────────────────────────────────────────────────

console.log("");

const totals = boardTotals(withMe);
check("the totals count what is on the board", [totals.alp, totals.policies], [11000, 9]);
// The brief asks for placed premium beside annual premium.
check("…including placed premium", totals.placed, 8500);
check("somebody added at zero has nothing placed either",
  withMe.find((r) => r.id === "z")?.placed, 0);
// Adding the viewer at zero must not make it look like one more agent produced.
check("…and adding somebody at zero does not inflate 'producing'", totals.producing, 3);
check("average is per policy, not per agent", Math.round(totals.avg), Math.round(11000 / 9));
check("no policies is a zero average, not a division by zero",
  boardTotals([{ id: "x", name: "X", premium: 0, policies: 0 }]).avg, 0);

check("more than before is up", trendOf(100, 50), "up");
check("less is down", trendOf(50, 100), "down");
check("the same is flat", trendOf(50, 50), "flat");
// An agent who was not on the prior board has not held steady, and drawing a
// dash for both loses which is which.
check("no prior figure is not the same as no change", trendOf(50, undefined), "unknown");

// ── The page reads the module ───────────────────────────────────────────────

console.log("");

const PAGE = strip(read("src/routes/_authenticated/leaderboard.tsx"));
check("the page offers the scope switch", /availableScopes/.test(PAGE), true);
// A team view for somebody with nobody under them is a guaranteed empty board.
check("…hiding Team for somebody with no downline",
  /s\.value !== "team" \|\| caps\.downlineCount > 0/.test(PAGE), true);
check("the page shows placed premium", /agent\.placed/.test(PAGE), true);
check("a custom range has two date inputs",
  (PAGE.match(/type="date"/g) ?? []).length, 2);

check("the page takes its periods from the module",
  /from "@\/lib\/leaderboard\/board"/.test(PAGE), true);
// The arithmetic that was wrong must not still be here.
check("…and keeps no copy of the range arithmetic",
  /prevEnd: start/.test(PAGE), false);
// Still passed in; the call now also carries the custom range.
check("the clock is passed in, not read inside",
  /periodRanges\(period, new Date\(\), custom\)/.test(PAGE), true);
check("rows are ranked by the module", /rankBoard\(/.test(PAGE), true);
// Rendering the array index would undo the tie handling.
check("…and the row renders that rank, not its index",
  /rank=\{agent\.rank\}/.test(PAGE), true);
check("…as does the sticky footer", /rank=\{myRow\.rank\}/.test(PAGE), true);
check("the totals come from the module too", /boardTotals\(rows\)/.test(PAGE), true);

const DASH = strip(read("src/lib/dashboard.functions.ts"));
check("the server sends the viewer's own name for the zero case",
  /selfName/.test(DASH), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
