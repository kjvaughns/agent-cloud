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
  agencyBase: 399,
  includedSeats: 15,
  seatOverage: 25,
  novaPro: 49,
  /** Solo plan does NOT include Nova Pro — it is bought separately at novaPro. */
  soloAgent: 50,
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

  return {
    ...PRICING,
    soloAgent:         num(solo?.monthly_price, PRICING.soloAgent),
    agencyBase:        num(agency?.monthly_price, PRICING.agencyBase),
    includedSeats:     num(agency?.included_seats, PRICING.includedSeats),
    seatOverage:       num(agency?.seat_overage_price, PRICING.seatOverage),
    novaPro:           num(nova?.monthly_price, PRICING.novaPro),
    whiteLabelMonthly: num(white?.monthly_price, PRICING.whiteLabelMonthly),
    whiteLabelSetup:   num(white?.setup_price, PRICING.whiteLabelSetup),
  };
}
