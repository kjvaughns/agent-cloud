/**
 * Nova, told as outcomes — and labelled honestly.
 *
 * ── The labels are the point ──
 *
 * The temptation on an AI section is to list everything the roadmap contains
 * and let the reader assume it all works. An agency owner who buys on that and
 * finds three of the four groups empty does not come back, and in this market
 * they tell everyone.
 *
 * So every line below carries the state it is actually in, and the states were
 * read off the code rather than guessed:
 *
 *   live      `lapse_scan`, `review_prep` and `compliance_screen` are the three
 *             gated Nova features in `nova-features.ts`; the automation worker
 *             sends on `birthday`, `policy_anniversary`, `lapse_follow_up` and
 *             `custom_date` triggers; `askAiAssistant` answers against the
 *             records the asker is allowed to see.
 *
 *   soon      Everything with no code behind it today. Not a soft claim — an
 *             explicit "not yet", so nobody buys the licence for it.
 *
 * If a capability moves, the label moves with it. A line that says "live" here
 * and does nothing in the product is the worst thing on this page.
 */

import { Link } from "@tanstack/react-router";
import {
  ShieldAlert, HeartHandshake, Route, Brain, ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { track } from "@/lib/landing-analytics";
import { LandingSection, SectionHead, FadeUp, StatusPill, display } from "./primitives";
import { NOVA_GROUPS, type NovaGroup } from "@/lib/landing/nova-capabilities";

const ICONS: Record<NovaGroup["key"], LucideIcon> = {
  retention: ShieldAlert,
  relationships: HeartHandshake,
  pipeline: Route,
  intelligence: Brain,
};

export function NovaSection({ novaPrice }: { novaPrice: number }) {
  return (
    <LandingSection id="nova" event="nova_viewed" className="border-t border-border">
      <SectionHead
        eyebrow="Meet Nova AI"
        title="Agent Cloud organises your business. Nova helps run it."
        copy="Nova watches your pipeline and your book, works out what needs attention, and helps you get to it before a policy lapses or a lead goes cold."
      />

      {/* Said once, plainly, above the grid — so nobody has to infer it from
          the pills and nobody can say they were misled. */}
      <p className="mx-auto mt-5 max-w-2xl text-center text-sm text-muted-foreground">
        Marked <span className="font-semibold text-success">Available</span> means it works
        today. <span className="font-semibold text-foreground">Coming soon</span> means it does
        not yet — do not buy the licence for those.
      </p>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {NOVA_GROUPS.map((g, i) => (
          <FadeUp key={g.title} delay={i * 60}>
            <div className="h-full rounded-[var(--radius)] border border-border bg-surface-1 p-6">
              <div className="flex items-start gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
                  aria-hidden
                >
                  {(() => { const Icon = ICONS[g.key]; return <Icon className="h-4.5 w-4.5" />; })()}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-foreground">{g.title}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">{g.blurb}</p>
                </div>
              </div>
              <ul className="mt-4 space-y-2.5">
                {g.items.map((it) => (
                  <li key={it.text} className="flex items-start justify-between gap-3">
                    <span className="text-sm leading-relaxed text-muted-foreground">{it.text}</span>
                    <span className="shrink-0 pt-0.5">
                      <StatusPill status={it.state} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </FadeUp>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg" onClick={() => track("nova_cta_clicked")}>
          <Link to="/signup">
            Add Nova AI — {money(novaPrice)}/month <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/demo" onClick={() => track("demo_cta_clicked")}>See what Nova can do</Link>
        </Button>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Nova requires an active Solo or Agency licence.
      </p>
    </LandingSection>
  );
}

/**
 * The agency profit share.
 *
 * Deliberately plain about what it is and is not. The wording avoids anything
 * that reads as an investment, guaranteed income, or insurance compensation —
 * it is a software referral incentive, and describing it as anything else
 * would be a problem for the reader as much as for us.
 *
 * The 20% is real: `PRICING.novaPartnerRate`, with a per-organisation override
 * and a `nova_partner_commissions` ledger behind it.
 */
export function ProfitShareSection({
  novaPrice, rate,
}: { novaPrice: number; rate: number }) {
  const agents = 150;
  const monthly = agents * novaPrice;
  const share = monthly * rate;
  const pct = Math.round(rate * 100);

  return (
    <LandingSection id="profit-share" event="profit_share_viewed" className="border-t border-border">
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            For agency owners
          </p>
          <h2
            className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-balance text-foreground"
            style={display}
          >
            Help your agents automate more. Earn when they upgrade.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Paid Agency Licence customers earn {pct}% recurring profit share when their agents
            buy Nova AI through the agency.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Profit share is available only while the Agency Licence is active, and is subject to
            payout, refund, attribution and eligibility terms. Seats an agency sponsors on behalf
            of an agent do not also earn profit share. This is a software adoption incentive — it
            is not an investment, not guaranteed income, and not insurance compensation.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button asChild onClick={() => track("agency_cta_clicked")}>
              <Link to="/demo">Book an agency demo</Link>
            </Button>
          </div>
        </div>

        <FadeUp>
          <div className="rounded-[var(--radius)] border border-border bg-surface-1 p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Worked example
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <Line label={`${agents} agents on Nova at ${money(novaPrice)}/month`} value={money(monthly)} />
              <Line label={`Your share at ${pct}%`} value={money(share)} accent />
            </dl>
            <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              An illustration of the arithmetic, not a projection. What an agency actually earns
              depends on how many of its agents choose to buy Nova themselves.
            </p>
          </div>
        </FadeUp>
      </div>
    </LandingSection>
  );
}

function Line({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          accent
            ? "tnum text-2xl font-bold text-primary"
            : "tnum text-lg font-semibold text-foreground"
        }
        style={accent ? display : undefined}
      >
        {value}/mo
      </dd>
    </div>
  );
}
