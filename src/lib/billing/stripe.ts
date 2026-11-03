/** Payment readiness only; all payment calls use the shared gateway transport. */
export function isStripeConfigured(): boolean {
 return !!process.env.STRIPE_SANDBOX_API_KEY || !!process.env.STRIPE_LIVE_API_KEY;
}
export { PRICING, NOVA_LIMITS, BILLABLE_PROFILE_STATUSES, NON_BILLABLE_PROFILE_STATUSES, pricingFromPlans, type Pricing, type PlanRow } from './pricing';
