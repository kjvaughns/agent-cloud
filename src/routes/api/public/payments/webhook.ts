import { createFileRoute } from '@tanstack/react-router';
import { createStripeClient, verifyPaymentEvent, type StripeEnv } from '@/lib/stripe.server';
import { subscriptionHasAccess } from '@/lib/billing/payment-rules';
import { applyBillingLifecycle } from '@/lib/billing/payment-lifecycle.server';

async function processEvent(request: Request, environment: StripeEnv) {
 const event = await verifyPaymentEvent(request, environment);
 if (event.livemode !== (environment === 'live')) throw new Error('Payment environment mismatch');
 const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
 const { data: seen, error: seenError } = await supabaseAdmin.from('payment_events').select('event_id').eq('environment', environment).eq('event_id', event.id).maybeSingle();
 if (seenError) throw seenError;
 if (seen) return;
 const object: any = event.data.object;
 let subscriptionId: string | undefined;
 if (['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)) subscriptionId = object.id;
 else if (['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed'].includes(event.type)) subscriptionId = typeof object.subscription === 'string' ? object.subscription : object.subscription?.id;
 else if (['invoice.paid','invoice.payment_failed'].includes(event.type)) subscriptionId = object.parent?.subscription_details?.subscription ?? object.subscription;
 if (subscriptionId) {
  // Read the provider's current state, rather than replay stale event payloads.
  const stripe = createStripeClient(environment);
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const meta = subscription.metadata;
  const userId = meta.userId;
  const kind = meta.kind;
  if (!userId || !['agency','solo','nova_personal','nova_seats','white_label'].includes(kind)) {
   // Not started from this app (e.g. created by hand): acknowledge and ignore so it isn't retried for days.
   console.warn('[payments webhook] ignoring unattributed subscription', subscription.id);
   const { error } = await supabaseAdmin.from('payment_events').upsert({ environment, event_id: event.id }, { onConflict: 'environment,event_id' });
   if (error) throw error;
   return;
  }
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || customer.metadata.userId !== userId) throw new Error('Invalid customer attribution');
  const orgId = meta.organization_id ?? null;
  if (orgId) {
   const { data: org, error } = await supabaseAdmin.from('organizations').select('owner_id').eq('id', orgId).maybeSingle();
   if (error) throw error;
   if (org?.owner_id !== userId) throw new Error('Invalid agency attribution');
  }
  const item = subscription.items.data[0];
  if (!item) throw new Error('Subscription has no items');
  const end = item.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null;
  const { error } = await supabaseAdmin.from('payment_subscriptions').upsert({
   user_id: userId, organization_id: orgId, environment,
   stripe_subscription_id: subscription.id, stripe_customer_id: customerId,
   kind, price_id: item.price.lookup_key, quantity: item.quantity ?? 1,
   status: subscription.status, current_period_end: end,
   cancel_at_period_end: subscription.cancel_at_period_end,
   last_event_at: event.created, updated_at: new Date().toISOString(),
  }, { onConflict: 'environment,stripe_subscription_id' });
  if (error) throw error;
  // Solo → Agency upgrade: once the Agency plan is paid, end the owner's Solo
  // plan right away with a prorated credit so they never pay for both.
  if (kind === 'agency' && ['active', 'trialing'].includes(subscription.status)) {
   const { data: soloRows, error: soloError } = await supabaseAdmin.from('payment_subscriptions').select('stripe_subscription_id,status').eq('environment', environment).eq('user_id', userId).eq('kind', 'solo').in('status', ['active', 'trialing', 'past_due']);
   if (soloError) throw soloError;
   for (const solo of soloRows ?? []) {
    await stripe.subscriptions.cancel(solo.stripe_subscription_id, { prorate: true, invoice_now: true });
   }
  }
  // Preview payments never mutate the real agency/profile billing fields.
  if (environment === 'live') {
   const active = subscriptionHasAccess(subscription.status, end);
   if (kind === 'nova_personal' && (active || subscription.status === 'canceled')) {
    const { error: updateError } = await supabaseAdmin.from('profiles').update({
     nova_pro_status: active ? (subscription.status === 'past_due' ? 'past_due' : 'active') : 'grace_period',
     nova_pro_source: 'personal',
     nova_pro_expires_at: active ? null : new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    }).eq('id', userId);
    if (updateError) throw updateError;
   } else if (kind !== 'nova_personal' && (active || subscription.status === 'canceled')) {
    let targetOrgId: string | null = orgId;
    if (kind === 'solo') {
     const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('organization_id').eq('id', userId).maybeSingle();
     if (profileError) throw profileError;
     targetOrgId = profile?.organization_id ?? null;
    }
    if (!targetOrgId) throw new Error('No workspace for subscription');
    if (kind === 'nova_seats') {
     const { data: seats, error: seatsError } = await supabaseAdmin.from('payment_subscriptions').select('quantity,status,current_period_end').eq('environment','live').eq('organization_id',targetOrgId).eq('kind','nova_seats');
     if (seatsError) throw seatsError;
     const quantity = (seats ?? []).filter(s => subscriptionHasAccess(s.status,s.current_period_end)).reduce((sum,s) => sum + s.quantity,0);
     const { error: updateError } = await supabaseAdmin.from('organizations').update({ nova_seats_purchased: quantity }).eq('id',targetOrgId);
     if (updateError) throw updateError;
    } else {
     const patch: any = { subscription_status: active ? (subscription.status === 'past_due' ? 'past_due' : 'active') : 'cancelled', subscription_current_period_end: end };
     // White Label is an add-on; ending it must not cancel the Agency Plan.
     if (kind === 'white_label') {
      delete patch.subscription_status;
      delete patch.subscription_current_period_end;
      patch.plan_type = active ? 'white_label' : 'agency';
     }
     if (active && kind === 'agency') patch.plan_type = 'agency';
     if (active && kind === 'white_label') patch.plan_type = 'white_label';
     let query = supabaseAdmin.from('organizations').update(patch).eq('id',targetOrgId);
     if (kind === 'solo') query = query.eq('plan_type','solo');
     const { error: updateError } = await query;
     if (updateError) throw updateError;
    }
   }
   await applyBillingLifecycle(supabaseAdmin,stripe,event,subscription);
  }
 }
 const { error } = await supabaseAdmin.from('payment_events').upsert({ environment, event_id: event.id }, { onConflict: 'environment,event_id' });
 if (error) throw error;
}

export const Route = createFileRoute('/api/public/payments/webhook')({
 server: { handlers: { POST: async ({ request }) => {
  const environment = new URL(request.url).searchParams.get('env');
  if (environment !== 'sandbox' && environment !== 'live') return new Response('Invalid environment', { status: 400 });
  try { await processEvent(request, environment); return Response.json({ received: true }); }
  catch (error) { console.error('[payments webhook]', error); return new Response('Payment event rejected', { status: 400 }); }
 } } },
});