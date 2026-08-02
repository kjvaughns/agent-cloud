import { createFileRoute, redirect } from "@tanstack/react-router";

// "What people use" is gone.
export const Route = createFileRoute("/_authenticated/agency/usage")({
  beforeLoad: () => { throw redirect({ to: "/settings/agency" }); },
});
