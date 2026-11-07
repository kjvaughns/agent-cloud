import { createFileRoute, redirect } from "@tanstack/react-router";

// Solo signup now lives on the shared /signup page; old links keep working.
export const Route = createFileRoute("/signup_/agent")({
  head: () => ({ meta: [{ title: "Solo Agent Signup — Agent Cloud" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/signup", search: { plan: "solo" } });
  },
});
