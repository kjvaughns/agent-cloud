import { subscriptionHasAccess } from './payment-rules';

/**
 * full      — may use and change everything their plan includes
 * read_only — paid before, plan has since ended: browse/export only
 * locked    — never paid (or no workspace): nothing but checkout/billing
 */
export type AccessMode = 'full' | 'read_only' | 'locked';
export type AccessReason =
  | 'comped' | 'platform_admin' | 'subscribed' | 'past_due'
  | 'lapsed' | 'never_paid' | 'no_workspace';
export type PlanTier = 'solo' | 'agency';
type Row = { kind: string; status: string; current_period_end: string | null; user_id?: string | null };

/** Only these subscriptions pay for the workspace itself; Nova purchases never do. */
const PLAN_KINDS = ['solo', 'agency', 'white_label'];
/** Statuses that prove a payment once went through. `incomplete*` = first charge never succeeded. */
const PAID_ONCE = ['active', 'trialing', 'past_due', 'unpaid', 'canceled', 'paused'];

/**
 * The one rule for who may use a workspace. Platform admins and comped agencies
 * always may. Otherwise a current plan subscription is required: past-due keeps
 * full access while the payment provider retries; once it ends the workspace is
 * view-only if it was ever paid, and fully locked if it never was.
 */
export function computeAccess(input: {
  hasWorkspace: boolean; comped: boolean; isPlatformAdmin: boolean;
  planType: string | null; ownerId: string | null; rows: Row[]; now?: number;
}): { mode: AccessMode; reason: AccessReason; plan: PlanTier; everPaid: boolean } {
  const planRows = input.rows.filter(r => PLAN_KINDS.includes(r.kind));
  const live = planRows.filter(r => subscriptionHasAccess(r.status, r.current_period_end, input.now));
  const hasAgency = live.some(r => r.kind === 'agency' || r.kind === 'white_label');
  // A paid Agency subscription upgrades a solo workspace right away, before the plan field catches up.
  const plan: PlanTier = input.planType === 'solo' && !hasAgency ? 'solo' : 'agency';
  const everPaid = planRows.some(r => PAID_ONCE.includes(r.status));

  if (input.isPlatformAdmin) return { mode: 'full', reason: 'platform_admin', plan, everPaid };
  if (!input.hasWorkspace) return { mode: 'locked', reason: 'no_workspace', plan, everPaid };
  if (input.comped) return { mode: 'full', reason: 'comped', plan, everPaid };

  const covering = input.planType === 'solo'
    ? live.filter(r => (r.kind === 'solo' && r.user_id === input.ownerId) || r.kind === 'agency' || r.kind === 'white_label')
    : live.filter(r => r.kind === 'agency' || r.kind === 'white_label');
  if (covering.length) {
    const pastDue = covering.every(r => r.status === 'past_due');
    return { mode: 'full', reason: pastDue ? 'past_due' : 'subscribed', plan, everPaid: true };
  }
  return everPaid
    ? { mode: 'read_only', reason: 'lapsed', plan, everPaid }
    : { mode: 'locked', reason: 'never_paid', plan, everPaid };
}

/** Pages that only exist for agencies. Solo workspaces see the upgrade page instead. */
export const AGENCY_ONLY_PATHS = [
  '/contracting/invite', '/team', '/leaderboard', '/announcements', '/challenges',
  '/contracting-ops', '/settings/sub-agencies',
];
export function isAgencyOnlyPath(pathname: string) {
  return AGENCY_ONLY_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

/** Reachable even when the workspace is locked, so people can pay, get help or leave. */
export const LOCKED_ALLOWED_PATHS = ['/settings/billing', '/account/help'];
