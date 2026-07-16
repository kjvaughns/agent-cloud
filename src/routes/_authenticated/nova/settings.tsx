import { createFileRoute, redirect } from "@tanstack/react-router";

// Nova settings moved to /ai-assistant → Automations tab.
export const Route = createFileRoute("/_authenticated/nova/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/ai-assistant" });
  },
});
