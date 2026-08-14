import { createFileRoute, redirect } from "@tanstack/react-router";

// The comp-grid editor lives at Settings ▸ Comp Grids (the component itself
// is @/components/contracting/manage-grids). Redirect rather than
// delete: this path is bookmarked and referenced by the setup checklist.
export const Route = createFileRoute("/_authenticated/contracting/comp-grids-manage")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/comp-grids" });
  },
});
