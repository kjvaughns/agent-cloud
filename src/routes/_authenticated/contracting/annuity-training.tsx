import { createFileRoute, redirect } from "@tanstack/react-router";

// Removed from the platform nav (agency-specific content). Old links land on Contracts.
export const Route = createFileRoute("/_authenticated/contracting/annuity-training")({
  beforeLoad: () => {
    throw redirect({ to: "/contracting" });
  },
});
