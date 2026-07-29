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

// Pricing lives in ./pricing so client bundles can read it without the Stripe SDK.
export {
  PRICING, NOVA_LIMITS, BILLABLE_PROFILE_STATUSES, NON_BILLABLE_PROFILE_STATUSES,
  pricingFromPlans, type Pricing, type PlanRow,
} from "./pricing";
