import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
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
        "Insurance agency management software that carries one file per person from recruit to renewal — licensing, carrier appointments, the book of business, commission reconciliation and lapse prevention, all off the same file.",
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
          "Get producers contracted faster, check every carrier commission statement against your comp grid, and rank the in-force book for lapse risk — recruiting, licensing, contracting, clients, policies and commissions in one system.",
      },
      { property: "og:title", content: "Agent Cloud | Insurance Agency Management Software" },
      {
        property: "og:description",
        content:
          "The operating system for independent insurance agencies. Recruit, contract, write, get paid correctly, and keep the business on the books — from one connected platform.",
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
  component: LandingPage,
});


function LandingPage() {
  const { pricing, checkoutReady } = useLandingPricing();

  // A CTA must never lead into a workflow that cannot complete. Until Stripe
  // is configured, checkout would fail, so the primary action becomes the
  // demo form instead of a dead-ended signup.
  const ctaLabel = checkoutReady ? "Start Free" : "Request a Demo";
  const ctaHref = checkoutReady ? "/signup" : "/demo";

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

          {/* Three clauses, three reasons an agency owner buys anything: write
              more, keep more of what you wrote, and grow the team doing it.
              The headline this replaces — "stop running your agency across ten
              different tools" — described our category rather than their
              problem. Nobody wakes up wanting fewer tools; they want a bigger
              check. */}
          <h1
            className="mt-6 font-bold tracking-tight text-balance text-4xl sm:text-5xl md:text-6xl leading-[1.02] text-foreground"
            style={display}
          >
            Write more. Keep more of it.{" "}
            <span className="text-primary">Grow the team that does it.</span>
          </h1>

          {/* Both halves are literally what the software does — no outcome
              claim we cannot show on a demo call. */}
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Recruiting, licensing, contracting, the book and commissions all run off one file per
            person — so nobody is sitting on paperwork instead of writing, and nobody is taking
            the carrier's math on faith.
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

          {/* The three reassurance chips that sat here — no overrides, you own
              your data, built for insurance — are the Ownership section's
              headline, its 0% figure and its four "we do not" cards, said
              first and worse. Making the promise twice does not make it twice
              as credible. */}
        </div>

        <Parallax strength={14}>
          <LiveDashboard />
        </Parallax>
      </div>
    </section>
  );
}
