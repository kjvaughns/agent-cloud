/**
 * Own-versus-team production, per agent, over a chosen range.
 *
 * The single best idea in the roster: an owner scanning the list sees at once
 * who writes business personally and who has built a team that writes it.
 *
 * Two decisions worth stating, because both look like they could have gone the
 * other way:
 *
 * **The formula is the one already in use.** `get_dashboard_metrics` sums
 * `annual_premium` over `posted_at`, with no status filter — every policy
 * counts, whatever became of it. That is what production means everywhere else
 * in this product, so it is what it means here. (A superseded 2026-06-05
 * version of that function used `COALESCE(effective_date, posted_at)`; the
 * live one dropped it. Reintroducing a business date here would invent a
 * second answer to "how much did they write", which is the thing to avoid.)
 *
 * **The team rollup needs no recursive SQL.** The roster already holds the
 * caller's whole downline, each row carrying its `upline_id`. An agent's team
 * is therefore their subtree of a set that is already in memory, and summing
 * it is one post-order walk. Adding a recursive CTE for this would have meant
 * a third unbounded downline walk in a codebase that has been steadily
 * replacing them with the depth-capped, cycle-guarded kind.
 */

export type Tally = { premium: number; policies: number };

export const ZERO: Tally = { premium: 0, policies: 0 };

export type RangeKey = "all" | "week" | "month" | "quarter" | "custom";

export const RANGE_LABELS: Record<RangeKey, string> = {
  all: "All",
  week: "Last Week",
  month: "Last Month",
  quarter: "Last 3 Months",
  custom: "Custom",
};

/**
 * Range bounds as ISO strings, or nulls for "all".
 *
 * Rolling windows rather than calendar periods: "Last Week" on a Tuesday means
 * the last seven days, not the fortnight-ago Monday that a calendar week would
 * give. A roster is read to answer "who has gone quiet", and a calendar week
 * answers that differently depending on which day you ask.
 */
export function rangeBounds(key: RangeKey, now: number, custom?: { from?: string; to?: string }):
  { start: string | null; end: string | null } {
  if (key === "all") return { start: null, end: null };
  if (key === "custom") {
    return { start: custom?.from || null, end: custom?.to || null };
  }
  const days = key === "week" ? 7 : key === "month" ? 30 : 90;
  return { start: new Date(now - days * 86_400_000).toISOString(), end: null };
}

/** Is this policy inside the window? A null bound is open on that side. */
export function inRange(postedAt: string | null | undefined, start: string | null, end: string | null): boolean {
  if (!postedAt) return false;
  if (start && postedAt < start) return false;
  if (end && postedAt > end) return false;
  return true;
}

/**
 * Sum each agent's downline, excluding themselves.
 *
 * Excluding self matches `get_dashboard_metrics`, whose `team_prod` is
 * downline-only — the two numbers are meant to be read side by side, and a
 * team total that quietly included the agent's own writing would make a strong
 * personal producer look like a strong builder.
 *
 * Depth-capped and cycle-guarded. `upline_id` is not constrained to be
 * acyclic, and a cycle here would hang the render rather than fail a query.
 */
export function rollUpDownline(
  rows: { id: string; upline_id: string | null }[],
  own: Map<string, Tally>,
  maxDepth = 50,
): Map<string, Tally> {
  const children = new Map<string, string[]>();
  const present = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    // An upline outside the loaded set is a root as far as this roster is
    // concerned — otherwise agents would hang off a parent nobody can see.
    if (!r.upline_id || !present.has(r.upline_id)) continue;
    const list = children.get(r.upline_id);
    if (list) list.push(r.id);
    else children.set(r.upline_id, [r.id]);
  }

  const team = new Map<string, Tally>();
  const visiting = new Set<string>();

  /** Returns this agent's subtree total INCLUDING themselves. */
  function walk(id: string, depth: number): Tally {
    if (depth > maxDepth || visiting.has(id)) return ZERO;
    visiting.add(id);
    const mine = own.get(id) ?? ZERO;
    let premium = 0;
    let policies = 0;
    for (const child of children.get(id) ?? []) {
      const sub = walk(child, depth + 1);
      premium += sub.premium;
      policies += sub.policies;
    }
    // What we store is the downline only; what we return includes self, so the
    // parent's sum counts this agent's own writing too.
    team.set(id, { premium, policies });
    visiting.delete(id);
    return { premium: premium + mine.premium, policies: policies + mine.policies };
  }

  for (const r of rows) if (!team.has(r.id)) walk(r.id, 0);
  return team;
}

/**
 * The quick filter the roster exists for: forty agents, three producing.
 * Own OR team production counts — a manager whose downline wrote business
 * has not gone quiet, whatever their personal column says.
 */
export function producedInRange(own: Tally | undefined, team: Tally | undefined): boolean {
  return (own?.policies ?? 0) > 0 || (team?.policies ?? 0) > 0;
}
