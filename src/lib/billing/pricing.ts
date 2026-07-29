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

/** Statuses that grant workspace access → billable seats. Access = billable. */
export const BILLABLE_PROFILE_STATUSES = ["pending", "onboarding", "licensing", "contracting", "ready_to_sell", "active"];
export const NON_BILLABLE_PROFILE_STATUSES = ["invited", "imported", "inactive", "terminated"];
