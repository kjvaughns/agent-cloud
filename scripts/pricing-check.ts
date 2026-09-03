/**
 * The product quotes the price it charges.
 *
 *   npx tsx scripts/pricing-check.ts
 *
 * ── The charge nobody was ever charged ──
 *
 * `PRICING` carried `includedSeats: 15` and `seatOverage: 25`, and the billing
 * overview added `overageSeats * seatOverage` to the total it showed an owner.
 * The agency checkout has always been one flat subscription —
 * `line_items: [{ price: agency_plan, quantity: 1 }]` — and nothing anywhere
 * updates a subscription quantity. `PRICE_IDS.seat_overage` is declared and
 * never read.
 *
 * So the overage existed in exactly two places: a number in Settings ▸ Billing,
 * a promise on the public pricing page, and a clause in the Terms of Service.
 * Three places, and Stripe billed none of it. An agency with forty agents was
 * being SHOWN $399 + $625 and charged $399.
 *
 * These assertions are mostly "is the phantom gone", and one that matters more
 * than the rest: every price the product displays has to be a price the
 * checkout can actually take.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PRICING, pricingFromPlans } from "../src/lib/billing/pricing";

const ROOT = join(import.meta.dirname, "..");

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── The numbers ─────────────────────────────────────────────────────────────

check("the agency plan is $399", PRICING.agencyBase, 399);
check("solo is $49", PRICING.soloAgent, 49);
check("Nova is $49 for an agent buying it themselves", PRICING.novaPro, 49);
check("…and $39 when the agency sponsors it", PRICING.novaSponsored, 39);
check("the sponsored rate is the cheaper of the two", PRICING.novaSponsored < PRICING.novaPro, true);
check("profit share is 20%", PRICING.novaPartnerRate, 0.2);

// ── The phantom is gone from the model ─────────────────────────────────────

check("there is no included-seat count", "includedSeats" in PRICING, false);
check("there is no per-seat overage", "seatOverage" in PRICING, false);

// The plans table still HAS those columns — dropping them would destroy data —
// so the overlay is what has to refuse them. An operator filling them in must
// not be able to reintroduce a charge the checkout does not make.
const overlaid = pricingFromPlans([
  {
    key: "agency_plan", name: "Agency", monthly_price: 399, setup_price: 0,
    included_seats: 15, seat_overage_price: 25, description: null,
  },
]);
check("a plans row cannot reintroduce an included-seat count",
  "includedSeats" in overlaid, false);
check("…nor a per-seat overage", "seatOverage" in overlaid, false);
check("…while the prices it SHOULD set still come through",
  pricingFromPlans([
    { key: "solo_agent", name: "Solo", monthly_price: 59, setup_price: 0,
      included_seats: 0, seat_overage_price: 0, description: null },
  ]).soloAgent,
  59);
check("an empty table changes nothing", pricingFromPlans([]), PRICING);

// ── Nothing quotes a charge the checkout cannot take ───────────────────────

const BILLING_FN = strip(read("src/lib/billing.functions.ts"));
const BILLING_UI = strip(read("src/routes/_authenticated/settings.billing.tsx"));
const LANDING = strip(read("src/components/landing/pricing.tsx"));
const TERMS = strip(read("src/routes/terms.tsx"));

check("the displayed total no longer adds overage",
  /overageSeats \* PRICING\.seatOverage/.test(BILLING_FN), false);
check("…and no longer computes an overage at all",
  /overageSeats/.test(BILLING_FN), false);
// The agent count is still shown. It is information about the agency, not a
// price, and removing it would answer a question nobody asked.
check("the active agent count is still reported", /active: seatCount/.test(BILLING_FN), true);

// Sponsored seats go through their own Stripe price and always did; the
// breakdown quoted the personal figure against them.
check("sponsored Nova seats are totalled at the sponsored rate",
  /nova_seats_purchased \?\? 0\) \* PRICING\.novaSponsored/.test(BILLING_FN), true);
check("…and the billing breakdown says so too",
  /d\.pricing\.novaSponsored/.test(BILLING_UI), true);

for (const [name, src] of [
  ["the billing screen", BILLING_UI],
  ["the public pricing page", LANDING],
  ["the terms of service", TERMS],
] as const) {
  check(`${name} does not mention a seat overage`,
    /seatOverage|per-seat rate|additional active user/.test(src), false);
  check(`${name} does not cap the agent count`,
    /includedSeats|includes \{?\d+\}? agents|up to \$\{?pricing/.test(src), false);
}

// The one that is a legal claim rather than a marketing one.
check("the terms say the agency plan is flat and uncapped",
  /flat monthly price covering every agent/.test(TERMS) && /no cap on active users/.test(TERMS),
  true);

// ── Checkout still takes one flat subscription ─────────────────────────────
//
// This is what made the overage a phantom. If it ever becomes quantity-based,
// the copy above becomes false and this is the assertion that should catch it.
check("the agency subscription is a single flat line item",
  /if \(data\.product === "agency_plan"\)[\s\S]{0,400}line_items: \[\{ price, quantity: 1 \}\]/.test(BILLING_FN),
  true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
