import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Grids are the third tab of Carrier Setup.
 *
 * Levels and grids answer the same question — what does this carrier pay —
 * and having them as two sidebar entries meant guessing which one held the
 * number you wanted. This route stays so existing links still land right;
 * it used to hop through /contracting-ops/compensation, itself a redirect.
 */
export const Route = createFileRoute("/_authenticated/contracting-ops/comp-grids")({
  beforeLoad: () => {
    throw redirect({ to: "/contracting-ops/carriers", search: { tab: "grids" } as any });
  },
});
