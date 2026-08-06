/**
 * Every nav item, for every role, actually renders.
 *
 * This is the cheap test that would have caught the most embarrassing bug in
 * the audit that started this work: six `/contracting-ops/*` routes that a
 * staff member could reach and that rendered nothing. Nobody had ever clicked
 * every item in every sidebar as every role, because doing it by hand is forty
 * minutes and doing it four times is an afternoon.
 *
 * The nav is derived from `navigation.ts` rather than hardcoded here, so a page
 * added to the sidebar is walked automatically. A list maintained by hand would
 * drift within a fortnight and then quietly cover less than it claims.
 */

import { test, expect, signIn, expectRendered, collectConsoleErrors, type Role } from "./fixtures";
import { navFor, hubGroupsFor, isHub, type NavContext } from "../../src/lib/navigation";

/**
 * A plausible context per role.
 *
 * These mirror the personas in `scripts/nav-snapshot.ts`, which already exists
 * for exactly this reason — so a navigation change can be diffed. Keeping the
 * two aligned means the snapshot and the walk disagree loudly if either drifts.
 */
const CONTEXTS: Record<Role, NavContext> = {
  owner: {
    audience: "core", inAgency: true, canSeeAgency: true, downlineCount: 12,
    isPending: false, canWorkTickets: true, canEditResources: true,
    perms: { staff_is_admin: true },
  },
  manager: {
    audience: "core", inAgency: true, canSeeAgency: false, downlineCount: 4,
    isPending: false, canWorkTickets: false, canEditResources: false, perms: {},
  },
  agent: {
    audience: "core", inAgency: true, canSeeAgency: false, downlineCount: 0,
    isPending: false, canWorkTickets: false, canEditResources: false, perms: {},
  },
  staff: {
    audience: "staff", inAgency: true, canSeeAgency: false, downlineCount: 0,
    isPending: false, canWorkTickets: true, canEditResources: false,
    perms: {
      staff_is_admin: true, staff_view_contracts: true, staff_view_clients: true,
      staff_view_policies: true, staff_post_policies: true,
    },
  },
};

/** Every internal path this role's sidebar offers, hub children included. */
function pathsFor(role: Role): string[] {
  const ctx = CONTEXTS[role];
  const paths = new Set<string>();

  for (const group of navFor(ctx)) {
    for (const item of group.items) {
      // External links (the quoter) are somebody else's uptime.
      if (item.path.startsWith("http")) continue;
      paths.add(item.path);

      if (isHub(item.id)) {
        for (const sub of hubGroupsFor(item.id, ctx)) {
          for (const child of sub.items) {
            if (!child.path.startsWith("http")) paths.add(child.path);
          }
        }
      }
    }
  }
  return [...paths].sort();
}

for (const role of ["owner", "manager", "staff", "agent"] as Role[]) {
  test.describe(`${role} — every nav item renders`, () => {
    const paths = pathsFor(role);

    test(`${role} has a sidebar worth walking`, async () => {
      // A role whose nav resolved to nothing means the context above drifted
      // from navigation.ts, and every "pass" below would be vacuous.
      expect(paths.length, `${role} has no nav items — the test context is stale`).toBeGreaterThan(3);
    });

    for (const path of paths) {
      test(`${role}: ${path}`, async ({ page }) => {
        const errors = collectConsoleErrors(page);

        await signIn(page, role);
        // `domcontentloaded`, never `networkidle`. Animated pages never go idle
        // and time out, and a timeout that reads as a pass is how this
        // repository's mobile check reported two broken routes as green.
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("load");

        await expectRendered(page, path);

        expect(errors, `${path} threw in the console: ${errors.join(" | ")}`).toHaveLength(0);
      });
    }
  });
}
