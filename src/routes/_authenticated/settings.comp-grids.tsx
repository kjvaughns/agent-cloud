import { createFileRoute, redirect } from "@tanstack/react-router";

// Comp Grids is no longer a page of its own: what a carrier pays is part of
// setting that carrier up, so it renders under Agency settings ▸ Carriers.
export const Route = createFileRoute("/_authenticated/settings/comp-grids")({
  beforeLoad: () => { throw redirect({ to: "/settings/agency", search: { tab: "carriers" } as any }); },
});
