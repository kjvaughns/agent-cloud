import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLandingPricing } from "@/hooks/use-landing-pricing";
import { track } from "@/lib/landing-analytics";
import { display } from "@/components/landing/primitives";
import { AnnouncementBar, LandingNav, StickyMobileCta } from "@/components/landing/nav";
import { OwnershipSection } from "@/components/landing/story";
import { WorkflowSection } from "@/components/landing/workflow";
import { ProductStories, AudienceSplit } from "@/components/landing/product-stories";
import { NovaSection, ProfitShareSection } from "@/components/landing/nova-section";
import { PricingSection } from "@/components/landing/pricing";
import { LiveDemos, LiveDashboard } from "@/components/landing/live-demos";
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
  component: LandingPage,
});


function LandingPage() {
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

  return (
    /* Light, per the redesign: warm neutral ground, charcoal type, gold used
       as an accent rather than a wash. The product itself is dark, so each
       rendered product screen carries `.dark` locally — which is what makes
       them read as the application rather than as illustrations of it. */
    <div id="top" className="min-h-screen bg-background text-foreground antialiased">
      <AnnouncementBar />
      <LandingNav ctaLabel={ctaLabel} ctaHref={ctaHref} />

      <Hero ctaLabel={ctaLabel} ctaHref={ctaHref} />

      {/* The order answers the questions in the order they are asked: what is
          it, how does the work connect, what do I use every day, which of the
          two am I, what does Nova do, what does it cost, what do I do next. */}
      <WorkflowSection />
      <ProductStories />
      <LiveDemos />
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

function Hero({ ctaLabel, ctaHref }: { ctaLabel: string; ctaHref: string }) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* One restrained wash of brand gold. No orbs, no parallax: the product
          screen below is the thing worth looking at, and motion behind it
          competes with it while costing frames on a phone. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 420px at 50% -10%, color-mix(in srgb, var(--gold) 10%, transparent), transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-12 pb-16 md:pt-16 md:pb-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            Built for life insurance agents and agencies
          </p>

          <h1
            className="mt-5 font-bold tracking-tight text-balance text-4xl sm:text-5xl md:text-6xl leading-[1.03] text-foreground"
            style={display}
          >
            Run your entire insurance business{" "}
            <span className="text-primary">from one place.</span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Manage your pipeline, post deals, track your book of business, compete on a live
            leaderboard, handle contracts and hierarchy, and automate client follow-up with
            Nova AI.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={ctaHref} onClick={() => track("hero_cta_clicked", { label: ctaLabel })}>
              <Button size="lg" className="w-full sm:w-auto">
                {ctaLabel} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/demo" onClick={() => track("demo_cta_clicked")}>
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Book a demo
              </Button>
            </Link>
          </div>

          {/* Proof we can actually stand behind. No agent counts, no premium
              totals, no logos and no testimonials — none of those exist to
              quote yet, and inventing them is the one thing this page must
              not do. What is true is where it was built and how it is sold. */}
          <p className="mt-7 text-sm text-muted-foreground">
            Built inside a working life insurance agency, and used every day by real agents.
          </p>
          <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {[
              "We don't take an override",
              "Your book, your data, export any time",
              "Month to month — no contract",
            ].map((r) => (
              <li key={r} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" aria-hidden /> {r}
              </li>
            ))}
          </ul>
        </div>

        {/* The dashboard is the frame that says "this is a real platform".
            Dark, because that is what the product looks like. */}
        <div className="dark mt-12">
          <LiveDashboard />
        </div>
      </div>
    </section>
  );
}
