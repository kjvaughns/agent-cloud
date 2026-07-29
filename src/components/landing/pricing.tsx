import { Link } from "@tanstack/react-router";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { track } from "@/lib/landing-analytics";
import { LandingSection, SectionHead, FadeUp, StatusPill, display } from "./primitives";

type Props = {
  pricing: Record<string, number>;
  /** When Stripe is unconfigured, purchase CTAs route to the demo form
      instead of a checkout that would fail. */
  checkoutReady: boolean;
};

export function PricingSection({ pricing, checkoutReady }: Props) {
  const soloHref = checkoutReady ? "/signup/agent" : "/demo";
  const agencyHref = checkoutReady ? "/signup" : "/demo";
  const soloLabel = checkoutReady ? "Start Solo" : "Request a Demo";
  const agencyLabel = checkoutReady ? "Start Your Agency" : "Request a Demo";

  const plans = [
    {
      key: "solo",
      name: "Solo Agent",
      price: money(pricing.soloAgent),
      cadence: "/month",
      blurb: "For individual agents organizing their own business.",
      features: [
        "Personal CRM", "Client management", "Policy tracking", "Book of business",
        "Retention tools", "Commission tracking", "Tasks and documents", "Personal analytics",
      ],
      note: "Nova AI Pro sold separately.",
      cta: soloLabel,
      href: soloHref,
      featured: false,
    },
    {
      key: "agency",
      name: "Agency",
      price: money(pricing.agencyBase),
      cadence: "/month",
      blurb: `Includes up to ${pricing.includedSeats} active users. ${money(pricing.seatOverage)}/month per additional active user.`,
      features: [
        "Everything in Solo", "Recruiting pipeline", "Agent onboarding", "Licensing management",
        "Contracting workflows", "Staff accounts and role permissions", "Retention queues",
        "Commission reconciliation", "Agency reporting", "Support center",
      ],
      note: "An active user is anyone with access to your workspace. Pending invitations are not billed until accepted.",
      cta: agencyLabel,
      href: agencyHref,
      featured: true,
    },
    {
      key: "nova",
      name: "Nova AI Pro",
      price: money(pricing.novaPro),
      cadence: "/user/month",
      blurb: "An operations assistant that works inside your agency's records.",
      features: [
        "Context-aware assistance", "Activity summaries", "Retention risk surfacing",
        "Follow-up drafting", "Task creation", "Email automations",
      ],
      note: "Available to agency users and Solo Agents. Voice and SMS unlock when a phone provider is connected.",
      cta: "Add Nova Pro",
      href: checkoutReady ? "/signup" : "/demo",
      featured: false,
    },
  ];

  return (
    <LandingSection id="pricing" event="pricing_viewed" className="border-t border-border/60">
      <SectionHead
        eyebrow="Pricing"
        title="Priced for the whole agency, not per feature."
        copy="No commission overrides, no setup fee on the standard plans, and no charge for people you have invited but who have not joined."
      />

      {!checkoutReady && (
        <p className="mx-auto mt-6 max-w-xl rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-center text-sm text-muted-foreground">
          Self-serve checkout is not open yet. Request a demo and we will get your workspace set up.
        </p>
      )}

      <div className="mt-12 grid gap-5 lg:grid-cols-3 items-start">
        {plans.map((p, i) => (
          <FadeUp key={p.key} delay={i * 80}>
            <div
              className={cn(
                "flex h-full flex-col rounded-2xl border p-6",
                p.featured
                  ? "border-primary/50 bg-primary/[0.05] lg:-mt-3 lg:pb-8 shadow-lg shadow-primary/5"
                  : "border-border bg-card",
              )}
            >
              {p.featured && (
                <span className="mb-3 self-start rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-foreground">
                  Most agencies
                </span>
              )}
              <h3 className="text-xl font-bold text-foreground" style={display}>{p.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="tnum text-4xl font-bold text-foreground" style={display}>{p.price}</span>
                <span className="text-sm text-muted-foreground">{p.cadence}</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{p.blurb}</p>

              <ul className="mt-5 space-y-2 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>

              <p className="mt-5 text-xs text-muted-foreground leading-relaxed">{p.note}</p>

              <Link
                to={p.href}
                className="mt-5"
                onClick={() => track("plan_selected", { plan: p.key, checkoutReady })}
              >
                <Button className="w-full" variant={p.featured ? "default" : "outline"}>
                  {p.cta}
                </Button>
              </Link>
            </div>
          </FadeUp>
        ))}
      </div>

      {/* White label */}
      <FadeUp delay={240}>
        <div className="mt-6 flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-lg font-bold text-foreground" style={display}>White Label</h3>
              <StatusPill status="available" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Want Agent Cloud to look like your own proprietary agency platform? Custom branding,
              colors, logo, domain and a branded login experience. Requires an active Agency Plan.
            </p>
          </div>
          <div className="shrink-0 md:text-right">
            <p className="tnum text-2xl font-bold text-foreground" style={display}>
              {money(pricing.whiteLabelMonthly)}<span className="text-sm font-normal text-muted-foreground">/month</span>
            </p>
            <p className="tnum text-xs text-muted-foreground">
              + {money(pricing.whiteLabelSetup)} one-time setup
            </p>
            <Link to="/demo" className="mt-3 inline-block" onClick={() => track("plan_selected", { plan: "white_label" })}>
              <Button variant="outline" size="sm">Contact Sales</Button>
            </Link>
          </div>
        </div>
      </FadeUp>
    </LandingSection>
  );
}
