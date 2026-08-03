import { createFileRoute, redirect } from "@tanstack/react-router";

// The singular of a page that already exists. Somebody looking for "the
// hierarchy" types this; there is no reason for it to be a dead end.
export const Route = createFileRoute("/_authenticated/contracting-ops/hierarchy")({
  beforeLoad: () => { throw redirect({ to: "/contracting-ops/requests", search: { tab: "hierarchies" } as any }); },
});
