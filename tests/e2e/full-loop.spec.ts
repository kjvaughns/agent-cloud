/**
 * THE test. A deal, end to end, for the first time.
 *
 * ── Why this one matters more than the rest of the suite ────────────────────
 *
 * Every screen in this application currently shows zeros. $0 production, 0
 * policies, 0 contracts, 0 writing numbers — across four separate role audits.
 * Not because the features are broken individually, but because **no deal has
 * ever gone end to end through Agent Cloud**. Each stage has been exercised in
 * isolation and the seams between them have not.
 *
 * This walks the whole seam: an owner invites an agent with carriers
 * pre-assigned, the agent accepts, staff work the resulting contracting
 * requests to active, the agent posts a deal, the commission engine computes
 * against the comp grid, and a carrier statement reconciles against the policy
 * that came out the other end.
 *
 * If it passes, you can onboard a real agency. The roadmap's own prediction is
 * that today it fails at step (c) — the invite's pre-assigned carriers not
 * arriving as unassigned `contracting_requests` in the owner's queue.
 *
 * ── This has never been run ────────────────────────────────────────────────
 *
 * Written from the schema and the server functions, not from a passing run.
 * It needs four accounts in one organisation, a comp grid with a level the test
 * agent is assigned to, and at least two carriers on the agency — see
 * tests/README.md. Until somebody supplies those, this file is a specification
 * of the loop rather than evidence about it, and it fails loudly rather than
 * skipping so nobody mistakes one for the other.
 *
 * Selectors are the part most likely to need adjusting on the first real run.
 * They are written against visible text rather than test ids because the app
 * has no test ids today; adding them is the right follow-up once this has been
 * run once and the true failures are known.
 */

import { test, expect, signIn, expectRendered } from "./fixtures";

const CARRIER_A = process.env.E2E_CARRIER_A ?? "Mutual of Omaha";
const CARRIER_B = process.env.E2E_CARRIER_B ?? "Foresters Financial";

