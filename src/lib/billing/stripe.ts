import Stripe from "stripe";

/**
 * Lazy Stripe client. All keys come from env — never hardcoded.
 * When keys are absent, isStripeConfigured() is false and every billing
 * surface shows an honest "billing not configured" state instead of crashing.
 */
let _stripe: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Billing is not configured yet (missing STRIPE_SECRET_KEY)");
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

export const PRICE_IDS = {
  agency_plan: () => process.env.STRIPE_AGENCY_PLAN_PRICE_ID,
  seat_overage: () => process.env.STRIPE_SEAT_OVERAGE_PRICE_ID,
  nova_pro_agent: () => process.env.STRIPE_NOVA_PRO_AGENT_PRICE_ID,
  nova_pro_agency_seat: () => process.env.STRIPE_NOVA_PRO_AGENCY_SEAT_PRICE_ID,
  solo_agent_plan: () => process.env.STRIPE_SOLO_PLAN_PRICE_ID,
  white_label_setup: () => process.env.STRIPE_WHITE_LABEL_SETUP_PRICE_ID,
  white_label_monthly: () => process.env.STRIPE_WHITE_LABEL_MONTHLY_PRICE_ID,
} as const;

// ── Pricing model (single source for UI + billing math) ─────────────────────
export const PRICING = {
  agencyBase: 199,
  includedSeats: 15,
  seatOverage: 20,
  novaPro: 49,
  soloAgent: 79,
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

/** Statuses that grant workspace access → billable seats. Access = billable. */
export const BILLABLE_PROFILE_STATUSES = ["pending", "onboarding", "licensing", "contracting", "ready_to_sell", "active"];
export const NON_BILLABLE_PROFILE_STATUSES = ["invited", "imported", "inactive", "terminated"];
