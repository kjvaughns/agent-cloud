import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Your level is a column on a contract, not a page of its own — the Contracts
 * tab already lists it beside the carrier it applies to.
 */
export const Route = createFileRoute("/_authenticated/contracting/commission-levels")({
  beforeLoad: () => {
    throw redirect({ to: "/contracting" });
  },
});
