import { createFileRoute, redirect } from "@tanstack/react-router";

// Spec route: /admin/billing — same content as the platform subscriptions view.
export const Route = createFileRoute("/admin/billing")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/subscriptions" });
  },
});
