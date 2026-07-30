import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Grids are now a tab on Compensation.
 *
 * Levels and grids answer the same question — what does this carrier pay —
 * and having them as two sidebar entries meant guessing which one held the
 * number you wanted. This route stays so existing links still land right.
 */
export const Route = createFileRoute("/_authenticated/contracting-ops/comp-grids")({
  beforeLoad: () => {
    throw redirect({ to: "/contracting-ops/compensation", search: { tab: "grids" } });
  },
});
