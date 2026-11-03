export function PaymentTestModeBanner() {
 const token = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;
 if (token?.startsWith('pk_live_')) return null;
 return <div className="w-full border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-sm text-foreground">{token?.startsWith('pk_test_') ? 'Test payments — no real money will be charged.' : 'Live payments are not configured yet.'}</div>;
}
