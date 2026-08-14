import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Compensation lives under Settings now — levels and grids are agency
 * configuration. The grids tab maps to Comp Grids, everything else to
 * Levels & Positions.
 */
export const Route = createFileRoute("/_authenticated/contracting-ops/compensation")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: (search as any)?.tab === "grids" ? "/settings/comp-grids" : "/settings/levels" });
  },
  validateSearch: (s: Record<string, unknown>): { tab?: string } =>
    typeof s.tab === "string" ? { tab: s.tab } : {},
});
