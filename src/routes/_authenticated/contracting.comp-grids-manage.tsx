import { createFileRoute, redirect } from "@tanstack/react-router";

// The comp-grid editor lives in the Grids tab of Carrier Setup (the component
// itself is @/components/contracting/manage-grids). Redirect rather than
// delete: this path is bookmarked and referenced by the setup checklist.
export const Route = createFileRoute("/_authenticated/contracting/comp-grids-manage")({
  beforeLoad: () => {
    throw redirect({ to: "/contracting-ops/carriers", search: { tab: "grids" } as any });
  },
});
