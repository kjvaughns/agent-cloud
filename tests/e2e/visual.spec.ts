/**
 * Visual regression on the pages a change is most likely to break.
 *
 * ── Why the baselines are not in this commit ────────────────────────────────
 *
 * A screenshot baseline can only be generated against a running application
 * with real data in it. Committing baselines produced from an empty database,
 * or worse from a machine that never ran the app, gives a suite that fails on
 * everybody's first run for reasons that have nothing to do with their change —
 * and a suite that fails for unrelated reasons gets `--update-snapshots` run on
 * it reflexively, which is the same as not having one.
 *
 * So: no baselines here. The first run against a seeded environment writes
 * them, somebody looks at what was written, and *that* commit is the baseline.
 * See tests/README.md.
 *
 * ── Masked regions ─────────────────────────────────────────────────────────
 *
 * Anything that changes on its own — clocks, relative timestamps, counters
 * fed by live data — is masked. Without that the baselines rot within a day
 * and every PR shows a diff caused by the passage of time rather than by code.
 */

import { test, expect, signIn, expectRendered, type Role } from "./fixtures";

const PAGES: { name: string; path: string; role: Role }[] = [
  { name: "dashboard", path: "/dashboard", role: "agent" },
  { name: "clients", path: "/clients", role: "agent" },
  { name: "book-of-business", path: "/book-of-business", role: "agent" },
  { name: "finances", path: "/finances", role: "agent" },
  { name: "retention", path: "/retention", role: "manager" },
  { name: "contracting-ops", path: "/contracting-ops", role: "staff" },
  { name: "settings-nova-pro", path: "/settings/nova-pro", role: "agent" },
];

for (const { name, path, role } of PAGES) {
  test(`visual: ${name}`, async ({ page }) => {
    await signIn(page, role);
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await expectRendered(page, path);

    // Animations settle, then stop. Without this the same page produces a
    // different image on every run and the baseline is meaningless.
    await page.addStyleTag({
      content: `*, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }`,
    });

    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      // Anti-aliasing differs between machines; a hard zero would fail on a
      // different GPU without anything having changed.
      maxDiffPixelRatio: 0.02,
      mask: [
        page.locator("time"),
        page.locator("[data-live]"),
        page.getByText(/\d+ (second|minute|hour|day)s? ago/),
      ],
    });
  });
}
