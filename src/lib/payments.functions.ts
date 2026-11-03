import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import Stripe from 'stripe';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { createStripeClient, getStripeErrorMessage } from '@/lib/stripe.server';
import { PAYMENT_PRODUCTS, subscriptionHasAccess } from '@/lib/billing/payment-rules';
import { assertNotDemoCaller } from '@/lib/demo.server';
import { buildPaymentEnvironment, getAccessFor } from '@/lib/billing/access.server';

function assertBuildEnvironment(env: 'sandbox' | 'live') {
 if (env !== buildPaymentEnvironment()) throw new Error('This payment mode is not available here.');
}

const environment = z.enum(['sandbox', 'live']);
function trustedReturnUrl(value: string) {
 const url = new URL(value);
 const allowed = ['useagentcloud.com', 'www.useagentcloud.com', 'app.useagentcloud.com', 'agent-cloud.lovable.app',
 'id-preview--72338457-b712-4dd1-9869-c5b1476a0a2b.lovable.app', 'project--72338457-b712-4dd1-9869-c5b1476a0a2b-dev.lovable.app'];
 if (!(url.protocol === 'https:' && allowed.includes(url.hostname)) && !(url.hostname === 'localhost' && url.port === '8080' && url.protocol === 'http:')) throw new Error('Invalid return address');
 return url.toString();
}
async function ownedOrg(supabase: any, userId: string) {
 const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', userId).maybeSingle();
 const { data: orgs, error } = await supabase.from('organizations').select('id,name,subscription_status').eq('owner_id', userId).order('created_at');
 if (error) throw error;
 const org = orgs?.find((o: any) => o.id === profile?.organization_id) ?? orgs?.[0];
 if (!org) throw new Error('Only the agency owner can purchase an agency plan or seats.');
 return org;
}
async function resolveOrCreateCustomer(
 stripe: ReturnType<typeof createStripeClient>, options: { email?: string; userId?: string },
): Promise<string> {
 if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error('Invalid userId');
 if (options.userId) {
  const found = await stripe.customers.search({ query: `metadata['userId']:'${options.userId}'`, limit: 1 });
  if (found.data.length) return found.data[0].id;
 }
 if (options.email) {
  const existing = await stripe.customers.list({ email: options.email, limit: 1 });
  if (existing.data.length) {
   const customer = existing.data[0];
   if (options.userId && customer.metadata?.userId !== options.userId) await stripe.customers.update(customer.id, { metadata: { ...customer.metadata, userId: options.userId } });
   return customer.id;
  }
 }
 const created = await stripe.customers.create({ ...(options.email && { email: options.email }), ...(options.userId && { metadata: { userId: options.userId } }) });
 return created.id;
}
export const createManagedCheckout = createServerFn({ method: 'POST' })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({ product: z.enum(['agency_plan', 'solo_agent', 'nova_pro_personal', 'nova_seats', 'white_label']), quantity: z.number().int().min(1).max(500).default(1), environment, returnUrl: z.string().transform(trustedReturnUrl) }).parse(d))
 .handler(async ({ data, context }): Promise<{ clientSecret: string } | { error: string }> => {
  try {
   const { userId, supabase } = context;
   await assertNotDemoCaller(userId, 'start a checkout');
   assertBuildEnvironment(data.environment);
   const config = PAYMENT_PRODUCTS[data.product];
   const org = config.org ? await ownedOrg(supabase, userId) : null;
   const stripe = createStripeClient(data.environment);
   const { data: { user }, error: userError } = await supabase.auth.getUser();
   if (userError || !user) throw new Error('Please sign in to subscribe.');
   const customer = await resolveOrCreateCustomer(stripe, { userId, email: user.email });
   const subscriptions = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
   const existing = subscriptions.data.find(s => s.metadata.kind === config.kind && (!org || s.metadata.organization_id === org.id) && ['active','trialing','past_due','incomplete'].includes(s.status));
   if (existing) throw new Error(data.product === 'nova_seats' ? 'You already pay for Nova seats. Use Change seat count instead.' : 'You already have this subscription. Use Manage Billing to change it.');
   if (data.product === 'white_label') {
    const agency = subscriptions.data.find(s => s.metadata.kind === 'agency' && s.metadata.organization_id === org?.id && ['active','trialing'].includes(s.status));
    if (!agency) throw new Error('White Label requires an active Agency Plan in this payment environment.');
   }
   const resolvePrice = async (key: string) => {
    const result = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
    const price = result.data[0];
    if (!price) throw new Error(`Price not found: ${key}`);
    return price.id;
   };
   const meta: Record<string,string> = { userId, kind: config.kind, ...(org ? { organization_id: org.id } : { profile_id: userId }), quantity: String(data.product === 'nova_seats' ? data.quantity : 1), managed_payments: 'true' };
   const line_items = [{ price: await resolvePrice(config.price), quantity: data.product === 'nova_seats' ? data.quantity : 1 }];
   if (data.product === 'white_label') line_items.push({ price: await resolvePrice('white_label_setup'), quantity: 1 });
   const session = await stripe.checkout.sessions.create({
    mode: 'subscription', ui_mode: 'embedded_page', customer, line_items,
    return_url: data.returnUrl, metadata: meta, subscription_data: { metadata: meta },
    managed_payments: { enabled: true },
   } as Stripe.Checkout.SessionCreateParams);
   if (!session.client_secret) throw new Error('Payments did not return a checkout form.');
   return { clientSecret: session.client_secret };
  } catch (error) { return { error: getStripeErrorMessage(error) }; }
 });
