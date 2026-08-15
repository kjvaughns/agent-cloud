import { createFileRoute, redirect } from "@tanstack/react-router";

// Carriers is a tab of Agency settings now — the carrier directory and the comp
// grids that pay it sit on one screen, because setting one up without the other
// is how a carrier ends up active and unable to price a deal. Path kept: it is
// bookmarked and named by the setup checklist.
export const Route = createFileRoute("/_authenticated/settings/carriers")({
  beforeLoad: () => { throw redirect({ to: "/settings/agency", search: { tab: "carriers" } as any }); },
});
