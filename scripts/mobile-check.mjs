/**
 * Does any page scroll sideways on a phone?
 *
 *   npm run dev            # in one shell
 *   node scripts/mobile-check.mjs [--base http://localhost:3000] [--width 375]
 *
 * Horizontal overflow is the one mobile failure that is both objectively
 * measurable and always a bug. Everything else about a small screen is a
 * judgement call — is this text too small, is this tap target too tight — but
 * a page wider than the viewport is never intentional, and it is the failure
 * users describe as "the app is broken on my phone": the whole layout slides
 * under your thumb and nothing lines up.
 *
 * So this measures exactly that, plus the element responsible, and says
 * nothing about taste.
 *
 * ── What it cannot do ───────────────────────────────────────────────────────
 *
 * Authenticated routes need a session. Set MOBILE_CHECK_EMAIL and
 * MOBILE_CHECK_PASSWORD and it will sign in first; without them it checks the
 * public routes only and says so rather than reporting a clean run it did not
 * earn.
 */

import { chromium } from "playwright-core";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flagValue = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const BASE = flagValue("base", process.env.MOBILE_CHECK_BASE || "http://localhost:3000");
const WIDTH = Number(flagValue("width", 375));
const HEIGHT = Number(flagValue("height", 812));

const EMAIL = process.env.MOBILE_CHECK_EMAIL;
const PASSWORD = process.env.MOBILE_CHECK_PASSWORD;

/** Reachable signed out. */
const PUBLIC_ROUTES = [
  "/", "/login", "/signup", "/signup/agent", "/demo", "/demo-login",
  "/forgot-password", "/privacy", "/terms", "/cookies",
];

/** Everything behind /_authenticated worth checking. Needs credentials. */
const PRIVATE_ROUTES = [
  "/dashboard", "/pipeline", "/clients", "/calendar", "/book-of-business",
  "/retention", "/tasks", "/leaderboard", "/team", "/agency", "/reports",
  "/finances", "/import", "/resources", "/ai-assistant", "/notifications",
  "/contracting", "/contracting/carriers", "/contracting/commission-grids",
  "/contracting/invite", "/contracting-ops", "/contracting-ops/queue",
  "/contracting-ops/requests", "/contracting-ops/licensing",
  "/contracting-ops/documents", "/contracting-ops/carriers",
  "/settings", "/settings/agency", "/settings/notifications",
  "/settings/security", "/settings/billing", "/settings/roles",
  "/account/producer-profile", "/licensing", "/onboarding", "/post-deal",
];

/**
 * The widest element whose right edge exceeds the viewport.
 *
 * Reporting the page alone is not actionable — "/finances is 60px too wide"
 * sends you reading the whole route. This walks the tree for the actual
 * offender and hands back a selector, which is usually enough to fix it
 * without opening a browser.
 */
const FIND_OVERFLOW = (width) => {
  const docWidth = document.documentElement.scrollWidth;
  if (docWidth <= width) return null;

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className
      ? "." + el.className.trim().split(/\s+/).slice(0, 4).join(".")
      : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  /**
   * Is this element's overflow already somebody else's problem?
   *
   * A card sitting 1400px to the right inside a horizontally-scrolling
   * carousel is not a bug — it is the carousel working. Without this check the
   * report always blames the furthest-right element it can find, which on the
   * landing page meant a testimonial slide rather than the four-pixel
   * offender actually pushing the document wide.
   */
  const absorbedByAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
    }
    return false;
  };

  let worst = null;
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    // Ignore things that are deliberately off-screen (closed drawers, toasts)
    // and zero-size nodes.
    if (r.width === 0 || r.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    if (style.position === "fixed") continue;
    if (absorbedByAncestor(el)) continue;
    const overhang = Math.round(r.right - width);
    if (overhang > 1 && (!worst || overhang > worst.overhang)) {
      worst = { overhang, selector: describe(el), width: Math.round(r.width) };
    }
  }

  return { docWidth, viewport: width, worst };
};

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
}

/**
 * Find a Chromium without depending on a version-stamped path.
 *
 * PLAYWRIGHT_BROWSERS_PATH holds directories like `chromium-1194`, and the
 * number changes with every Playwright bump. Globbing for whatever is actually
 * installed means this script does not need editing each time.
 */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  for (const dir of readdirSync(root).filter((d) => d.startsWith("chromium")).sort().reverse()) {
    for (const rel of ["chrome-linux/chrome", "chrome-linux/headless_shell"]) {
      const p = join(root, dir, rel);
      if (existsSync(p)) return p;
    }
  }
  // Let Playwright's own resolution try; it throws a clearer error than we would.
  return undefined;
}

const browser = await chromium.launch({ executablePath: findChromium() });
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();

let routes = [...PUBLIC_ROUTES];
if (EMAIL && PASSWORD) {
  try {
    await signIn(page);
    routes = [...PUBLIC_ROUTES, ...PRIVATE_ROUTES];
    console.log(`Signed in as ${EMAIL} — checking public and authenticated routes.\n`);
  } catch (e) {
    console.error(`! Could not sign in (${e.message}). Checking public routes only.\n`);
  }
} else {
  console.log(
    "No MOBILE_CHECK_EMAIL / MOBILE_CHECK_PASSWORD set — checking public routes only.\n" +
      "Authenticated pages are NOT covered by this run.\n",
  );
}

console.log(`Viewport ${WIDTH}×${HEIGHT}, base ${BASE}\n`);

const failures = [];
const errored = [];
for (const route of routes) {
  try {
    // `domcontentloaded`, not `networkidle`. The landing page runs ambient
    // animation and the dashboard polls, so networkidle never fires on them
    // and the route times out without ever being measured — a page that
    // silently goes unchecked is worse than one that fails.
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Let late layout (charts, fonts, async panels) settle before measuring.
    await page.waitForTimeout(700);
    const result = await page.evaluate(FIND_OVERFLOW, WIDTH);
    if (!result) {
      console.log(`  ok    ${route}`);
    } else {
      failures.push({ route, ...result });
      console.log(
        `  WIDE  ${route} — ${result.docWidth}px in a ${WIDTH}px viewport` +
          (result.worst
            ? `\n        ${result.worst.selector} (${result.worst.width}px, ${result.worst.overhang}px past the edge)`
            : ""),
      );
    }
  } catch (e) {
    errored.push(route);
    console.log(`  ?     ${route} — ${e.message.split("\n")[0]}`);
  }
}

await browser.close();

// Counted separately and treated as failure. A route that would not load was
// never measured, and reporting it inside a pass rate would let a broken page
// read as a clean one — the exact thing this script exists to prevent.
const checked = routes.length - errored.length;
console.log(`\n${checked - failures.length}/${checked} checked routes fit the viewport.`);
if (failures.length) console.log(`${failures.length} scroll sideways.`);
if (errored.length) {
  console.log(`${errored.length} could not be loaded and were NOT checked: ${errored.join(", ")}`);
}
if (!EMAIL || !PASSWORD) {
  console.log("Authenticated routes were not covered — set MOBILE_CHECK_EMAIL/PASSWORD.");
}
console.log("");
process.exit(failures.length || errored.length ? 1 : 0);