export const createManagedPortal = createServerFn({ method: 'POST' })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({ scope: z.enum(['org','personal']), environment, returnUrl: z.string().transform(trustedReturnUrl) }).parse(d))
 .handler(async ({ data, context }): Promise<{ url: string } | { error: string }> => {
  try {
   const { userId, supabase } = context;
   await assertNotDemoCaller(userId, 'open the billing portal');
   assertBuildEnvironment(data.environment);
   if (data.scope === 'org') await ownedOrg(supabase, userId);
   const stripe = createStripeClient(data.environment);
   const found = await stripe.customers.search({ query: `metadata['userId']:'${userId}'`, limit: 1 });
   const customer = found.data[0];
   if (!customer) throw new Error('No billing account in this payment environment yet. Complete a checkout first.');
   const session = await stripe.billingPortal.sessions.create({ customer: customer.id, return_url: data.returnUrl });
   return { url: session.url };
  } catch (error) { return { error: getStripeErrorMessage(error) }; }
 });
export const getManagedSubscriptions = createServerFn({ method: 'POST' })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({ environment }).parse(d))
 .handler(async ({ data, context }) => {
  const { data: rows, error } = await context.supabase.from('payment_subscriptions').select('*').eq('user_id', context.userId).eq('environment', data.environment);
  if (error) throw error;
  return (rows ?? []).map(row => ({ ...row, hasAccess: subscriptionHasAccess(row.status, row.current_period_end) }));
 });

export const getAccessState = createServerFn({ method: 'GET' })
 .middleware([requireSupabaseAuth])
 .handler(async ({ context }) => getAccessFor(context.userId));

export const updateNovaSeats = createServerFn({ method: 'POST' })
 .middleware([requireSupabaseAuth])
 .inputValidator((d: unknown) => z.object({ quantity: z.number().int().min(1).max(500), environment }).parse(d))
 .handler(async ({ data, context }): Promise<{ ok: true; quantity: number } | { error: string }> => {
  try {
   const { userId, supabase } = context;
   await assertNotDemoCaller(userId, 'start a checkout');
   assertBuildEnvironment(data.environment);
   const org = await ownedOrg(supabase, userId);
   const { data: row, error } = await supabase.from('payment_subscriptions').select('stripe_subscription_id,status').eq('environment', data.environment).eq('organization_id', org.id).eq('kind', 'nova_seats').in('status', ['active', 'trialing', 'past_due']).limit(1).maybeSingle();
   if (error) throw error;
   if (!row) throw new Error('No Nova seat subscription yet. Buy seats first.');
   const stripe = createStripeClient(data.environment);
   const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
   const item = sub.items.data[0];
   if (!item) throw new Error('Seat subscription has no items');
   await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, quantity: data.quantity }],
    proration_behavior: 'create_prorations',
    metadata: { ...sub.metadata, quantity: String(data.quantity) },
   });
   return { ok: true, quantity: data.quantity };
  } catch (error) { return { error: getStripeErrorMessage(error) }; }
 });
