import { createFileRoute, redirect } from "@tanstack/react-router";

// Document Intake is Import now — the same reading, plus somewhere for what it
// reads to go. It also stopped being an agency-admin page: bringing your own
// book across is the first thing a new agent wants to do. The old path stays
// for bookmarks.
export const Route = createFileRoute("/_authenticated/intake")({
  beforeLoad: () => { throw redirect({ to: "/import" }); },
});
