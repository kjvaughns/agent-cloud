import { createFileRoute, redirect } from "@tanstack/react-router";

// Editing the handbook moved to where you read it.
export const Route = createFileRoute("/_authenticated/settings/resources")({
  beforeLoad: () => { throw redirect({ to: "/resources/edit" }); },
});
