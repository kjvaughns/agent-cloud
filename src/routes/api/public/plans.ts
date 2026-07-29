import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { guardPublicEndpoint } from "@/lib/rate-limit";
import { PRICING, pricingFromPlans } from "@/lib/billing/pricing";

/**
 * Public pricing.
 *
 * Serves the plans table so the marketing page and Stripe Checkout cannot
 * drift apart. Falls back to the code constants when the table is empty or
 * unreachable — a pricing lookup failure must not blank out the pricing
 * section of the landing page.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/plans")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),

      GET: async ({ request }) => {
        const limited = await guardPublicEndpoint(request, "plans", { perIp: 120, global: 10000, headers: cors });
        if (limited) return limited;

        let pricing: Record<string, number> = { ...PRICING };
        try {
          const { data } = await (supabaseAdmin as any)
            .from("plans")
            .select("key, name, monthly_price, setup_price, included_seats, seat_overage_price, description")
            .eq("active", true);
          pricing = { ...pricingFromPlans(data as any) };
        } catch {
          // Keep the constants.
        }

        // Whether self-serve checkout can actually complete. The landing page
        // uses this to decide between "Start Free" and "Request a Demo" —
        // a CTA must never lead into an unfinished workflow.
        const checkoutReady = Boolean(process.env.STRIPE_SECRET_KEY);

        return new Response(JSON.stringify({ pricing, checkoutReady }), {
          headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
        });
      },
    },
  },
});
