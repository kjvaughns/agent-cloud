import { createFileRoute, redirect } from "@tanstack/react-router";

// Hierarchies live with contract requests now — where a request routes is
// part of the request, not a separate destination.
export const Route = createFileRoute("/_authenticated/contracting-ops/hierarchy-changes")({
  beforeLoad: () => { throw redirect({ to: "/contracting-ops/requests", search: { tab: "changes" } as any }); },
});
