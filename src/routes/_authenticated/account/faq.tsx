import { createFileRoute, redirect } from "@tanstack/react-router";

// The FAQ is now a tab on the Help page — "where do I find an answer" should
// have one answer. This route stays so old links and bookmarks still land
// somewhere sensible.
export const Route = createFileRoute("/_authenticated/account/faq")({
  beforeLoad: () => {
    throw redirect({ to: "/account/help", search: { tab: "faq" } });
  },
});
