import { subscriptionHasAccess } from './payment-rules';

export type AccessMode = 'full' | 'read_only';
export type AccessReason = 'comped' | 'platform_admin' | 'subscribed' | 'no_plan' | 'no_workspace';
type Row = { kind: string; status: string; current_period_end: string | null; user_id?: string | null };

/**
 * Who may change data. Comped agencies and platform admins always can.
 * Agency/White Label workspaces need an agency subscription; solo workspaces
 * need the owner's solo subscription. Past-due keeps access while the payment
 * provider retries (it becomes unpaid/canceled when retries end).
 */
export function computeAccess(input: {
  hasWorkspace: boolean; comped: boolean; isPlatformAdmin: boolean;
  planType: string | null; ownerId: string | null; rows: Row[]; now?: number;
}): { mode: AccessMode; reason: AccessReason } {
  if (input.isPlatformAdmin) return { mode: 'full', reason: 'platform_admin' };
  if (!input.hasWorkspace) return { mode: 'full', reason: 'no_workspace' }; // nothing to protect yet; lets onboarding run
  if (input.comped) return { mode: 'full', reason: 'comped' };
  const live = input.rows.filter(r => subscriptionHasAccess(r.status, r.current_period_end, input.now));
  const ok = input.planType === 'solo'
    ? live.some(r => r.kind === 'solo' && r.user_id === input.ownerId) || live.some(r => r.kind === 'agency')
    : live.some(r => r.kind === 'agency' || r.kind === 'white_label');
  return ok ? { mode: 'full', reason: 'subscribed' } : { mode: 'read_only', reason: 'no_plan' };
}
