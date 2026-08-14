import { createFileRoute, redirect } from "@tanstack/react-router";

// Comp levels are agency configuration and live under Settings now. `/contracting/commission-levels` is a different page: an agent
// asking for a level, rather than the agency defining one.
export const Route = createFileRoute("/_authenticated/contracting-ops/commission-levels")({
  beforeLoad: () => { throw redirect({ to: "/settings/levels" }); },
});
