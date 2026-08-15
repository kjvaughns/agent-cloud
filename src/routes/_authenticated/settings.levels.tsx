import { createFileRoute, redirect } from "@tanstack/react-router";

// The ladder is a tab of Agency settings now, listed before Carriers because
// carrier levels get mapped onto it.
export const Route = createFileRoute("/_authenticated/settings/levels")({
  beforeLoad: () => { throw redirect({ to: "/settings/agency", search: { tab: "levels" } as any }); },
});
