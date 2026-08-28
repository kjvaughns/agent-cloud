import type { QueryClient } from "@tanstack/react-query";

/**
 * Everything that changes when a policy changes.
 *
 * A policy is read by half the app — the pipeline drawer, the book, the
 * dashboard tiles, the leaderboard, finances, reports, the clients overview.
 * Each screen used to remember its own list of neighbours to refresh, so a
 * policy number edited in one place stayed stale in another until a reload.
 *
 * One list, called from every policy write, so a new editing surface cannot
 * quietly forget a page.
 */
const POLICY_VIEW_KEYS: readonly unknown[][] = [
  ["pipeline"],
  ["bob"],
  ["dashboard-metrics"],
  ["leaderboard"],
  ["finances"],
  ["reports"],
  ["clients-overview"],
  ["retention"],
  ["timeline"],
  ["search"],
];

export function invalidatePolicyViews(qc: QueryClient) {
  for (const queryKey of POLICY_VIEW_KEYS) qc.invalidateQueries({ queryKey });
}
