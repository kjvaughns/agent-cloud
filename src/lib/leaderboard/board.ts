/**
 * The two things a leaderboard has to get right, and got wrong.
 *
 * ── 1. A comparison must compare like with like ──
 *
 * Every period on the board shows a trend arrow against the prior period.
 * Three of the four were built carefully: "This Month" compares month-to-date
 * against the prior month up to the same day and hour, and "YTD" compares
 * against the prior year to the same date.
 *
 * "This Week" was not. It compared Sunday-to-now — two days, on a Tuesday —
 * against a *complete* prior week. So on six days out of seven, every agent's
 * arrow pointed down, including agents who were having their best week of the
 * year. An arrow that is wrong most of the time is worse than no arrow: people
 * act on it.
 *
 * The prior window is now truncated to the same elapsed length as the current
 * one, so two days are compared against two days.
 *
 * ── 2. A board you are not on ──
 *
 * The rankings are built from policy rows, so an agent who wrote nothing in
 * the period simply did not exist on the board. Not last — absent. No row, no
 * rank, and the sticky "your position" footer, whose entire job is to always
 * show you where you stand, rendered nothing at all.
 *
 * That is exactly backwards for the person it matters most to. A new agent,
 * or anyone having a slow month, opens the leaderboard to see where they are
 * and the product declines to say. The server already refuses to hide the
 * viewer from themselves in its opt-out filter; this closes the same gap in
 * the query's own shape.
 *
 * ── Ranks, and why ties share one ──
 *
 * Once everybody appears, most of a large agency can sit on zero in the first
 * week of a month. Numbering those sequentially tells the twelfth of fourteen
 * agents on zero that they are 12th, which is not true of anything. Ties share
 * a rank and the next rank skips — standard competition ranking, the way every
 * sports table a person has ever read works.
 */

import { productionWindowEnd, endOfProductionDay } from "@/lib/production/source";

export type BoardAgent = {
  id: string;
  name: string;
  premium: number;
  policies: number;
  /** Of that premium, how much is on the books. */
  placed: number;
};

export type RankedAgent = BoardAgent & {
  rank: number;
  isYou: boolean;
  /** The same agent's premium in the prior window, when they had one. */
  prior: number | undefined;
};

export type Period = "today" | "week" | "month" | "last_month" | "ytd" | "custom";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "ytd", label: "YTD" },
  { value: "custom", label: "Custom" },
];

/**
 * Which agents a board covers.
 *
 * Three, because "how am I doing" and "how is my team doing" and "how is the
 * agency doing" are three different questions and the board answered only the
 * last. `imo` is the fourth, and appears only for an agency that has opted-in
 * children.
 */
export type BoardScope = "mine" | "team" | "agency" | "imo";

export const BOARD_SCOPES: { value: BoardScope; label: string }[] = [
  { value: "mine", label: "Personal" },
  { value: "team", label: "My Team" },
  { value: "agency", label: "My Agency" },
  { value: "imo", label: "Total IMO" },
];

export type Range = { start: Date; end: Date; prevStart: Date; prevEnd: Date };

/**
 * Current and prior windows for a period.
 *
 * `now` is a parameter rather than read from the clock so this can be tested
 * on a Tuesday and a Sunday without waiting for either.
 */
