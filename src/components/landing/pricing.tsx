/**
 * Three licences, and what separates them.
 *
 * Every figure here comes from `PRICING` through `useLandingPricing`, which is
 * the same object the billing math uses. Typing a price into this file would
 * be how the page and the invoice come to disagree — and they did: this
 * section used to promise fifteen included agents and $25 for each one after,
 * a charge the agency checkout has never made.
 *
 * The comparison table exists to answer one question honestly: is the base
 * product crippled without Nova? It is not, and the table is laid out so that
 * shows — record keeping, production, contracting and finances are all in the
 * licence. Nova adds automation and prioritisation on top.
 */

import { Link } from "@tanstack/react-router";
import { Check, Minus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { track } from "@/lib/landing-analytics";
import { LandingSection, SectionHead, FadeUp, display } from "./primitives";

type Plan = {
  key: string;
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  features: string[];
  cta: { label: string; href: string; event: "solo_cta_clicked" | "agency_cta_clicked" | "nova_cta_clicked" };
  featured?: boolean;
  badge?: string;
  note?: string;
};

export function PricingSection({
  pricing, checkoutReady,
}: { pricing: Record<string, number>; checkoutReady: boolean }) {
  const plans: Plan[] = [
    {
      key: "solo",
      name: "Solo",
      price: money(pricing.soloAgent),
      cadence: "/month",
      blurb: "For an individual agent running their own business.",
      features: [
        "Personal dashboard and production",
        "Pipeline and client management",
        "Deal posting",
        "Book of business",
        "Calendar",
        "My Contracts and writing numbers",
        "Personal finances and commission schedule",
        "Retention tracking",
      ],
      cta: {
        label: checkoutReady ? "Start solo" : "Request a demo",
        href: checkoutReady ? "/signup" : "/demo",
        event: "solo_cta_clicked",
      },
    },
    {
      key: "agency",
      name: "Agency",
      price: money(pricing.agencyBase),
      cadence: "/month",
      blurb: "For an agency that wants one system for the whole organisation.",
      featured: true,
      badge: "Best for teams",
      features: [
        "Everything in Solo",
        "Unlimited agents — no seat charges",
        "Team and hierarchy management",
        "Agency-wide leaderboard",
        "Agent invitations and onboarding",
        "Contracting operations",
        "Compensation levels and override tracking",
        "Agency reporting and administration",
        "Nova profit share eligibility",
      ],
      cta: { label: "Book a demo", href: "/demo", event: "agency_cta_clicked" },
      note: "One flat price however many agents you have. Adding an agent does not change the bill.",
    },
    {
      key: "nova",
      name: "Nova AI",
      price: money(pricing.novaPro),
      cadence: "/month per agent",
      blurb: "The automation layer for follow-up, retention and client relationships.",
      features: [
        "Lapse-risk scan across your in-force book",
        "Birthday, anniversary and lapse follow-up automations",
        "Annual policy review agendas",
        "Answers grounded in your own records",
        "Compliance screening on AI-drafted messages",
      ],
      cta: { label: "Add Nova AI", href: "/signup", event: "nova_cta_clicked" },
      note: "Requires an active Solo or Agency licence.",
    },
  ];

  return (
    <LandingSection id="pricing" event="pricing_viewed" className="border-t border-border">
      <SectionHead
        eyebrow="Pricing"
        title="Simple pricing that grows with your business."
        copy="Choose the licence that fits. Add Nova only when you want the automation."
      />

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {plans.map((p, i) => (
          <FadeUp key={p.key} delay={i * 70}>
            <div
              className={cn(
                "flex h-full flex-col rounded-[var(--radius)] border bg-surface-1 p-6 md:p-7",
                p.featured ? "border-2 border-primary/50 shadow-sm" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {p.name}
                </h3>
                {p.badge && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    {p.badge}
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="tnum text-4xl font-bold text-foreground" style={display}>
                  {p.price}
                </span>
                <span className="text-sm text-muted-foreground">{p.cadence}</span>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{p.blurb}</p>

              <ul className="mt-5 flex-1 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="leading-relaxed">{f}</span>
                  </li>
                ))}
              </ul>

              {p.note && (
                <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{p.note}</p>
              )}

              <Button
                asChild
                className="mt-5 w-full"
                variant={p.featured ? "default" : "outline"}
                onClick={() => track(p.cta.event)}
              >
                <Link to={p.cta.href}>{p.cta.label}</Link>
              </Button>
            </div>
          </FadeUp>
        ))}
      </div>

      {/* The agency-sponsored rate. Its own line rather than a fourth card:
          it is a variation on Nova, not a separate product to choose between. */}
      <FadeUp>
        <div className="mt-6 flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-surface-2 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">
                Sponsoring Nova for your agents?
              </span>{" "}
              An agency can buy Nova on an agent's behalf at{" "}
              <span className="tnum font-semibold text-foreground">
                {money(pricing.novaSponsored)}/month per active agent
              </span>
              . Sponsored subscriptions do not also earn profit share.
            </p>
          </div>
        </div>
      </FadeUp>

      <ComparisonTable />
    </LandingSection>
  );
}

type Row = { feature: string; solo: boolean; agency: boolean; nova: boolean | "adds" };

const ROWS: Row[] = [
  { feature: "Pipeline, clients and deal posting", solo: true, agency: true, nova: false },
  { feature: "Book of business and policy records", solo: true, agency: true, nova: false },
  { feature: "Personal production and dashboard", solo: true, agency: true, nova: false },
  { feature: "My Contracts and writing numbers", solo: true, agency: true, nova: false },
  { feature: "Commission schedule and finances", solo: true, agency: true, nova: false },
  { feature: "Retention tracking", solo: true, agency: true, nova: "adds" },
  { feature: "Unlimited agents, no seat charges", solo: false, agency: true, nova: false },
  { feature: "Team hierarchy and invitations", solo: false, agency: true, nova: false },
  { feature: "Agency leaderboard", solo: false, agency: true, nova: false },
  { feature: "Contracting operations", solo: false, agency: true, nova: false },
  { feature: "Compensation levels and overrides", solo: false, agency: true, nova: false },
  { feature: "Lapse-risk scoring across the book", solo: false, agency: false, nova: true },
  { feature: "Client message automations", solo: false, agency: false, nova: true },
  { feature: "Answers grounded in your records", solo: false, agency: false, nova: true },
];

function ComparisonTable() {
  return (
    <div className="mt-12">
      <h3 className="text-center text-lg font-semibold text-foreground" style={display}>
        What is in each licence
      </h3>
      {/* The base product is not deliberately broken without Nova. The first
          six rows are ticked in both licences, and that is the honest shape. */}
      <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
        Record keeping, production, contracting and finances are in the licence. Nova adds
        automation and prioritisation on top of them.
      </p>

      <div className="mt-6 overflow-x-auto rounded-[var(--radius)] border border-border">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">
            Features included in the Solo licence, the Agency licence, and the Nova AI add-on
          </caption>
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th scope="col" className="px-4 py-3 text-left font-semibold text-foreground">
                Feature
              </th>
              <th scope="col" className="px-4 py-3 text-center font-semibold text-foreground">Solo</th>
              <th scope="col" className="px-4 py-3 text-center font-semibold text-foreground">Agency</th>
              <th scope="col" className="px-4 py-3 text-center font-semibold text-foreground">
                Nova AI
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.feature} className="border-b border-border last:border-0">
                <th scope="row" className="px-4 py-3 text-left font-normal text-muted-foreground">
                  {r.feature}
                </th>
                <Cell on={r.solo} />
                <Cell on={r.agency} />
                <Cell on={r.nova} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ on }: { on: boolean | "adds" }) {
  if (on === "adds") {
    return (
      <td className="px-4 py-3 text-center">
        <span className="text-xs font-medium text-primary">Adds automation</span>
      </td>
    );
  }
  return (
    <td className="px-4 py-3 text-center">
      {on ? (
        <>
          <Check className="mx-auto h-4 w-4 text-primary" aria-hidden />
          <span className="sr-only">Included</span>
        </>
      ) : (
        <>
          <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" aria-hidden />
          <span className="sr-only">Not included</span>
        </>
      )}
    </td>
  );
}
