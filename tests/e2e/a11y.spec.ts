/**
 * Accessibility, on the pages people actually spend their day in.
 *
 * Ten pages rather than all sixty. axe-core on every route produces a number so
 * large that nobody reads it, and the pages an agent opens forty times a day
 * are where a missing label costs somebody their afternoon.
 *
 * Scoped to serious violations only — `critical` and `serious`. `moderate` and
 * `minor` on a codebase that has never run axe would be thousands of findings
 * on day one, the suite would be red permanently, and a permanently red suite
 * is one nobody looks at. Tighten the threshold once these pass.
 */

import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn, expectRendered, type Role } from "./fixtures";

/** Where the day is spent, per the role that spends it there. */
const PAGES: { path: string; role: Role }[] = [
  { path: "/dashboard", role: "agent" },
  { path: "/clients", role: "agent" },
  { path: "/pipeline", role: "agent" },
  { path: "/book-of-business", role: "agent" },
  { path: "/post-deal", role: "agent" },
  { path: "/tasks", role: "agent" },
  { path: "/finances", role: "agent" },
  { path: "/retention", role: "manager" },
  { path: "/contracting-ops", role: "staff" },
  { path: "/contracting-ops/queue", role: "staff" },
];

for (const { path, role } of PAGES) {
  test(`a11y: ${path} (as ${role})`, async ({ page }) => {
    await signIn(page, role);
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await expectRendered(page, path);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");

    // The message carries the selector, because "3 violations" sends somebody
    // back to run it themselves and a node path does not.
    const detail = serious
      .map((v) => `${v.id} (${v.impact}) — ${v.help}\n      ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n      ")}`)
      .join("\n    ");

    expect(serious, `${path} has serious accessibility violations:\n    ${detail}`).toHaveLength(0);
  });
}
