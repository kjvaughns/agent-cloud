import { createFileRoute, redirect } from "@tanstack/react-router";

// Getting agents ready is a tab of Team management, beside the roster it is
// about, rather than a second roster inside contracting.
export const Route = createFileRoute("/_authenticated/contracting-ops/onboarding")({
  beforeLoad: () => { throw redirect({ to: "/team", search: { tab: "onboarding" } as any }); },
});
