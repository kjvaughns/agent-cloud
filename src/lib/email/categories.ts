/**
 * Email categories — client-safe constants shared by the sender, the
 * organization settings UI and the per-agent notification preferences.
 *
 * `category` drives BOTH consent layers:
 *   1. organization_settings.email_categories[category] — the agency opts in
 *   2. public.may_notify(profile_id, category)          — the individual opts out
 *
 * `transactional` is the one exempt category: account security and
 * billing-failure mail always sends and carries no unsubscribe link.
 */

export const EMAIL_CATEGORIES = [
  "task_assigned",
  "policy_at_risk",
  "commission_posted",
  "contract_updates",
  "team_activity",
  "announcements",
  "billing",
  "transactional",
] as const;

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

/** Categories that bypass consent + unsubscribe (security / money failures). */
export const EXEMPT_CATEGORIES: EmailCategory[] = ["transactional"];

export const CATEGORY_LABELS: Record<EmailCategory, string> = {
  task_assigned: "Task assignments",
  policy_at_risk: "Policies at risk",
  commission_posted: "Commissions posted",
  contract_updates: "Contracting updates",
  team_activity: "Team activity",
  announcements: "Announcements",
  billing: "Billing & subscription",
  transactional: "Account & security (always on)",
};

/** Categories an agency owner can toggle in Agency Settings. */
export const CONFIGURABLE_CATEGORIES: EmailCategory[] = EMAIL_CATEGORIES.filter(
  (c) => !EXEMPT_CATEGORIES.includes(c),
);

/** High-volume categories that default to a digest rather than per-event mail. */
export const DIGEST_CATEGORIES: EmailCategory[] = [
  "policy_at_risk",
  "team_activity",
];
