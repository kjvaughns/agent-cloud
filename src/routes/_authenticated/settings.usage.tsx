import { createFileRoute, redirect } from "@tanstack/react-router";

// "What people use" is gone. Settings is the nearest thing left.
export const Route = createFileRoute("/_authenticated/settings/usage")({
  beforeLoad: () => { throw redirect({ to: "/settings/agency" }); },
});
