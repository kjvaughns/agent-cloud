import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLandingPricing } from "@/hooks/use-landing-pricing";
import { track } from "@/lib/landing-analytics";
import { display } from "@/components/landing/primitives";
import { AnnouncementBar, LandingNav, StickyMobileCta } from "@/components/landing/nav";
import { ProblemSection, OwnershipSection } from "@/components/landing/story";
import { LifecycleSection } from "@/components/landing/lifecycle";
import { FeatureBands } from "@/components/landing/tour";
import { PricingSection } from "@/components/landing/pricing";
import { LiveDemos, LiveDashboard } from "@/components/landing/live-demos";
import { FloatingOrbs, Parallax } from "@/components/landing/motion";
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
      description: "The operating system for independent insurance agencies.",
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
        { "@type": "Offer", name: "Nova AI Pro", price: String(PRICING.novaPro), priceCurrency: "USD" },
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
      { title: "Agent Cloud | Insurance Agency Management Software" },
      {
        name: "description",
        content:
          "Contracting, placement, persistency, chargebacks and overrides in one place. Check every carrier statement against your comp grid, rank the in-force book for lapse risk, and show every agent their own numbers.",
      },
      { property: "og:title", content: "Agent Cloud | Insurance Agency Management Software" },
      {
        property: "og:description",
        content:
          "One record per agent, from the day you recruit them to the renewal you're still getting paid on. We're software, not an IMO — we never take an override.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE },
      { property: "og:image", content: `${SITE}/og-image.svg` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Agent Cloud | Insurance Agency Management Software" },
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

  // A CTA must never lead into a workflow that cannot complete. Until Stripe
  // is configured, checkout would fail, so the primary action becomes the
  // demo form instead of a dead-ended signup.
  const ctaLabel = checkoutReady ? "Start Free" : "Request a Demo";
  const ctaHref = checkoutReady ? "/signup" : "/demo";

  if (checking) {
    return (
      <div className="dark min-h-screen grid place-items-center bg-background text-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }


  return (
    <div id="top" className="dark min-h-screen bg-background text-foreground antialiased">
      <AnnouncementBar />
      <LandingNav ctaLabel={ctaLabel} ctaHref={ctaHref} />

      <Hero ctaLabel={ctaLabel} ctaHref={ctaHref} />

      {/* The argument, in order: here is the pain, here is the specific reason
          it happens, here is the mechanism that fixes it, here is that
          mechanism doing three jobs, here is the product to touch.
          
          The page used to inventory the product three times over — a 12-card
          map, a 15-tab gallery and a 25-chip grid, back to back, with three
          different counts of the same thing. A visitor passed four complete
          pitches before reaching a price. One inventory now: the bands. */}
      <ProblemSection />
      <LifecycleSection />
      <FeatureBands />
      <LiveDemos />

      <PricingSection pricing={pricing} checkoutReady={checkoutReady} />
      <OwnershipSection />
      <FaqSection pricing={pricing} />

      <FinalCta ctaLabel={ctaLabel} ctaHref={ctaHref} />
      <LandingFooter />
      <StickyMobileCta ctaLabel={ctaLabel} ctaHref={ctaHref} />
    </div>
  );
}

function Hero({ ctaLabel, ctaHref }: { ctaLabel: string; ctaHref: string }) {
  return (
    <section className="relative overflow-hidden">
      <FloatingOrbs />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(700px 400px at 15% 0%, color-mix(in srgb, var(--gold) 12%, transparent), transparent 60%)",
        }}
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-10 pb-14 md:pt-14 md:pb-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Now taking founding agencies
          </div>

          {/*
            Back to the ten-tools headline, chosen over two later rewrites.

            The copy deck argued this one "describes our category rather than
            their problem", and that its replacement — "none of them tell you
            what stuck" — was sharper. It is sharper, and it also asks the
            visitor to already believe there is something they are not seeing.
            This one names the thing they can see from where they are standing,
            and the subhead is the answer to it. Picked on the strength of the
            page as a whole rather than the line on its own.
          */}
          <h1
            className="mt-6 font-bold tracking-tight text-balance text-4xl sm:text-5xl md:text-6xl leading-[1.02] text-foreground"
            style={display}
          >
            Stop running your agency across{" "}
            <span className="text-primary">ten different tools.</span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            One record per person, from applicant to producing agent. Nothing retyped between
            recruiting, licensing, contracting and commissions.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={ctaHref} onClick={() => track("hero_cta_clicked", { label: ctaLabel })}>
              <Button size="lg" className="w-full sm:w-auto">
                {ctaLabel} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
            <a href="#demo">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">Try the demo</Button>
            </a>
          </div>

          {/*
            Risk reversal, above the fold. An earlier pass deleted the chips
            that sat here for duplicating the ownership section, and that was
            right about the two it had — "no overrides" and "you own your
            data" both get said properly further down.

            These earn the space because the third one is new and is the one
            this audience has actually been burned by: non-refundable
            prepayment and an upline who will not release you. "Month to
            month" answers that in three words, and it has to be answered
            before they scroll, not after.
          */}
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {[
              "We don't take an override",
              "Your book, your data, export any time",
              "Month to month — no contract",
            ].map((r) => (
              <li key={r} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" /> {r}
              </li>
            ))}
          </ul>
        </div>

        <Parallax strength={14}>
          <LiveDashboard />
        </Parallax>
      </div>
    </section>
  );
}