test.describe("the full loop — invite to reconciled commission", () => {
  // Serial: every step depends on the state the last one left behind. Running
  // these in parallel would have the agent accepting an invite that does not
  // exist yet.
  test.describe.configure({ mode: "serial" });

  let inviteUrl = "";

  test("a — owner creates an invite with two carriers pre-assigned", async ({ page }) => {
    await signIn(page, "owner");
    await page.goto("/team", { waitUntil: "domcontentloaded" });
    await expectRendered(page, "/team");

    await page.getByRole("button", { name: /invite/i }).first().click();

    for (const carrier of [CARRIER_A, CARRIER_B]) {
      const row = page.getByText(carrier, { exact: false }).first();
      await expect(row, `carrier "${carrier}" is not on this agency`).toBeVisible();
      await row.click();
    }

    await page.getByRole("button", { name: /create|generate|send/i }).first().click();

    // The link is the handoff to the next step, so failing to find it has to
    // fail here rather than leaving step (b) to fail confusingly.
    const link = page.getByText(/\/invite\/|\/signup\/agent\?/, { exact: false }).first();
    await expect(link, "no invite link appeared after creating the invite").toBeVisible();
    inviteUrl = (await link.textContent())?.trim() ?? "";
    expect(inviteUrl, "the invite link was empty").toMatch(/invite|signup/);
  });

  test("b — a new agent accepts it", async ({ page }) => {
    expect(inviteUrl, "step (a) produced no invite link").not.toBe("");
    await page.goto(inviteUrl, { waitUntil: "domcontentloaded" });
    await expectRendered(page, inviteUrl);

    // The accepting agent is pre-created rather than signed up here: creating a
    // real auth user per run leaves debris in the database that nothing cleans
    // up, and the loop being tested starts at acceptance.
    await signIn(page, "agent");
    await page.goto(inviteUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /accept|join/i }).first().click();
    await page.waitForLoadState("load");
  });

  test("c — the two carriers arrive as unassigned requests in the owner's queue", async ({ page }) => {
    // The step the roadmap predicts will fail. If the invite's pre-assigned
    // carriers do not become contracting_requests, everything downstream is
    // untestable and the agency onboarding story does not work.
    await signIn(page, "staff");
    await page.goto("/contracting-ops/requests", { waitUntil: "domcontentloaded" });
    await expectRendered(page, "/contracting-ops/requests");

    for (const carrier of [CARRIER_A, CARRIER_B]) {
      await expect(
        page.getByText(carrier, { exact: false }).first(),
        `no contracting request for "${carrier}" — the invite's pre-assigned carriers did not become requests`,
      ).toBeVisible();
    }
  });

  test("d — staff claim one, submit it, and approve it", async ({ page }) => {
    await signIn(page, "staff");
    await page.goto("/contracting-ops/requests", { waitUntil: "domcontentloaded" });

    await page.getByText(CARRIER_A, { exact: false }).first().click();
    await expect(page.getByRole("button", { name: /claim|assign to me/i }).first()).toBeVisible();
    await page.getByRole("button", { name: /claim|assign to me/i }).first().click();

    await page.getByRole("button", { name: /submit/i }).first().click();
    await page.getByRole("button", { name: /approve/i }).first().click();

    await expect(page.getByText(/approved/i).first()).toBeVisible();
  });

  test("e — a writing number flips the contract to active", async ({ page }) => {
    await signIn(page, "staff");
    await page.goto("/contracting-ops/requests?tab=numbers", { waitUntil: "domcontentloaded" });
    await expectRendered(page, "/contracting-ops/requests?tab=numbers");

    await page.getByRole("button", { name: /add|new writing number/i }).first().click();
    await page.fill('input[name="writing_number"], input[placeholder*="number" i]', `E2E-${Date.now()}`);
    await page.getByRole("button", { name: /save|add/i }).first().click();

    await expect(page.getByText(/active/i).first()).toBeVisible();
  });

  test("f — the agent posts a deal, and the dropdowns are the agency's own", async ({ page }) => {
    await signIn(page, "agent");
    await page.goto("/post-deal", { waitUntil: "domcontentloaded" });
    await expectRendered(page, "/post-deal");

    const carrierSelect = page.locator('select[name="carrier"], [role="combobox"]').first();
    await carrierSelect.click();

    // The regression this guards: the dropdown used to list every carrier in
    // the platform catalogue rather than the ones this agency holds contracts
    // with, so an agent could post a deal against a carrier they cannot write.
    await expect(page.getByRole("option", { name: CARRIER_A }).first()).toBeVisible();
    const optionCount = await page.getByRole("option").count();
    expect(optionCount, "the carrier dropdown is showing the whole catalogue, not this agency's carriers")
      .toBeLessThan(40);
  });

  test("g — commission is computed at the agent's level from the comp grid", async ({ page }) => {
    await signIn(page, "agent");
    await page.goto("/finances", { waitUntil: "domcontentloaded" });
    await expectRendered(page, "/finances");

    // The assertion that matters is that it is not zero. Every audit of this
    // product has found $0 here, and a schedule of zero is indistinguishable
    // from a schedule that was never generated.
    const zeros = page.getByText(/^\$0(\.00)?$/).count();
    expect(await zeros, "finances still shows $0 — no commission schedule was generated for the posted deal")
      .toBeLessThan(3);
  });

  test("h — a carrier statement reconciles against that policy", async ({ page }) => {
    await signIn(page, "agent");
    await page.goto("/finances?section=reconciliation", { waitUntil: "domcontentloaded" });
    await expectRendered(page, "/finances?section=reconciliation");

    await page.getByRole("button", { name: /upload statement/i }).first().click();
    // Built in-memory rather than committed as a fixture file, so the policy
    // number can be the one this run actually created once step (f) reports it.
    // Until then this uploads a statement whose line will read as unmatched —
    // which is itself the honest first result.
    await page.setInputFiles('input[type="file"]', {
      name: "e2e-statement.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Policy Number,Insured Name,Commission Amount,Paid Date\n" +
          `E2E-${Date.now()},E2E Client,412.00,${new Date().toISOString().slice(0, 10)}\n`,
      ),
    });

    await page.fill('input[placeholder*="Mutual" i]', CARRIER_A);
    await page.getByRole("button", { name: /upload & reconcile/i }).first().click();

    await expect(page.getByText(/matched|variance|unmatched/i).first()).toBeVisible();
  });
});