export function periodRanges(p: Period, now: Date, custom?: { from?: string; to?: string }): Range {
  const day = 86_400_000;

  // A production date is a DAY, stamped at midday UTC. Ending a window at the
  // current instant therefore drops everything written today for the first
  // twelve hours of each UTC day — the whole US working morning. Both the
  // live window and the one it is compared against end at the end of a day.
  const throughToday = productionWindowEnd(now);

  if (p === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Yesterday to the same time of day, so a comparison at 9am is against
    // yesterday's 9am rather than the whole of yesterday.
    const prevStart = new Date(start.getTime() - day);
    return {
      start,
      end: throughToday,
      prevStart,
      // Yesterday, whole. This truncated to "the same time of day", which for a
      // day-granular figure means it dropped yesterday's business entirely
      // whenever the reader looked before midday UTC — so today read as up
      // against nothing and every delta was meaningless.
      prevEnd: endOfProductionDay(prevStart),
    };
  }

  if (p === "custom") {
    // Whatever the person picked. The prior window is the same length ending
    // where this one starts, which is the only comparison a custom range can
    // sensibly have.
    const start = custom?.from ? new Date(custom.from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = custom?.to ? endOfProductionDay(new Date(`${custom.to}T12:00:00Z`)) : throughToday;
    const span = Math.max(0, end.getTime() - start.getTime());
    return {
      start,
      end,
      prevStart: new Date(start.getTime() - span),
      prevEnd: start,
    };
  }

  if (p === "week") {
    // Sunday of the current week, local midnight.
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const prevStart = new Date(start.getTime() - 7 * day);
    // The bug this fixes: prevEnd used to be `start`, a full seven days
    // against however much of this week has happened. Truncated to the same
    // elapsed length, two days compare against two days.
    // Truncated to the same number of whole DAYS, ending at the end of that
    // day: two days of this week against two days of last week.
    const elapsedDays = Math.floor((throughToday.getTime() - start.getTime()) / day);
    return {
      start,
      end: throughToday,
      prevStart,
      prevEnd: endOfProductionDay(new Date(prevStart.getTime() + elapsedDays * day)),
    };
  }

  if (p === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    // Same day and hour of the prior month. Date's own rollover clamps the
    // 31st of a month that has 30 days, which is the behaviour we want:
    // comparing against the whole prior month would be the same lie the week
    // case was telling.
    const prevEnd = endOfProductionDay(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, now.getUTCDate())),
    );
    return { start, end: throughToday, prevStart, prevEnd };
  }

  if (p === "last_month") {
    // Both windows are complete months, so no truncation applies.
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start,
      end,
      prevStart: new Date(now.getFullYear(), now.getMonth() - 2, 1),
      prevEnd: start,
    };
  }

  const start = new Date(now.getFullYear(), 0, 1);
  const prevStart = new Date(now.getFullYear() - 1, 0, 1);
  const prevEnd = endOfProductionDay(
    new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate())),
  );
  return { start, end: throughToday, prevStart, prevEnd };
}

/**
 * The board, ranked, with the viewer guaranteed a place on it.
 *
 * `selfName` is used only when the viewer has to be added — the rankings
 * carry names for everyone the query returned, and somebody who wrote nothing
 * was not among them.
 */
export function rankBoard(
  agents: BoardAgent[],
  opts: { selfId: string; selfName?: string; prior?: Map<string, number> },
): RankedAgent[] {
  const { selfId, selfName, prior } = opts;

  const rows = agents.slice();
  // Absent, not last: an agent with no policies in the window never appears in
  // the rows the query returns.
  if (selfId && !rows.some((a) => a.id === selfId)) {
    rows.push({ id: selfId, name: selfName ?? "You", premium: 0, policies: 0, placed: 0 });
  }

  rows.sort((a, b) =>
    b.premium === a.premium ? a.name.localeCompare(b.name) : b.premium - a.premium,
  );

  const out: RankedAgent[] = [];
  let lastPremium: number | null = null;
  let lastRank = 0;
  rows.forEach((a, i) => {
    // Competition ranking: equal premiums share a rank, and the rank after a
    // tie skips by the size of the tie.
    const rank = lastPremium !== null && a.premium === lastPremium ? lastRank : i + 1;
    lastPremium = a.premium;
    lastRank = rank;
    out.push({ ...a, rank, isYou: a.id === selfId, prior: prior?.get(a.id) });
  });
  return out;
}

/** The summary above the table. Counts what is on the board, not what was queried. */
export function boardTotals(rows: BoardAgent[]): {
  alp: number;
  policies: number;
  placed: number;
  producing: number;
  avg: number;
} {
  const alp = rows.reduce((a, r) => a + r.premium, 0);
  const policies = rows.reduce((a, r) => a + r.policies, 0);
  return {
    alp,
    policies,
    placed: rows.reduce((a, r) => a + r.placed, 0),
    // "Producing" means wrote something. Adding the viewer at zero must not
    // inflate this.
    producing: rows.filter((r) => r.premium > 0).length,
    avg: policies > 0 ? alp / policies : 0,
  };
}

export type Trend = "up" | "down" | "flat" | "unknown";

/**
 * Which way an agent moved.
 *
 * "unknown" rather than "flat" when there is no prior figure at all: an agent
 * who did not exist on the prior board has not held steady, and drawing a
 * dash for both loses the difference between "no change" and "no data".
 */
export function trendOf(current: number, prior: number | undefined): Trend {
  if (prior === undefined) return "unknown";
  if (current === prior) return "flat";
  return current > prior ? "up" : "down";
}
