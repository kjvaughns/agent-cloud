import { createFileRoute } from "@tanstack/react-router";
import { ManageGridsPage } from "@/routes/_authenticated/contracting.comp-grids-manage";

/**
 * Comp grids, hosted inside Contracting Operations.
 *
 * Commission grids are carrier compensation data — they belong beside the
 * comp levels and writing numbers they describe, not in a separate corner of
 * the sidebar. The page itself is the shipped one, rendered here rather than
 * reimplemented; the old route redirects to this one.
 */
export const Route = createFileRoute("/_authenticated/contracting-ops/comp-grids")({
  component: ManageGridsPage,
  head: () => ({ meta: [{ title: "Comp Grids | Agent Cloud" }] }),
});
