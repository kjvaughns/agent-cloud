import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /signup no longer gates on an invitation.
 *
 * The page used to tell visitors "Invitation Required", but every CTA on the
 * marketing site points here before someone has an account — a dead end at
 * the exact moment the visitor said yes. Accounts without an invitation can
 * still be created at /signup/agent (solo), so the screen's job now is to
 * route that first visit into the demo booking flow instead.
 *
 * The redirect carries the current query string, so UTM attribution captured
 * on a /signup link survives into the demo form.
 */
export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Book a demo — Agent Cloud" }] }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/demo", search });
  },
});
