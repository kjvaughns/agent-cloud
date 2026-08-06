/**
 * End-to-end tests.
 *
 *   npm run e2e                 # against a local dev server
 *   E2E_BASE=https://… npm run e2e
 *
 * ── The rule this config exists to enforce ─────────────────────────────────
 *
 * A suite that reports green without having run anything is worse than no
 * suite, because somebody then believes it. That is not hypothetical here:
 * `scripts/mobile-check.mjs` shipped with `waitUntil: "networkidle"`, two
 * animated pages never settled, both timed out, and both were counted as
 * passes until the categories were separated.
 *
 * So: `forbidOnly` in CI, zero retries by default, and no `test.skip()` on a
 * missing environment anywhere in `tests/e2e`. A spec that cannot reach what it
 * needs fails and says why. `tests/e2e/fixtures.ts` is where that is enforced.
 */

import { defineConfig, devices } from "@playwright/test";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const CI = !!process.env.CI;

/**
 * Find a Chromium without depending on a version-stamped path.
 *
 * `PLAYWRIGHT_BROWSERS_PATH` holds directories like `chromium-1194`, and the
 * number changes with every Playwright bump. Lifted from `mobile-check.mjs`,
 * which needed exactly this and found it the hard way.
 *
 * Returns undefined rather than throwing when nothing is found — Playwright's
 * own resolution then runs and produces a clearer error than we would.
 */
function findChromium(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => d.startsWith("chromium")).sort().reverse()) {
    for (const rel of ["chrome-linux/chrome", "chrome-linux/headless_shell"]) {
      const p = join(root, dir, rel);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

export default defineConfig({
  testDir: "./tests/e2e",
  // Long enough for a cold serverless function, short enough that a hung page
  // fails the run rather than stalling CI until the job timeout.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  fullyParallel: true,
  forbidOnly: CI,
  // No retries. A test that passes on the second attempt is a test that found
  // something, and hiding it behind a retry is how a suite stops meaning
  // anything. If a spec is genuinely flaky, fix the spec.
  retries: 0,
  workers: CI ? 2 : undefined,

  reporter: CI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: CI ? "retain-on-failure" : "off",
    launchOptions: { executablePath: findChromium() },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: findChromium() } },
    },
    {
      // The mobile pass. `scripts/mobile-check.mjs` measures horizontal
      // overflow specifically; this one runs the same nav walk at 375px so a
      // route that renders on a desktop and not on a phone is caught too.
      name: "mobile",
      testMatch: /nav-walk\.spec\.ts/,
      use: { ...devices["iPhone 13"], launchOptions: { executablePath: findChromium() } },
    },
  ],

  // Only started for a local run. Against a deployed base URL there is nothing
  // to start, and starting one would test the wrong thing.
  webServer: process.env.E2E_BASE
    ? undefined
    : {
        command: "npm run dev",
        url: BASE,
        reuseExistingServer: !CI,
        timeout: 180_000,
      },
});
