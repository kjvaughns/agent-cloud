import { useState } from 'react';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PaymentTestModeBanner } from '@/components/PaymentTestModeBanner';
import { getStripe, getStripeEnvironment } from '@/lib/stripe';
import { createManagedCheckout, createManagedPortal } from '@/lib/payments.functions';
import type { PaymentProduct } from '@/lib/billing/payment-rules';
import { useServerFn } from '@/hooks/use-server-fn';
import { toast } from 'sonner';
export function useBillingCheckout() {
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
   <DialogHeader className="p-5 pb-0"><DialogTitle>Complete your subscription</DialogTitle></DialogHeader>
   <PaymentTestModeBanner />
   {clientSecret && <EmbeddedCheckoutProvider key={clientSecret} stripe={getStripe()} options={{ clientSecret }}><EmbeddedCheckout /></EmbeddedCheckoutProvider>}
   <div className="p-4"><Button variant="outline" onClick={() => setClientSecret(null)}>Close</Button></div>
  </DialogContent>
 </Dialog>;
 return { ...mutation, element };
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
