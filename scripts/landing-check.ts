/**
 * The landing page only claims what the product does.
 *
 *   npx tsx scripts/landing-check.ts
 *
 * ── Why this file is mostly about honesty ──
 *
 * A marketing page is the one surface where nothing pushes back. A wrong
 * number in the calculator fails a test; a wrong number here just sits there
 * converting people who then find out. This page had three of those at once:
 * a fifteen-agent cap and a $25 seat overage that billing has never charged,
 * and a "Start Free" button leading to a card form, because there is no trial.
 *
 * So the assertions are: every price comes from the pricing model rather than
 * being typed in, nothing promises a trial that does not exist, no metric or
 * testimonial is invented, and every Nova capability carries the state it is
 * actually in.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PRICING } from "../src/lib/billing/pricing";
import { NOVA_GROUPS, UNSHIPPED_GROUPS } from "../src/lib/landing/nova-capabilities";

const ROOT = join(import.meta.dirname, "..");

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const LANDING_DIR = join(ROOT, "src/components/landing");
const files = readdirSync(LANDING_DIR).filter((f) => f.endsWith(".tsx"));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const INDEX = strip(read("src/routes/index.tsx"));
const ALL = files.map((f) => strip(readFileSync(join(LANDING_DIR, f), "utf8"))).join("\n") + INDEX;

// ── No price is typed into the page ────────────────────────────────────────
//
// Every figure has to come from PRICING, or the page and the invoice drift.

for (const [label, value] of [
  ["the agency price", PRICING.agencyBase],
  ["the solo price", PRICING.soloAgent],
  ["the sponsored Nova price", PRICING.novaSponsored],
] as const) {
  check(`${label} is not hard-coded anywhere on the page`,
    new RegExp(`\\$${value}\\b`).test(ALL), false);
}
check("the pricing section reads every figure from the model",
  /money\(pricing\.soloAgent\)/.test(ALL) &&
  /money\(pricing\.agencyBase\)/.test(ALL) &&
  /money\(pricing\.novaPro\)/.test(ALL) &&
  /money\(pricing\.novaSponsored\)/.test(ALL),
  true);

// ── The seat charge that was never charged ─────────────────────────────────

check("no included-seat cap is advertised", /includedSeats|included agents|up to \d+ active/.test(ALL), false);
check("no per-seat overage is advertised", /seatOverage|per additional active user|additional agents ×/.test(ALL), false);
check("unlimited agents is stated where an agency will look",
  /Unlimited agents|unlimited agents/.test(ALL), true);

// ── A trial that does not exist ────────────────────────────────────────────
//
// There is no trial period on any Stripe price and no trial state in signup.
// "Start Free" led to a card form.

check("nothing promises a free trial", /Start Free|free trial|14.day|30.day free/i.test(ALL), false);
check("the primary action is Get started", /"Get started"/.test(INDEX), true);
// And it still degrades when checkout is not configured, rather than sending
// somebody into a signup that cannot finish.
check("…falling back to the demo when checkout is not configured",
  /checkoutReady \? "Get started" : "Book a demo"/.test(INDEX), true);

// ── Nothing invented ───────────────────────────────────────────────────────
//
// No customer counts, no premium totals, no logos, no testimonials. If any of
// these become real they can be quoted; until then they cannot.

check("no agent or agency count is claimed",
  /\d[\d,]{2,}\+? (agents|agencies|producers|users)/i.test(ALL), false);
check("no premium or production total is claimed",
  /\$\d[\d,]*(\.\d+)?\s*(million|billion|M|B)\b.*(premium|production|ALP)/i.test(ALL), false);
check("there are no testimonials", /testimonial|—\s*[A-Z][a-z]+ [A-Z][a-z]+, (CEO|Owner|Founder|Agent)/i.test(ALL), false);
check("there are no customer logos", /logos?\/|customer-logo|trusted by [A-Z]/i.test(ALL), false);
// The proof line that IS true, and is the one the brief allows in their place.
check("the honest proof line is the one used",
  /Built inside a working life insurance agency/.test(INDEX), true);

// ── Nova says what is live and what is not ─────────────────────────────────

const NOVA = strip(read("src/components/landing/nova-section.tsx"));

// Asserted against the DATA, not a regular expression over the component. The
// first version of this check was a regex, and it passed while matching the
// wrong group entirely — the lazy match ran straight past Pipeline autopilot
// into the group after it. A claim this consequential should not be guarded by
// something that can be accidentally right.
check("every Nova capability carries a state",
  NOVA_GROUPS.flatMap((g) => g.items).every((i) => i.state === "available" || i.state === "soon"),
  true);
check("the page says plainly what the labels mean",
  /means it works\s*\n?\s*today|means it works today/.test(NOVA), true);

// The three gated features in nova-features.ts, and the four automation
// triggers the worker actually sends on, are the live set. Pipeline autopilot
// has no code behind it at all, so not one of its lines may say otherwise.
for (const key of UNSHIPPED_GROUPS) {
  const group = NOVA_GROUPS.find((g) => g.key === key)!;
  check(`nothing in "${group.title}" is sold as working`,
    group.items.filter((i) => i.state === "available").map((i) => i.text), []);
}
check("the lapse scan, which does exist, is marked available",
  NOVA_GROUPS.find((g) => g.key === "retention")!
    .items.find((i) => i.text.startsWith("Ranks your in-force book"))?.state,
  "available");
// The automations the worker genuinely sends on.
for (const text of ["Birthday messages", "Policy anniversary messages"]) {
  check(`"${text}" is marked available, because it sends`,
    NOVA_GROUPS.flatMap((g) => g.items).find((i) => i.text === text)?.state, "available");
}
check("Nova is stated to need a licence", /requires an active Solo or Agency licence/i.test(ALL), true);

// ── The profit share is described as what it is ────────────────────────────

check("the profit share rate comes from the model, not a literal",
  /rate=\{pricing\.novaPartnerRate/.test(INDEX), true);
check("…and carries its qualifications",
  /subject to\s*\n?\s*payout, refund, attribution and eligibility terms/.test(NOVA), true);
check("…and is not described as an investment or guaranteed income",
  /not an investment, not guaranteed income/.test(NOVA), true);
check("sponsored seats are excluded from it",
  /Sponsored subscriptions do not also earn profit share|do not also earn profit share/.test(ALL), true);

// ── Structure the brief asks for ───────────────────────────────────────────

for (const id of ["product", "for-agents", "for-agencies", "nova", "pricing"]) {
  check(`the nav target #${id} exists on the page`, new RegExp(`id="${id}"`).test(ALL), true);
}
check("the base product is not shown as broken without Nova",
  /Record keeping, production, contracting and finances are in the licence/.test(ALL), true);

// ── Accessibility basics the brief names ───────────────────────────────────

const PRICING_SRC = strip(read("src/components/landing/pricing.tsx"));
check("the comparison table has a caption", /<caption className="sr-only">/.test(PRICING_SRC), true);
check("…and scoped headers", /scope="col"/.test(PRICING_SRC) && /scope="row"/.test(PRICING_SRC), true);
check("…and its tick marks are not icon-only",
  /<span className="sr-only">Included<\/span>/.test(PRICING_SRC), true);
check("the wide table scrolls inside its own container rather than the page",
  /overflow-x-auto/.test(PRICING_SRC), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
