/**
 * The only numbers the public page is allowed to claim.
 *
 * Every figure here is measured from the live database and then ROUNDED DOWN,
 * so the page always understates. Nothing is invented, nothing is projected,
 * and no client, agent or carrier is identifiable from any of it.
 *
 * Measured 2026-09-08:
 *   policies                428      -> 400+
 *   sum(annual_premium)     574,041  -> $550K+
 *   clients                 800      -> 750+
 *   carriers configured      24      -> 20+
 *
 * Refresh by re-running the counts and rounding down again. Never round up.
 */
export const PROOF = {
  productionTracked: { value: "$550K+", label: "Production tracked", sub: "Annualised premium posted through the platform" },
  policies: { value: "400+", label: "Policies managed", sub: "Submitted, active and in-force, with their dates" },
  clients: { value: "750+", label: "Clients and leads", sub: "One record each, carried from lead to renewal" },
  carriers: { value: "20+", label: "Carriers configured", sub: "Comp levels, products and advance terms" },
} as const;

export const PROOF_ROWS = [PROOF.productionTracked, PROOF.policies, PROOF.clients, PROOF.carriers];

/** The one claim about who uses it. True, and checkable. */
export const PROOF_LINE =
  "Built inside a working life insurance agency, and used every day by real agents.";
