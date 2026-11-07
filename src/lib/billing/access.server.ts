import { computeAccess } from './access';
import { paymentEnvironment } from './payment-rules';

/** The payment environment this build serves (test in preview, live when published). */
export function buildPaymentEnvironment(): 'sandbox' | 'live' {
  return paymentEnvironment(import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN);
}

export async function getAccessFor(userId: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const env = buildPaymentEnvironment();
  const [{ data: profile, error: profileError }, { data: adminRole }] = await Promise.all([
    supabaseAdmin.from('profiles').select('organization_id').eq('id', userId).maybeSingle(),
    supabaseAdmin.from('user_roles').select('role').eq('user_id', userId).in('role', ['super_admin', 'admin']).limit(1),
  ]);
  // A failed lookup must never read as "no workspace yet" — that used to grant full access.
  if (profileError) throw profileError;
  let orgId = (profile as any)?.organization_id ?? null;
  if (!orgId) {
    const { data: owned } = await supabaseAdmin.from('organizations').select('id').eq('owner_id', userId).order('created_at').limit(1);
    orgId = owned?.[0]?.id ?? null;
  }
  const { data: org, error: orgError } = orgId
    ? await supabaseAdmin.from('organizations').select('id, owner_id, plan_type, billing_comped').eq('id', orgId).maybeSingle()
    : { data: null, error: null };
  if (orgError) throw orgError;
  let rows: any[] = [];
  if (org) {
    const byOrg = await supabaseAdmin.from('payment_subscriptions').select('kind,status,current_period_end,user_id').eq('environment', env).eq('organization_id', org.id);
    const byOwner = org.owner_id
      ? await supabaseAdmin.from('payment_subscriptions').select('kind,status,current_period_end,user_id').eq('environment', env).eq('user_id', org.owner_id).eq('kind', 'solo')
      : { data: [], error: null };
    if (byOrg.error) throw byOrg.error;
    if (byOwner.error) throw byOwner.error;
    rows = [...(byOrg.data ?? []), ...(byOwner.data ?? [])];
  }
  const result = computeAccess({
    hasWorkspace: !!org, comped: !!(org as any)?.billing_comped,
    isPlatformAdmin: !!adminRole?.length,
    planType: (org as any)?.plan_type ?? null, ownerId: (org as any)?.owner_id ?? null, rows,
  });
  return {
    ...result, environment: env,
    isOwner: !!org && org.owner_id === userId,
    neverPaid: result.reason === 'never_paid',
  };
}

export async function assertWriteAccess(userId: string) {
  const access = await getAccessFor(userId);
  if (access.mode === 'locked') throw new Error('Your workspace isn\'t active yet. Finish checkout to start using Agent Cloud.');
  if (access.mode !== 'full') throw new Error('Your workspace is view-only until a plan is active. Go to Settings → Billing to renew.');
  return access;
}

/** Agency-only actions (inviting agents, team tools). */
export async function assertAgencyPlan(userId: string) {
  const access = await assertWriteAccess(userId);
  if (access.plan !== 'agency') throw new Error('Inviting agents and team tools are part of the Agency plan. Upgrade in Settings → Billing.');
  return access;
}
