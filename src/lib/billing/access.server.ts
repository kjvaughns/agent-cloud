import { computeAccess } from './access';
import { paymentEnvironment } from './payment-rules';

/** The payment environment this build serves (test in preview, live when published). */
export function buildPaymentEnvironment(): 'sandbox' | 'live' {
  return paymentEnvironment(import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN);
}

export async function getAccessFor(userId: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const env = buildPaymentEnvironment();
  const [{ data: profile }, { data: adminRole }] = await Promise.all([
    supabaseAdmin.from('profiles').select('organization_id, is_platform_admin').eq('id', userId).maybeSingle(),
    supabaseAdmin.from('user_roles').select('role').eq('user_id', userId).in('role', ['super_admin', 'admin']).limit(1),
  ]);
  const orgId = (profile as any)?.organization_id ?? null;
  const { data: org } = orgId
    ? await supabaseAdmin.from('organizations').select('id, owner_id, plan_type, billing_comped').eq('id', orgId).maybeSingle()
    : { data: null };
  let rows: any[] = [];
  if (org) {
    const byOrg = await supabaseAdmin.from('payment_subscriptions').select('kind,status,current_period_end,user_id').eq('environment', env).eq('organization_id', org.id);
    const byOwner = org.owner_id
      ? await supabaseAdmin.from('payment_subscriptions').select('kind,status,current_period_end,user_id').eq('environment', env).eq('user_id', org.owner_id).eq('kind', 'solo')
      : { data: [] };
    rows = [...(byOrg.data ?? []), ...(byOwner.data ?? [])];
  }
  const result = computeAccess({
    hasWorkspace: !!org, comped: !!(org as any)?.billing_comped,
    isPlatformAdmin: !!(profile as any)?.is_platform_admin || !!adminRole?.length,
    planType: (org as any)?.plan_type ?? null, ownerId: (org as any)?.owner_id ?? null, rows,
  });
  // Never-paid self-serve workspaces get a hard paywall (sent back to /start);
  // lapsed ones keep the read-only grace behaviour.
  return { ...result, environment: env, isOwner: !!org && org.owner_id === userId, neverPaid: !!org && rows.length === 0 };
}

export async function assertWriteAccess(userId: string) {
  const access = await getAccessFor(userId);
  if (access.mode !== 'full') throw new Error('Your workspace is read-only until a plan is active. Go to Settings → Billing to subscribe.');
}
