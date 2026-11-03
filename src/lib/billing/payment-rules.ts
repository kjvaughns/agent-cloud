import { PRICING } from './pricing';
export const PAYMENT_PRODUCTS = {
 agency_plan: { kind: 'agency', price: 'agency_monthly', amount: PRICING.agencyBase, org: true },
 solo_agent: { kind: 'solo', price: 'solo_monthly', amount: PRICING.soloAgent, org: false },
 nova_pro_personal: { kind: 'nova_personal', price: 'nova_personal_monthly', amount: PRICING.novaPro, org: false },
 nova_seats: { kind: 'nova_seats', price: 'nova_sponsored_monthly', amount: PRICING.novaSponsored, org: true },
 white_label: { kind: 'white_label', price: 'white_label_monthly', amount: PRICING.whiteLabelMonthly, org: true },
} as const;
export type PaymentProduct = keyof typeof PAYMENT_PRODUCTS;
export function paymentEnvironment(token: string | undefined): 'sandbox' | 'live' {
 if (token?.startsWith('pk_test_')) return 'sandbox';
 if (token?.startsWith('pk_live_')) return 'live';
 throw new Error('Payments are not configured for this build. Complete live setup in the Payments dashboard.');
}
export function subscriptionHasAccess(status: string, end: string | null, now = Date.now()) {
 return ['active', 'trialing', 'past_due'].includes(status) && (!end || Date.parse(end) > now)
   || status === 'canceled' && !!end && Date.parse(end) > now;
}
