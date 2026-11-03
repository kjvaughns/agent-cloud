import type Stripe from 'stripe';
import { PRICING } from './pricing';

/** Live-only side effects retained from the previous billing integration. */
export async function applyBillingLifecycle(db: any, stripe: Stripe, event: Stripe.Event, subscription: Stripe.Subscription) {
 const meta = subscription.metadata;
 const userId = meta.userId;
 const kind = meta.kind;
 const object: any = event.data.object;
 const profileId = meta.profile_id ?? userId;
 const orgId = meta.organization_id;
 if (event.type === 'invoice.paid' && kind === 'nova_personal') {
  const { error } = await db.from('profiles').update({ nova_usage_calls_minutes: 0, nova_usage_sms: 0, nova_usage_ai_queries: 0, nova_usage_automations: 0, nova_usage_reset_at: new Date().toISOString() }).eq('id',profileId);
  if (error) throw error;
 }
 if (event.type === 'customer.subscription.deleted' && kind === 'nova_personal') {
  const { data: profile } = await db.from('profiles').select('organization_id').eq('id',profileId).maybeSingle();
  if (profile?.organization_id) {
   const { data: org } = await db.from('organizations').select('nova_seats_purchased').eq('id',profile.organization_id).maybeSingle();
   const { count } = await db.from('profiles').select('id',{count:'exact',head:true}).eq('organization_id',profile.organization_id).eq('nova_pro_source','agency').in('nova_pro_status',['active','grace_period','past_due']);
   if ((org?.nova_seats_purchased ?? 0) > (count ?? 0)) {
    const { error } = await db.from('profiles').update({nova_pro_status:'active',nova_pro_source:'agency',nova_pro_expires_at:null}).eq('id',profileId);
    if (error) throw error;
   }
  }
 }
 if (event.type === 'invoice.paid' && orgId && ['agency','white_label'].includes(kind)) {
  const { data: org, error: orgError } = await db.from('organizations').select('owner_id,nova_partner_commission_rate,nova_partner_commission_ytd').eq('id',orgId).maybeSingle();
  if (orgError) throw orgError;
  const start = new Date((object.period_start ?? event.created) * 1000).toISOString().slice(0,10);
  const end = new Date((object.period_end ?? event.created) * 1000).toISOString().slice(0,10);
  const { data: prior, error: priorError } = await db.from('nova_partner_commissions').select('id').eq('organization_id',orgId).eq('billing_period_start',start).eq('billing_period_end',end).limit(1);
  if (priorError) throw priorError;
  if (!prior?.length && org) {
   const { count, error: countError } = await db.from('profiles').select('id',{count:'exact',head:true}).eq('organization_id',orgId).eq('nova_pro_status','active').eq('nova_pro_source','personal').neq('id',org.owner_id);
   if (countError) throw countError;
   const rate = Number(org.nova_partner_commission_rate ?? PRICING.novaPartnerRate);
   const amount = Math.round((count ?? 0) * PRICING.novaPro * rate * 100) / 100;
   const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
   const credit = amount > 0 ? await stripe.customers.createBalanceTransaction(customer,{amount:-Math.round(amount*100),currency:'usd',description:'Nova Partner Revenue Program'},{idempotencyKey:`partner:${orgId}:${start}:${end}`}) : null;
   const { error } = await db.from('nova_partner_commissions').insert({ organization_id:orgId,billing_period_start:start,billing_period_end:end,nova_subscriber_count:count ?? 0,commission_rate:rate,commission_amount:amount,stripe_credit_id:credit?.id ?? null,status:'applied' });
   if (error) throw error;
   if (amount > 0) {
    const { error: updateError } = await db.from('organizations').update({nova_partner_commission_ytd:Number(org.nova_partner_commission_ytd ?? 0)+amount}).eq('id',orgId);
    if (updateError) throw updateError;
   }
  }
 }
 if (['invoice.payment_failed','customer.subscription.deleted','checkout.session.completed'].includes(event.type)) {
  if (event.type === 'checkout.session.completed' && object.payment_status === 'unpaid') return;
  const { queueEmail } = await import('@/lib/email/send.server');
  const failed = event.type === 'invoice.payment_failed';
  const cancelled = event.type === 'customer.subscription.deleted';
  await queueEmail({ template: failed ? 'payment-failed' : kind.startsWith('nova') ? 'nova-pro-changed' : 'subscription-changed',profileId:userId,orgId:orgId ?? null,category:failed ? 'transactional' : 'billing',key:`managed-payment:${event.id}`,data:{state:failed ? 'past_due' : cancelled ? 'cancelled' : 'activated',planName:kind==='solo' ? 'Solo Agent Plan' : kind==='agency' ? 'Agency Plan' : kind==='white_label' ? 'White Label' : 'Nova AI Pro'} });
 }
}