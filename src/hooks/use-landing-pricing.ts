import { useEffect, useState } from "react";
import { PRICING } from "@/lib/billing/pricing";

export type LandingPricing = {
  pricing: Record<string, number>;
  /** False when Stripe is unconfigured — every purchase CTA would dead-end. */
  checkoutReady: boolean;
};

/**
 * Pricing for the marketing page, from the plans table.
 *
 * Starts from the code constants so the section renders immediately and never
 * flashes empty, then overlays whatever the server returns.
 *
 * checkoutReady starts false deliberately: until we know Stripe can complete a
 * purchase, the page shows "Request a Demo" rather than a button that leads
 * into a broken flow.
 */
export function useLandingPricing(): LandingPricing {
  const [state, setState] = useState<LandingPricing>({
    pricing: { ...PRICING },
    checkoutReady: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/plans")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setState({
          pricing: { ...PRICING, ...(d.pricing ?? {}) },
          checkoutReady: Boolean(d.checkoutReady),
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return state;
}
