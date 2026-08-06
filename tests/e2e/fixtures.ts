/**
 * Shared fixtures, and the one rule the whole suite depends on.
 *
 * ── Missing credentials are a failure, not a skip ───────────────────────────
 *
 * The tempting shape is `test.skip(!process.env.E2E_OWNER_EMAIL)`. It is wrong,
 * and this repository has already paid for the lesson: `mobile-check.mjs` used
 * `waitUntil: "networkidle"`, two animated routes never settled, both timed out
 * — and both were reported as passes. A run that checks nothing and says
 * "green" is worse than no run, because somebody believes it.
 *
 * So `signIn` throws with the name of the variable that is missing. CI that has
 * not been given credentials fails loudly on the first spec, and whoever set it
 * up finds out immediately rather than trusting a suite that walked no pages.
 *
 * `E2E_ALLOW_UNCONFIGURED=1` exists for exactly one case — proving locally that
 * the harness itself parses and launches — and it prints a banner saying the
 * run proves nothing about the application.
 */

import { test as base, expect, type Page } from "@playwright/test";

export type Role = "owner" | "manager" | "staff" | "agent";

/**
 * Credentials, per role.
 *
 * Four accounts rather than one, because the point of the nav walk is that
 * these four people see different things — the staff audit that started this
 * work found a back-office coordinator landing on a producer dashboard, and a
 * single-account suite cannot see that.
 */
export function credentials(role: Role): { email: string; password: string } {
  const key = role.toUpperCase();
  const email = process.env[`E2E_${key}_EMAIL`];
  const password = process.env[`E2E_${key}_PASSWORD`];

  if (!email || !password) {
    throw new Error(
      `Missing E2E_${key}_EMAIL / E2E_${key}_PASSWORD.\n\n` +
        `These tests sign in as a real ${role} against ${process.env.E2E_BASE ?? "http://localhost:3000"}.\n` +
        `Without them there is nothing to test, and skipping would report a pass ` +
        `this run did not earn. See tests/README.md.`,
    );
  }
  return { email, password };
}

/** True when every role has credentials. Used only by the harness self-check. */
export function fullyConfigured(): boolean {
  return (["owner", "manager", "staff", "agent"] as Role[]).every((r) => {
    const key = r.toUpperCase();
    return !!process.env[`E2E_${key}_EMAIL`] && !!process.env[`E2E_${key}_PASSWORD`];
  });
}

/**
 * Sign in, and prove it worked.
 *
 * Asserting that the URL left /login is the load-bearing part: a failed sign-in
 * leaves the form on screen with an error toast, and every later assertion
 * about "the page rendered" would then be describing the login page.
 */
export async function signIn(page: Page, role: Role): Promise<void> {
  const { email, password } = credentials(role);

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  expect(page.url(), `sign-in as ${role} left the browser on the login page`).not.toContain("/login");
}

/**
 * Did this page actually render?
 *
 * Deliberately several separate checks rather than one. "The page rendered" can
 * fail as a 404, as an error boundary, as a blank shell where a query threw, or
 * as the login page after a session expired — and a single assertion that
 * lumps them together tells you a route is broken without telling you how.
 */
export async function expectRendered(page: Page, path: string): Promise<void> {
  const body = page.locator("body");

  await expect(body, `${path} rendered nothing`).not.toBeEmpty();

  for (const phrase of ["Not Found", "404", "Something went wrong", "Unexpected Application Error"]) {
    await expect(
      page.getByText(phrase, { exact: false }).first(),
      `${path} shows "${phrase}"`,
    ).toHaveCount(0);
  }

  expect(page.url(), `${path} bounced to the login page — the session was lost`).not.toContain("/login");
}

/**
 * Console errors worth failing on.
 *
 * Third-party noise is filtered because it is not ours to fix and a suite that
 * fails on somebody else's deprecation warning gets muted. Everything else is
 * collected and asserted by the caller, so a page that renders while throwing
 * is not counted as a pass.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/favicon|third-party cookie|Download the React DevTools|chrome-extension:/i.test(text)) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

export const test = base;
export { expect };
