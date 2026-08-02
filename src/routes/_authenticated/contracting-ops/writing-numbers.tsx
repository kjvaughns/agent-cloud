import { createFileRoute, redirect } from "@tanstack/react-router";

// A writing number is what a contract came back with, so it lives with the
// contracts rather than in a row of its own.
export const Route = createFileRoute("/_authenticated/contracting-ops/writing-numbers")({
  beforeLoad: () => { throw redirect({ to: "/contracting-ops/requests", search: { tab: "numbers" } as any }); },
});
