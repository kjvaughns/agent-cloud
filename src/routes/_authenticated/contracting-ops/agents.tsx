import { createFileRoute, redirect } from "@tanstack/react-router";

// There is no roster of agents inside contracting ops, because the roster
// staff actually work from is the licensing table — every agent, with what is
// outstanding against each. From there a row opens the agent.
export const Route = createFileRoute("/_authenticated/contracting-ops/agents")({
  beforeLoad: () => { throw redirect({ to: "/contracting-ops/licensing" }); },
});
