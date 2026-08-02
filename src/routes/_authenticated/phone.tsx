import { createFileRoute, redirect } from "@tanstack/react-router";

// Phone was removed.
export const Route = createFileRoute("/_authenticated/phone")({
  beforeLoad: () => { throw redirect({ to: "/dashboard" }); },
});
