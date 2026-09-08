import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useLandingPricing } from "@/hooks/use-landing-pricing";
import { AnnouncementBar, LandingNav, StickyMobileCta } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { OwnershipSection } from "@/components/landing/story";
import { WorkflowSection } from "@/components/landing/workflow";
import { ProductStories, AudienceSplit } from "@/components/landing/product-stories";
import { NovaSection, ProfitShareSection } from "@/components/landing/nova-section";
import { PricingSection } from "@/components/landing/pricing";
import { DealJourney } from "@/components/landing/deal-journey";
import {
  FaqSection, FinalCta, LandingFooter, faqItems,
} from "@/components/landing/support";
import { PRICING } from "@/lib/billing/pricing";


const SITE = "https://useagentcloud.com";

/**
 * Structured data. SoftwareApplication carries the offers so pricing can show
 * in search results; FAQPage mirrors the on-page accordion. Both must stay in
 * step with what the page actually says — mismatched schema is a penalty, not
 * a shortcut.
 */
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      name: "Agent Cloud",
      url: SITE,
      description: "The operating system for life insurance agents and agencies.",
    },
    {
      "@type": "SoftwareApplication",
      name: "Agent Cloud",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Insurance agency management software that carries one record per agent from recruit to renewal — contracting, licensing, placement, persistency, commission reconciliation against your comp grid, and chargebacks.",
      offers: [
        { "@type": "Offer", name: "Solo Agent", price: String(PRICING.soloAgent), priceCurrency: "USD" },
        { "@type": "Offer", name: "Agency", price: String(PRICING.agencyBase), priceCurrency: "USD" },
        { "@type": "Offer", name: "Nova AI", price: String(PRICING.novaPro), priceCurrency: "USD" },
        { "@type": "Offer", name: "Nova AI (agency sponsored)", price: String(PRICING.novaSponsored), priceCurrency: "USD" },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: faqItems(PRICING as unknown as Record<string, number>).map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export const Route = createFileRoute("/")({
  head: () => ({
    links: [{ rel: "canonical", href: SITE }],
    meta: [
      { title: "Agent Cloud | Life Insurance CRM and Agency Management Software" },
      {
        name: "description",
        content:
          "One place for life insurance agents and agencies to manage clients, post deals, track the book of business, run a live leaderboard, handle contracts and hierarchy, and automate client follow-up with Nova AI. Unlimited agents on the Agency licence.",
      },
      { property: "og:title", content: "Agent Cloud | Life Insurance CRM and Agency Management Software" },
      {
        property: "og:description",
        content:
          "Run your whole life insurance business from one place — pipeline, deals, book of business, leaderboard, contracts, finances and Nova AI. Software, not an IMO: we never take an override.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE },
      { property: "og:image", content: `${SITE}/og-image.svg` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Agent Cloud | Life Insurance CRM and Agency Management Software" },
      {
        name: "twitter:description",
        content: "The operating system for independent insurance agencies.",
      },
      { name: "twitter:image", content: `${SITE}/og-image.svg` },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(STRUCTURED_DATA),
      },
    ],
  }),
  validateSearch: (search): { stay?: string } => ({
    stay: search.stay === "1" ? "1" : undefined,
  }),
  component: LandingPage,
});

/**
 * Somebody already signed in on this browser should not have to walk past the
 * marketing page to reach their own numbers. The check is client-only on
 * purpose: the session lives in localStorage, so SSR cannot see it, and a
 * server-side gate here would loop. Crawlers and signed-out visitors get the
 * landing page exactly as before.
 *
 * `?stay=1` opts out, so an owner can still read pricing or share the site.
 */
function useSignedInRedirect(enabled: boolean) {
  const navigate = useNavigate();
  // Starts false so the first client render matches the server-rendered
  // landing markup; the effect flips it before anything is painted.
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setChecking(true);

    (async () => {
      let session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        // Same tolerance as the authenticated guard: a stale access token is
        // not the same thing as being signed out.
        try {
          session = (await supabase.auth.refreshSession()).data.session;
        } catch {
          session = null;
        }
      }
      if (cancelled) return;
      if (session) {
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      setChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, navigate]);

  return checking;
}

function LandingPage() {
  const { stay } = Route.useSearch();
  const checking = useSignedInRedirect(stay !== "1");
  const { pricing, checkoutReady } = useLandingPricing();

  /**
   * "Get started", never "Start free".
   *
   * There is no free trial in billing — no trial period on any Stripe price,
   * no trial state in signup. The page said "Start Free", which is a promise
   * checkout cannot keep, and the first thing a visitor met after clicking it
   * was a card form.
   *
   * A CTA must also never lead into a workflow that cannot complete, so until
   * Stripe is configured the primary action is the demo rather than a signup
   * that would dead-end.
   */
  const ctaLabel = checkoutReady ? "Get started" : "Book a demo";
  const ctaHref = checkoutReady ? "/signup" : "/demo";

  if (checking) {
    return (
      <div className="dark min-h-screen grid place-items-center bg-background text-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }


  return (
    /* Dark, matching the product itself. Warm charcoal ground, gold used as an
       accent rather than a wash — the rendered product screens carry `.dark`
       locally too, so they read as the application rather than illustrations. */
    <div id="top" className="min-h-screen bg-background text-foreground antialiased">
      <AnnouncementBar />
      <LandingNav ctaLabel={ctaLabel} ctaHref={ctaHref} />

      <Hero ctaLabel={ctaLabel} ctaHref={ctaHref} />

      {/* The order answers the questions in the order they are asked: what is
          it, what do I use every day, show me it working, which of the two am
          I, what does Nova do, what does it cost, what do I do next. The demo
          sits directly after the product section because it is the proof of
          the claim that section just made. */}
      <WorkflowSection />
      <ProductStories />
      <DealJourney />
      <AudienceSplit ctaHref={ctaHref} />

      <NovaSection novaPrice={pricing.novaPro} />
      <ProfitShareSection novaPrice={pricing.novaPro} rate={pricing.novaPartnerRate ?? 0.2} />

      <PricingSection pricing={pricing} checkoutReady={checkoutReady} />
      <OwnershipSection />
      <FaqSection pricing={pricing} />

      <FinalCta ctaLabel={ctaLabel} ctaHref={ctaHref} />
      <LandingFooter />
      <StickyMobileCta ctaLabel={ctaLabel} ctaHref={ctaHref} />
    </div>
  );
}

