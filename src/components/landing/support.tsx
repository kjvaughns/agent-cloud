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

/**
 * The four questions this buyer actually asks, in the order they ask them.
 *
 * Not the four we most want to answer. An agency owner evaluating software
 * sold into their industry opens with "are you one of them" — because most
 * agency software is IMO-provided and comes with a hook in the comp. The seat
 * mechanics they will read on the pricing card; whether we are their upline
 * they will not.
 *
 * The fourth answer is a "no", on purpose. We do not submit contracting to
 * carriers, and an agent can smell an overclaim — they would find out on the
 * demo call anyway, and finding out then costs the deal in a way that saying
 * it here does not.
 *
 * The parameter stays in the signature because routes/index.tsx passes PRICING
 * in to build the FAQPage structured data from this same list. Google requires
 * schema questions to be visible on the page, so the two cannot diverge.
 */
export function faqItems(pricing: Record<string, number>) {
  return [
    {
      q: "Is there a limit on how many agents an agency can have?",
      a: "No. The Agency Licence covers unlimited agents with no seat charges, subject to reasonable platform usage. Adding an agent does not change the bill.",
    },
    {
      q: "Can a solo agent use Agent Cloud?",
      a: `Yes. The Solo Licence is ${money(pricing.soloAgent)} a month and includes the tools to manage clients, policies, contracts, production and finances for your own business.`,
    },
    {
      q: "Is Nova AI required?",
      a: "No. Agent Cloud is a complete platform without it — the pipeline, the book, contracting, production and finances are all in the licence. Nova adds automation, prioritisation and AI assistance on top.",
    },
    {
      q: "How does the agency profit share work?",
      a: `Eligible paid agencies earn ${Math.round((pricing.novaPartnerRate ?? 0.2) * 100)}% recurring profit share on Nova subscriptions their agents buy, attributed to the agency. It runs while the Agency Licence is active and is governed by the programme terms. Seats an agency sponsors on an agent's behalf do not also earn profit share.`,
    },
    {
      q: "What happens if an agent leaves the agency?",
      a: "The agent keeps their account and records according to the platform's ownership and transfer rules. Profit share attribution follows the active agency relationship and the programme terms.",
    },
    {
      q: "Are you an IMO? Do you take an override?",
      a: "No and no. Agent Cloud is software you pay for. Your hierarchy, your carrier contracts and your comp are yours — we never sit in them and we never take a piece.",
    },
    {
      q: "Can Agent Cloud work out commissions and overrides?",
      a: "Yes, from the compensation levels and comp grid you configure: the writing agent's advance and deferral, and the override spread up the hierarchy. It does not automatically reconcile carrier statements — you upload those and check them against what was expected.",
    },
    {
      q: "Who owns my data if I leave?",
      a: "You do. Export your book, your agents, your policies and your commission history to CSV any time, without asking us. Month to month, no contract, no exit fee.",
    },
    {
      q: "Can my agents see each other's numbers?",
      a: "The agency leaderboard is visible to everyone in the agency — that is the point of it. Client and policy records are not: every agent sees their own book by default, and you set what managers and staff can see per role, enforced in the database rather than hidden in the interface.",
    },
    {
      q: "Do you submit contracting to the carriers for me?",
      a: "Not yet. You prepare the packet here — requests, documents, hierarchy, comp level — and submit it through whatever each carrier requires, whether that's SureLC, their portal, or email. We keep the record, the status and the writing number once it's issued.",
    },
    {
      q: "Are messages, calls and AI usage unlimited?",
      a: "No. Nova includes a monthly allowance for calling minutes, SMS, AI queries and automation runs, and usage beyond it is charged at published per-unit rates. The current allowances are shown in your Nova settings.",
    },
  ];
}

export function FaqSection({ pricing }: { pricing: Record<string, number> }) {
  const items = faqItems(pricing);
  const [open, setOpen] = useState<number | null>(0);

  return (
    <LandingSection id="faq" className="border-t border-border/60 bg-surface-2/30">
      <SectionHead eyebrow="Questions" title="Frequently asked questions." />

      <div className="mx-auto mt-10 max-w-3xl space-y-2">
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
        {/* A closing line an agency owner can act on, rather than a restatement
            of the category. Reconciling a real statement is the fastest thing
            we can do that they can check on the spot — and it is the claim
            they are most sceptical of. */}
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground" style={display}>
          Bring a carrier statement. See what reconciling it turns up.
        </h2>
        {/* No supporting paragraph. It restated the hero headline and the
            problem section in one sentence, three thousand pixels after both.
            At the bottom of a page the only job left is the button. */}
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
    // Same rule as the header nav: `#platform` and `#roles` pointed at
    // sections that no longer exist, and a footer link that scrolls nowhere is
    // the last thing somebody sees before they leave.
    {
      title: "Product",
      links: [
        { label: "Product", href: "#features" },
        { label: "Live demo", href: "#demo" },
        { label: "Pricing", href: "#pricing" },
        { label: "FAQ", href: "#faq" },
      ],
    },
    {
      title: "For",
      links: [
        { label: "Agency lifecycle", href: "#lifecycle" },
        { label: "Solo agents", href: "#pricing" },
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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
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

        <div className="mt-10 flex flex-col gap-2 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
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
