import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Compensation is Agency settings now — levels and grids are configuration.
 * The grids tab lands on Carriers, where what a carrier pays is set up;
 * everything else on Levels & Positions.
 */
export const Route = createFileRoute("/_authenticated/contracting-ops/compensation")({
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/settings/agency",
      search: { tab: (search as any)?.tab === "grids" ? "carriers" : "levels" } as any,
    });
  },

  validateSearch: (s: Record<string, unknown>): { tab?: string } =>
    typeof s.tab === "string" ? { tab: s.tab } : {},
});
