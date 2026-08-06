import { Link } from "@tanstack/react-router";
import { Check, Sparkles, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { track } from "@/lib/landing-analytics";
import { LandingSection, SectionHead, FadeUp, display } from "./primitives";

type Props = {
  pricing: Record<string, number>;
  /** When Stripe is unconfigured, purchase CTAs route to the demo form
      instead of a checkout that would fail. */
  checkoutReady: boolean;
};

/**
 * Pricing.
 *
 * Two plans, and only two. Nova AI Pro is an add-on that sits on top of
 * whichever plan you are on — putting it in the plan row implied it was a
 * third thing to choose between, which is the opposite of how it is sold.
 * It gets its own band below, as does White Label.
 */
export function PricingSection({ pricing, checkoutReady }: Props) {
  const soloHref = checkoutReady ? "/signup/agent" : "/demo";
  const agencyHref = checkoutReady ? "/signup" : "/demo";

  const plans = [
    {
      key: "solo",
      name: "Solo Agent",
      price: money(pricing.soloAgent),
      blurb: "For one producer running their own book.",
      features: [
        "Clients and policies",
        "Book of business",
        "Commission tracking",
        "Lapse alerts",
        "Tasks and documents",
        "Personal analytics",
      ],
      cta: checkoutReady ? "Start Solo" : "Request a Demo",
      href: soloHref,
      featured: false,
    },
    {
      key: "agency",
      name: "Agency",
      price: money(pricing.agencyBase),
      blurb: `Everything in Solo, for your whole team. Includes up to ${pricing.includedSeats} active users.`,
      features: [
        "Recruiting and onboarding",
        "Licensing and contracting",
        "Staff accounts and permissions",
        "Conservation queues",
        "Commission reconciliation",
        "Agency reporting",
      ],
      cta: checkoutReady ? "Start Your Agency" : "Request a Demo",
      href: agencyHref,
      featured: true,
    },
  ];

  return (
    <LandingSection id="pricing" event="pricing_viewed" className="border-t border-border/60">
      <SectionHead
        eyebrow="Pricing"
        title="Two plans. No commission overrides."
        copy="Pick the one that matches your operation. Add-ons are separate, and optional."
      />

      {!checkoutReady && (
        <p className="mx-auto mt-6 max-w-xl rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-center text-sm text-muted-foreground">
          Self-serve checkout is not open yet. Request a demo and we will get your workspace set up.
        </p>
      )}

      {/* ── The plans ── */}
      <div className="mx-auto mt-10 grid max-w-3xl gap-5 md:grid-cols-2 items-start">
        {plans.map((p, i) => (
          <FadeUp key={p.key} delay={i * 90}>
            <div
              className={cn(
                "ac-lift flex h-full flex-col rounded-2xl border p-6",
                p.featured
                  ? "border-primary/50 bg-primary/[0.05] shadow-lg shadow-primary/5"
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
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{p.blurb}</p>

              <ul className="mt-5 flex-1 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>

              {p.featured && (
                <p className="mt-5 text-xs text-muted-foreground leading-relaxed">
                  {money(pricing.seatOverage)}/month per additional active user. An active user is
                  anyone with workspace access — pending invitations are not billed until accepted.
                </p>
              )}

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

      {/* ── Add-ons, deliberately below and visually distinct from the plans ── */}
      <FadeUp delay={200}>
        <div className="mx-auto mt-10 max-w-3xl">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Optional add-ons
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {/* Side by side above 1024px. Stacked, the two add-on cards were
              ~500px of a section that already had the plans above it — and
              they are alternatives to each other, not a sequence. */}
          <div className="mt-5 grid gap-3 lg:grid-cols-2 lg:items-start">
            {/* Nova */}
            <div className="ac-lift rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between lg:flex-col lg:gap-4">
                <div className="max-w-md">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <h3 className="text-lg font-bold text-foreground" style={display}>Nova AI Pro</h3>
                  </div>
                  <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed">
                    An operations assistant inside your agency's records — summarizing activity,
                    surfacing lapse risk, drafting follow-ups and creating tasks. It only reads
                    what the person using it is already allowed to see.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Adds to either plan. Not included in Solo or Agency.
                  </p>
                </div>
                <div className="shrink-0 sm:text-right lg:text-left">
                  <p className="tnum text-2xl font-bold text-foreground" style={display}>
                    {money(pricing.novaPro)}
                    <span className="text-sm font-normal text-muted-foreground">/user/mo</span>
                  </p>
                  <Link
                    to={checkoutReady ? "/signup" : "/demo"}
                    className="mt-3 inline-block"
                    onClick={() => track("plan_selected", { plan: "nova" })}
                  >
                    <Button variant="outline" size="sm">Add Nova Pro</Button>
                  </Link>
                </div>
              </div>
            </div>

            {/* White label */}
            <div className="ac-lift rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between lg:flex-col lg:gap-4">
                <div className="max-w-md">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Palette className="h-4 w-4" />
                    </span>
                    <h3 className="text-lg font-bold text-foreground" style={display}>White Label</h3>
                  </div>
                  <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed">
                    Your branding, your colors, your domain, and a branded login. Requires an active
                    Agency Plan.
                  </p>
                </div>
                <div className="shrink-0 sm:text-right lg:text-left">
                  <p className="tnum text-2xl font-bold text-foreground" style={display}>
                    {money(pricing.whiteLabelMonthly)}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </p>
                  <p className="tnum text-xs text-muted-foreground">
                    + {money(pricing.whiteLabelSetup)} setup
                  </p>
                  <Link to="/demo" className="mt-3 inline-block" onClick={() => track("plan_selected", { plan: "white_label" })}>
                    <Button variant="outline" size="sm">Contact Sales</Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </FadeUp>
    </LandingSection>
  );
}
