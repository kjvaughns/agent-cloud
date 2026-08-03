import { createFileRoute, redirect } from "@tanstack/react-router";

// The staff queue is the inbox. It was called both things in different places
// long enough that people type both.
export const Route = createFileRoute("/_authenticated/contracting-ops/inbox")({
  beforeLoad: () => { throw redirect({ to: "/contracting-ops/queue" }); },
});
