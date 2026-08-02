import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Compensation folded into Carriers.
 *
 * Levels and grids describe what a carrier pays, and they were a separate
 * destination from where you set the carrier up — so adding a carrier and
 * telling the app what it pays were two pages, and the name "Compensation"
 * did not say which held what. Same job, one page.
 */
export const Route = createFileRoute("/_authenticated/contracting-ops/compensation")({
  beforeLoad: ({ search }) => {
    const tab = (search as any)?.tab === "grids" ? "grids" : "levels";
    throw redirect({ to: "/contracting-ops/carriers", search: { tab } as any });
  },
  validateSearch: (s: Record<string, unknown>): { tab?: string } =>
    typeof s.tab === "string" ? { tab: s.tab } : {},
});
