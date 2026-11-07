import { useState } from 'react';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PaymentTestModeBanner } from '@/components/PaymentTestModeBanner';
import { getStripe, getStripeEnvironment } from '@/lib/stripe';
import { createManagedCheckout, createManagedPortal, getManagedSubscriptions, updateNovaSeats } from '@/lib/payments.functions';
import { Input } from '@/components/ui/input';
import type { PaymentProduct } from '@/lib/billing/payment-rules';
import { useServerFn } from '@/hooks/use-server-fn';
import { toast } from 'sonner';
export function useBillingCheckout(opts?: { onPaid?: () => void }) {
 const [clientSecret, setClientSecret] = useState<string | null>(null);
 const checkoutFn = useServerFn(createManagedCheckout);
 const qc = useQueryClient();
 const mutation = useMutation({
  mutationFn: async (p: { product: PaymentProduct; quantity?: number }) => {
   const result = await checkoutFn({ data: { ...p, quantity: p.quantity ?? 1, environment: getStripeEnvironment(), returnUrl: `${window.location.origin}/settings/billing` } });
   if ('error' in result) throw new Error(result.error);
   return result;
  },
  onSuccess: result => setClientSecret(result.clientSecret),
  onError: error => toast.error(error.message),
 });
 const element = <Dialog open={!!clientSecret} onOpenChange={open => { if (!open) { setClientSecret(null); qc.invalidateQueries({ queryKey: ['billing'] }); } }}>
  <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto p-0">
   <DialogHeader className="p-5 pb-0"><DialogTitle>Complete your subscription</DialogTitle><DialogDescription>Secure subscription payment</DialogDescription></DialogHeader>
   <PaymentTestModeBanner />
   {clientSecret && <EmbeddedCheckoutProvider key={clientSecret} stripe={getStripe()} options={{ clientSecret, onComplete: () => { toast.success('Payment received. Your plan updates in a few seconds.'); setTimeout(() => { setClientSecret(null); qc.invalidateQueries({ queryKey: ['billing'] }); qc.invalidateQueries({ queryKey: ['access'] }); opts?.onPaid?.(); }, 1500); } }}><EmbeddedCheckout /></EmbeddedCheckoutProvider>}
   <div className="p-4"><Button variant="outline" onClick={() => setClientSecret(null)}>Close</Button></div>
  </DialogContent>
 </Dialog>;
 return { ...mutation, element };
}
export function PaymentSubscriptionStatus() {
 const fn = useServerFn(getManagedSubscriptions);
 const query = useQuery({ queryKey: ['billing','managed-subscriptions'], queryFn: () => fn({ data: { environment: getStripeEnvironment() } }), refetchInterval: 5000 });
 const rows = query.data ?? [];
 if (!rows.length) return <PaymentTestModeBanner />;
 return <section aria-label="Payment subscriptions" className="border-b border-border py-3 space-y-2">
  <PaymentTestModeBanner />
  {rows.map(row => <div key={row.id} className="flex justify-between gap-3 text-sm"><span>{row.kind === 'nova_personal' ? 'Nova AI Pro' : row.kind === 'solo' ? 'Solo Agent Plan' : row.kind === 'agency' ? 'Agency Plan' : row.kind === 'nova_seats' ? 'Sponsored Nova seats' : 'White Label'}</span><span className="capitalize">{row.status}{row.cancel_at_period_end ? ` · Ends ${row.current_period_end ? new Date(row.current_period_end).toLocaleDateString() : 'at period end'}` : row.current_period_end ? ` · Renews ${new Date(row.current_period_end).toLocaleDateString()}` : ''}{row.kind === 'nova_seats' ? ` · ${row.quantity} seats` : ''}</span></div>)}
  {rows.filter(r => r.kind === 'nova_seats' && r.hasAccess).slice(0, 1).map(r => <SeatChanger key={r.id} current={r.quantity} />)}
 </section>;
}
export function useBillingPortal(scope: 'org' | 'personal') {
 const fn = useServerFn(createManagedPortal);
 return useMutation({
  mutationFn: async () => {
   const result = await fn({ data: { scope, environment: getStripeEnvironment(), returnUrl: window.location.href } });
   if ('error' in result) throw new Error(result.error);
   return result;
  },
  onSuccess: result => window.open(result.url, '_blank', 'noopener,noreferrer'),
  onError: error => toast.error(error.message),
 });
}

function SeatChanger({ current }: { current: number }) {
 const [qty, setQty] = useState(current);
 const fn = useServerFn(updateNovaSeats);
 const qc = useQueryClient();
 const m = useMutation({
  mutationFn: async () => {
   const result = await fn({ data: { quantity: qty, environment: getStripeEnvironment() } });
   if ('error' in result) throw new Error(result.error);
   return result;
  },
  onSuccess: r => { toast.success(`Seat count changed to ${r.quantity}. The difference is prorated on your next bill.`); qc.invalidateQueries({ queryKey: ['billing'] }); },
  onError: e => toast.error(e.message),
 });
 return <div className="flex items-center gap-2 text-sm" data-billing-allowed>
  <label htmlFor="seat-count">Change seat count</label>
  <Input id="seat-count" type="number" min={1} max={500} value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))} className="w-24 h-8" />
  <Button size="sm" variant="outline" disabled={qty === current || m.isPending} onClick={() => m.mutate()}>{m.isPending ? 'Updating…' : 'Update seats'}</Button>
 </div>;
}
