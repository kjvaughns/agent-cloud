import { createFileRoute, redirect } from "@tanstack/react-router";

// Comp levels are a tab of Carriers — what a carrier pays lives with the
// carrier. `/contracting/commission-levels` is a different page: an agent
// asking for a level, rather than the agency defining one.
export const Route = createFileRoute("/_authenticated/contracting-ops/commission-levels")({
  beforeLoad: () => { throw redirect({ to: "/contracting-ops/carriers", search: { tab: "levels" } as any }); },
});
