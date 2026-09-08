/**
 * Pricing model — the single source for both billing math and UI copy.
 *
 * Kept separate from `./stripe` so client components can import it without
 * pulling the Stripe Node SDK into the browser bundle.
 *
 * These are code constants today. Making them editable per-plan (a `plans`
 * table driving both Stripe price IDs and this map) is tracked in the audit
 * backlog — see docs/PHASE1-AUDIT.md.
 */
export const PRICING = {
  /**
   * Flat, for as many agents as the agency has.
   *
   * ── The seat charge nobody was ever charged ──
   *
   * This carried `includedSeats: 15` and `seatOverage: 25`, and the billing
   * overview added `overageSeats * seatOverage` to the total it displayed. The
   * agency checkout has always been `line_items: [{ price: agency_plan,
   * quantity: 1 }]` — one flat subscription — and nothing anywhere updates a
   * subscription quantity. `PRICE_IDS.seat_overage` is declared and never read.
   *
   * So the overage existed in two places: a number shown to owners in
   * Settings ▸ Billing, and a promise on the public pricing page. Stripe never
   * billed a cent of it. Removing it takes no revenue and stops the product
   * quoting a charge it does not make.
   */
  agencyBase: 399,
  novaPro: 49,
  /**
   * What an AGENCY pays to sponsor Nova for one of its agents, per agent.
   *
   * A separate Stripe price already existed for this (`nova_pro_agency_seat`);
   * only the figure the product quoted was the personal one. An agency
   * sponsoring a seat does not also earn profit share on it.
   */
  novaSponsored: 39,
  /** Solo plan does NOT include Nova Pro — it is bought separately at novaPro. */
  soloAgent: 49,
  whiteLabelSetup: 999,
  whiteLabelMonthly: 499,
  novaPartnerRate: 0.2, // default; per-org override in organizations.nova_partner_commission_rate
} as const;

export const NOVA_LIMITS = {
  outbound_minutes: { included: 300, overage: 0.03, label: "Outbound calling minutes" },
  inbound_minutes: { included: 300, overage: 0.02, label: "Inbound calling minutes" },
  sms: { included: 500, overage: 0.02, label: "SMS/MMS messages" },
  ai_queries: { included: 500, overage: 0.05, label: "Nova AI queries" },
  automations: { included: 200, overage: 0.1, label: "Automation executions" },
} as const;

/**
 * Which statuses cost a seat.
 *
 * You pay for producers, not for people who signed up. `pending` moved to the
 * free side: an invited agent who has not been activated and has not sold yet
 * has an account and an onboarding checklist, not the selling half of the
 * product, so charging for them would be charging for a recruit.
 */
export const BILLABLE_PROFILE_STATUSES = ["onboarding", "licensing", "contracting", "ready_to_sell", "active"];
export const NON_BILLABLE_PROFILE_STATUSES = ["pending", "invited", "imported", "inactive", "terminated"];

// ── Runtime pricing (plans table, with these constants as the fallback) ──────

/** PRICING widened from its literal types, so runtime values can replace it. */
export type Pricing = { -readonly [K in keyof typeof PRICING]: number };

export type PlanRow = {
  key: string;
  name: string;
  monthly_price: number;
  setup_price: number;
  included_seats: number;
  seat_overage_price: number;
  description: string | null;
};

/**
 * Overlay the plans table onto PRICING.
 *
 * The constants above stay authoritative as a fallback so billing math never
 * depends on a seed having run, or on the table being reachable. An operator
 * editing plans changes the numbers; an empty or missing table changes nothing.
 */
export function pricingFromPlans(rows: PlanRow[] | null | undefined): Pricing {
  if (!rows?.length) return PRICING;
  const by = new Map(rows.map((r) => [r.key, r]));
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const solo = by.get("solo_agent");
  const agency = by.get("agency_plan");
  const nova = by.get("nova_pro");
  const white = by.get("white_label");

  // `included_seats` and `seat_overage_price` are deliberately NOT read. The
  // columns stay on the table — dropping them would destroy data for no gain —
  // but an operator setting them can no longer reintroduce a charge the
  // checkout does not make.
  return {
    ...PRICING,
    soloAgent:         num(solo?.monthly_price, PRICING.soloAgent),
    agencyBase:        num(agency?.monthly_price, PRICING.agencyBase),
    novaPro:           num(nova?.monthly_price, PRICING.novaPro),
    whiteLabelMonthly: num(white?.monthly_price, PRICING.whiteLabelMonthly),
    whiteLabelSetup:   num(white?.setup_price, PRICING.whiteLabelSetup),
  };
}
