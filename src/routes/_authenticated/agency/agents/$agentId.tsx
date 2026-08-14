import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The owner's view of one agent moved to /team/agent/$agentId.
 *
 * This page showed readiness and contracting for an agent one nav branch away
 * from the roster that lists them, while the new page shows the same two plus
 * their production, their book and their downline. Two owner-facing pages
 * about one person is the duplication the Agency rebuild removes.
 *
 * The `?tab=` those readiness CTAs carried is dropped rather than mapped: the
 * new page is one scroll, not tabs, so there is nothing to select.
 */
export const Route = createFileRoute("/_authenticated/agency/agents/$agentId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/team/agent/$agentId", params: { agentId: params.agentId } });
  },
});
