import { createFileRoute, redirect } from "@tanstack/react-router";

// Ready to Sell was a filtered view of the same producers the requests queue
// already shows. Removed rather than kept as a third way to ask one question.
export const Route = createFileRoute("/_authenticated/contracting-ops/ready-to-sell")({
  beforeLoad: () => { throw redirect({ to: "/contracting-ops/requests" }); },
});
