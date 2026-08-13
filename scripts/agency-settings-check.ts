/**
 * Agency settings, and branding that every agency can actually use.
 *
 * `npx tsx scripts/agency-settings-check.ts`
 *
 * Two halves.
 *
 * The first is real: `buildAccentRamp` is pure, and it now has to survive any
 * hex an owner picks rather than the handful that came out of a white-label
 * setup call. The contrast assertions below are the ones that matter — every
 * headline figure on the dashboard is `text-gold-bright` on the page
 * background, and a pale brand colour used to resolve to grey-on-white.
 *
 * The second is string assertions over the wiring. They prove the pieces are
 * still connected rather than that they work, which is worth having here
 * specifically: the logo upload was wired to a path row-level security always
 * rejected, and nothing anywhere noticed for as long as the feature existed.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAccentRamp, hexToRgb, DEFAULT_ACCENT } from "../src/lib/theme/accent";
import { brandingPath, LOGO_LIMIT } from "../src/lib/org-branding";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

// ── Contrast ────────────────────────────────────────────────────────────────

/** WCAG relative luminance, independently of the module under test. */
function lum(hex: string): number {
  const rgb = hexToRgb(hex)!;
  const chan = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(rgb[0]) + 0.7152 * chan(rgb[1]) + 0.0722 * chan(rgb[2]);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Roughly the page background in each mode. */
const LIGHT_BG = "#FAF8F2";
const DARK_BG = "#131316";

// The colours somebody actually picks, including the ones that used to break.
const BRANDS = [
  ["stock gold", DEFAULT_ACCENT],
  ["near white", "#FFFFFF"],
  ["pale yellow", "#FFF9C4"],
  ["near black", "#000000"],
  ["bright cyan", "#00E5FF"],
  ["deep navy", "#0B1F3A"],
  ["hot pink", "#FF2D95"],
  ["mid green", "#3FA34D"],
] as const;

for (const [label, hex] of BRANDS) {
  const light = buildAccentRamp(hex, false)!;
  const dark = buildAccentRamp(hex, true)!;

  // 3:1 is the WCAG floor for large text, which is what these figures are —
  // 22px bold. This is the assertion the whole clamp exists for.
  check(`${label}: gold-bright is readable on a light page`,
    contrast(light.goldBright, LIGHT_BG) >= 3, true);
  check(`${label}: gold-bright is readable on a dark page`,
    contrast(dark.goldBright, DARK_BG) >= 3, true);

  // Text sitting *on* the accent, which is a different question and was
  // already handled by luminance. Buttons are normal-weight, so 4.5:1.
  check(`${label}: text on the accent is readable`,
    contrast(light.goldForeground, light.gold) >= 4.5, true);
}

// The ramp must still be the agency's colour, not a wash of grey.
const navy = buildAccentRamp("#0B1F3A", false)!;
check("the accent itself is preserved exactly", navy.gold, "#0b1f3a");
check("a malformed hex yields no ramp", buildAccentRamp("nope", false), null);
check("glow stays a low-alpha wash", /^rgba\(.+0\.14\)$/.test(navy.goldGlow), true);

// ── Where a logo goes ───────────────────────────────────────────────────────

console.log("");

const ORG = "11111111-2222-3333-4444-555555555555";

// The first path segment IS the storage policy's authorization check — the
// policy asks `is_org_admin` about exactly this string. If the path stops
// leading with the org id, the bucket silently stops being guarded, and
// nothing else in the codebase would say so.
check("a logo is filed under its owning organisation",
  brandingPath(ORG, "Logo.png").startsWith(`${ORG}/`), true);
check("the filename survives as a URL",
  /^[a-z0-9/.\-_]+$/.test(brandingPath(ORG, "My Agency Logo (final)!.PNG")), true);
check("two uploads never collide",
  brandingPath(ORG, "a.png") === brandingPath(ORG, "a.png"), false);

// The old path was `org-logos/<org id>.<ext>` — one fixed name, overwritten in
// place, so a stored URL kept serving a stale picture through every cache
// between here and the user.
check("the path is not a fixed name per agency",
  brandingPath(ORG, "a.png") === `${ORG}/a.png`, false);

check("svg is allowed", LOGO_LIMIT.accept.includes("image/svg+xml"), true);

// ── The wiring ──────────────────────────────────────────────────────────────

console.log("");

const PAGE = readFileSync(join(ROOT, "src/routes/_authenticated/settings.agency.tsx"), "utf8");
const ORGFN = readFileSync(join(ROOT, "src/lib/organization.functions.ts"), "utf8");
const PERMS = readFileSync(join(ROOT, "src/lib/permissions.functions.ts"), "utf8");
const THEME = readFileSync(join(ROOT, "src/components/white-label-theme.tsx"), "utf8");
const WLFN = readFileSync(join(ROOT, "src/lib/white-label.functions.ts"), "utf8");
const WLPANEL = readFileSync(join(ROOT, "src/components/settings/white-label-panel.tsx"), "utf8");
const BRANDING_API = readFileSync(join(ROOT, "src/routes/api/public/branding.ts"), "utf8");

// Comments quote the old broken code on purpose, so the assertions that a
// thing is *gone* have to ignore them — a check that can never pass on a
// correct file is worse than no check.
const strip = (s: string) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const PAGE_CODE = strip(PAGE);
const WLFN_CODE = strip(WLFN);
const WLPANEL_CODE = strip(WLPANEL);

// The upload that never worked.
check("the page no longer writes logos into agent-documents",
  /agent-documents/.test(PAGE_CODE), false);
check("and no longer asks a private bucket for a public url",
  /getPublicUrl/.test(PAGE_CODE), false);
check("it uses the org-branding helper", /uploadOrgLogo/.test(PAGE_CODE), true);
// The specific shape that swallowed every failure for the life of the feature.
check("a failed upload is no longer ignored",
  /if \(!uploadErr\)/.test(PAGE_CODE), false);
check("a failed upload is reported to the user",
  /logoError/.test(PAGE_CODE), true);
check("the blob preview is revoked", /revokeObjectURL/.test(PAGE_CODE), true);

// One guard, both sides.
check("the page asks canEditAgencySettings", /canEditAgencySettings/.test(PAGE_CODE), true);
check("the capability exists", /canEditAgencySettings:/.test(PERMS), true);
check("it is not gated on inAgency, so a solo owner is not locked out",
  /canEditAgencySettings: Boolean\(org\)/.test(PERMS), true);
check("the server resolves it the same way", /resolveAgencySettingsAccess/.test(PERMS), true);
check("and the write calls it", /resolveAgencySettingsAccess/.test(ORGFN), true);
check("the owner-only inline check is gone",
  /Only the agency owner can update these settings/.test(strip(ORGFN)), false);
check("the subdomain stays owner-only",
  /Only the agency owner can change the subdomain/.test(ORGFN), true);
// An update filtered out by RLS matches no rows and is not an error.
check("the write asserts it changed something",
  /select\("id"\)[\s\S]{0,300}if \(!saved\?\.length\)/.test(ORGFN), true);

// Branding for everyone.
check("the theme no longer checks the plan", /plan_type/.test(strip(THEME)), false);
check("but still ignores a stale default accent", /DEFAULT_ACCENT/.test(THEME), true);

// Applying is open.
for (const gone of ["solo_plan", "inactive_subscription"]) {
  check(`${gone} is no longer a reason to refuse`, WLFN_CODE.includes(gone), false);
  check(`${gone} has no branch left in the panel`, WLPANEL_CODE.includes(gone), false);
}
check("not being the owner still is", /not_owner/.test(WLFN_CODE), true);
check("already being live still is", /already_live/.test(WLFN_CODE), true);

// The one plan check that must NOT be relaxed. This endpoint maps a custom
// domain to an org for the signed-out sign-in page; a domain only exists after
// approval, so dropping the filter would serve branding for orgs that have none.
check("the public branding endpoint still requires the white_label plan",
  /\.eq\("plan_type", "white_label"\)/.test(BRANDING_API), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
