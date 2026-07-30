import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { track } from "@/lib/landing-analytics";
import { BrandLogo } from "@/components/brand-logo";
import { LandingSection, SectionHead, display } from "./primitives";

// ── FAQ ─────────────────────────────────────────────────────────────────────

export function faqItems(pricing: Record<string, number>) {
  return [
    {
      q: "Is Agent Cloud an IMO or FMO?",
      a: "No. Agent Cloud is a software platform. Agencies maintain their own carrier relationships and hierarchies.",
    },
    {
      q: "Does Agent Cloud take commission overrides?",
      a: "No. We charge a software subscription and nothing else.",
    },
    {
      q: "Who owns the agency's data?",
      a: "The agency does. You can export clients, policies, commissions, your agent roster and retention history at any time.",
    },
    {
      q: "Does the Solo Agent plan include Nova AI Pro?",
      a: `No. Nova AI Pro is a separate add-on at ${money(pricing.novaPro)} per user per month, available to both Solo Agents and agency users.`,
    },
    {
      q: "How many users are included in the Agency Plan?",
      a: `Up to ${pricing.includedSeats} active users are included. Each additional active user is ${money(pricing.seatOverage)} per month.`,
    },
    {
      q: "What counts as an active user?",
      a: "Anyone with access to your workspace. People you have invited who have not accepted are not billed, and neither are inactive or terminated agents.",
    },
    {
      q: "Can I invite staff or virtual assistants?",
      a: "Yes. Agency owners can invite staff users and control exactly what each of them can see and do.",
    },
    {
      q: "Can staff see commission or billing information?",
      a: "Only if the agency owner grants that permission. Sensitive fields are restricted by default.",
    },
    {
      q: "Can I import my current book of business?",
      a: "Yes, through CSV import with column mapping. Carrier book sync can then keep policy statuses current.",
    },
    {
      q: "Does Agent Cloud integrate with SureLC and NIPR?",
      a: "Both are in beta. SureLC single sign-on and NIPR/PDB license lookup work today; we are still hardening them across accounts.",
    },
    {
      q: "Can agencies purchase Nova for their agents?",
      a: "Yes. An agency can buy Nova seats and assign them. If an agent already pays for Nova personally, their own subscription takes precedence and the agency seat stays in reserve.",
    },
    {
      q: "Can I upgrade from Solo to Agency?",
      a: "Yes, at any time. Your clients, policies and commissions come with you — it is the same workspace with team features unlocked.",
    },
    {
      q: "Can I cancel?",
      a: "Yes. Subscriptions are monthly and you can cancel from the billing portal. Access continues to the end of the period you have paid for.",
    },
  ];
}

export function FaqSection({ pricing }: { pricing: Record<string, number> }) {
  const items = faqItems(pricing);
  const [open, setOpen] = useState<number | null>(0);

  return (
    <LandingSection id="faq" className="border-t border-border/60 bg-surface-2/30">
      <SectionHead eyebrow="Questions" title="Frequently asked questions." />

      <div className="mx-auto mt-12 max-w-3xl space-y-2">
        {items.map((it, i) => {
          const on = open === i;
          return (
            <div key={it.q} className="overflow-hidden rounded-xl border border-border bg-card">
              <button
                onClick={() => { setOpen(on ? null : i); if (!on) track("faq_opened", { question: it.q }); }}
                aria-expanded={on}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="text-sm font-semibold text-foreground">{it.q}</span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", on && "rotate-180")} />
              </button>
              {on && (
                <p className="border-t border-border-soft px-5 py-4 text-sm text-muted-foreground leading-relaxed">
                  {it.a}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </LandingSection>
  );
}

// ── Final CTA ───────────────────────────────────────────────────────────────

export function FinalCta({ ctaLabel, ctaHref }: { ctaLabel: string; ctaHref: string }) {
  return (
    <LandingSection className="border-t border-border/60">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground" style={display}>
          Run your agency from one connected platform.
        </h2>
        <p className="mt-5 text-muted-foreground leading-relaxed">
          Replace scattered spreadsheets, disconnected tools, and manual workflows with an
          operating system built specifically for insurance agencies.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to={ctaHref} onClick={() => track("hero_cta_clicked", { surface: "final" })}>
            <Button size="lg" className="w-full sm:w-auto">{ctaLabel}</Button>
          </Link>
          <a href="#pricing">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">View Pricing</Button>
          </a>
        </div>
      </div>
    </LandingSection>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────────

export function LandingFooter() {
  const cols: { title: string; links: { label: string; href: string; to?: boolean }[] }[] = [
    {
      title: "Product",
      links: [
        { label: "Platform", href: "#platform" },
        { label: "Live demo", href: "#demo" },
        { label: "Pricing", href: "#pricing" },
        { label: "FAQ", href: "#faq" },
      ],
    },
    {
      title: "Solutions",
      links: [
        { label: "Agency owners", href: "#roles" },
        { label: "Solo agents", href: "#pricing" },
        { label: "Agency lifecycle", href: "#lifecycle" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "Request a demo", href: "/demo", to: true },
        { label: "Contact", href: "mailto:hello@useagentcloud.com" },
        { label: "Sign in", href: "/login", to: true },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy Policy", href: "/privacy", to: true },
        { label: "Terms of Service", href: "/terms", to: true },
        { label: "Cookie Policy", href: "/cookies", to: true },
      ],
    },
  ];

  return (
    <footer className="border-t border-border/60 bg-surface-2/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <div className="flex items-center gap-2">
              <BrandLogo size={28} rounded="rounded-md" />
              <span className="font-bold tracking-[0.14em] text-foreground" style={display}>AGENT CLOUD</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground leading-relaxed">
              The operating system for independent insurance agencies.
            </p>
          </div>

          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">{c.title}</p>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.to ? (
                      <Link to={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        {l.label}
                      </Link>
                    ) : (
                      <a href={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        {l.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground tnum">
            © {new Date().getFullYear()} Agent Cloud. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Agent Cloud is a software platform, not an insurance agency, IMO, or FMO.
          </p>
        </div>
      </div>
    </footer>
  );
}
