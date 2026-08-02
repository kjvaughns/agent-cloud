import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * A writing number is a column on a contract, not a page of its own — the
 * Contracts tab already lists it beside the carrier that issued it.
 */
export const Route = createFileRoute("/_authenticated/contracting/writing-numbers")({
  beforeLoad: () => {
    throw redirect({ to: "/contracting" });
  },
});
