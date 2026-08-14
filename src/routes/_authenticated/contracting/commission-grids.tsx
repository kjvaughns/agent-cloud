import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * One workspace for contracting, not two pages that both show comp grids.
 *
 * Contracts already renders this exact component as a tab, so the standalone
 * page was the same content at a second URL — and it carried a "Manage grids"
 * toggle into an editor that Settings ▸ Comp Grids owns, making three doors
 * onto two things. The path stays alive because it is bookmarked and linked
 * from the tour; it lands on the tab.
 *
 * The same shape as `/contracting/comp-grids-manage`, which has redirected to
 * the settings editor since the setup pages were consolidated.
 */
export const Route = createFileRoute("/_authenticated/contracting/commission-grids")({
  beforeLoad: () => {
    throw redirect({ to: "/contracting", search: { tab: "comp-grids" } });
  },
});
