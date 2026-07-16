import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

// Nova now lives at /ai-assistant (Assistant / Automations / Activity tabs).
// This layout only exists so old /nova/* links keep working.
export const Route = createFileRoute("/_authenticated/nova")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/nova" || location.pathname === "/nova/") {
      throw redirect({ to: "/ai-assistant" });
    }
  },
  component: Outlet,
});
