import { createFileRoute, redirect } from "@tanstack/react-router";

// Nova activity moved to /ai-assistant → Activity tab.
export const Route = createFileRoute("/_authenticated/nova/activity")({
  beforeLoad: () => {
    throw redirect({ to: "/ai-assistant" });
  },
});
