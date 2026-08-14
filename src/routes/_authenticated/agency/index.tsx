import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Agency overview was four link tiles and a couple of counts.
 *
 * Every tile pointed somewhere better: Team at the roster it summarised,
 * "Getting agents ready" at what is now the first list on that same page,
 * Invite at the invite screen, Ready to sell at the requests queue. A page
 * whose whole job is to point at other pages is a hop, not a destination —
 * and its two useful numbers are in the Team page header.
 *
 * The path stays so bookmarks and old links still land somewhere real.
 */
export const Route = createFileRoute("/_authenticated/agency/")({
  beforeLoad: () => { throw redirect({ to: "/team" }); },
});
