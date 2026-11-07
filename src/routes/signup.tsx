import { createFileRoute, redirect } from "@tanstack/react-router";

// Signup now happens in the "Build your agency" experience at /start.
export const Route = createFileRoute("/signup")({
  validateSearch: (s: Record<string, unknown>): { plan?: "solo" | "agency" } => ({
    plan: s.plan === "agency" || s.plan === "solo" ? s.plan : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/start", search });
  },
  head: () => ({
    meta: [
      { title: "Get started — Agent Cloud" },
      { name: "description", content: "Build your agency on Agent Cloud." },
      { property: "og:title", content: "Get started — Agent Cloud" },
      { property: "og:description", content: "Build your agency on Agent Cloud." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
