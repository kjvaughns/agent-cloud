import { createFileRoute, redirect } from "@tanstack/react-router";

// The contracting pipeline is the request list — every stage of it is a
// request status. Not to be confused with `/pipeline`, which is the sales one.
export const Route = createFileRoute("/_authenticated/contracting-ops/pipeline")({
  beforeLoad: () => { throw redirect({ to: "/contracting-ops/requests" }); },
});
