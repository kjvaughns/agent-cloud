/**
 * Hero and proof.
 *
 * Two things were wrong with the old hero and both were fatal on first
 * impression. The two buttons carried the same label, because the primary one
 * falls back to "Book a demo" when checkout is unconfigured and the secondary
 * was never swapped. And the dashboard beside it showed $0 in every tile with
 * green "+23%" badges next to the zeroes, because the count-up never started.
 *
 * The fix here is structural rather than cosmetic: the primary action decides
 * the secondary one, so they can never collide, and every figure in the frame
 * is a real measured total from our own agency's book (see lib/landing/proof)
 * that renders even if no animation ever runs.
 */

import { Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing-analytics";
import { PROOF_ROWS, PROOF_LINE } from "@/lib/landing/proof";
import { display } from "./primitives";
import { useCountUp, useInView } from "./motion";

const money = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

export function Hero({ ctaLabel, ctaHref }: { ctaLabel: string; ctaHref: string }) {
  // The secondary action is derived, never typed twice. If the primary action
  // already is the demo, the secondary becomes pricing.
  const secondary =
    ctaHref === "/demo"
      ? { label: "See pricing", href: "#pricing", internal: false }
      : { label: "Book a demo", href: "/demo", internal: true };

  return (
    <section id="top" className="relative overflow-hidden border-b border-border">
      {/* One soft gold wash. No orbs, no parallax — both shipped in the bundle
          and neither was on the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[28rem] opacity-[0.16]"
        style={{ background: "radial-gradient(60% 60% at 50% 40%, var(--gold) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-12 pb-14 md:pt-20 md:pb-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            For life insurance agents and agency owners
          </p>
          <h1
            className="mt-4 text-[2.1rem] leading-[1.08] sm:text-5xl md:text-6xl font-bold tracking-tight text-balance text-foreground"
            style={display}
          >
            Run your entire insurance business from one place.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base md:text-lg leading-relaxed text-muted-foreground">
            Pipeline, posted deals, book of business, contracting, hierarchy, leaderboard and
            commissions. Post a deal once and every screen updates.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              to={ctaHref}
              onClick={() => track("hero_cta_clicked", { label: ctaLabel })}
              className="w-full sm:w-auto"
            >
              {/* 48px tall, full width on a phone: the one action in view. */}
              <Button size="lg" className="h-12 w-full px-7 text-base sm:w-auto">
                {ctaLabel} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>

            {secondary.internal ? (
              <Link
                to={secondary.href}
                onClick={() => track("demo_cta_clicked")}
                className="inline-flex h-12 items-center justify-center px-4 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                {secondary.label}
              </Link>
            ) : (
              <a
                href={secondary.href}
                className="inline-flex h-12 items-center justify-center px-4 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                {secondary.label}
              </a>
            )}
          </div>

          <p className="mt-6 text-sm text-muted-foreground">{PROOF_LINE}</p>
          {/* The three things an agency owner actually asks in the first
              minute, none of which we have to invent to answer. */}
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

        <DashboardFrame />
      </div>

      <ProofStrip />
    </section>
  );
}

/** The measured totals, rounded down. Nothing here is projected or invented. */
function ProofStrip() {
  return (
    <div className="border-t border-border bg-surface-2/40">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-y-6 px-4 sm:px-6 py-8 lg:grid-cols-4">
        {PROOF_ROWS.map((r) => (
          <div key={r.label} className="min-w-0 px-1">
            <div className="tnum text-2xl md:text-3xl font-bold text-gold-bright" style={display}>
              {r.value}
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">{r.label}</div>
            <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{r.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Dashboard frame ─────────────────────────────────────────────────────────

const TREND = [12, 16, 14, 19, 22, 20, 26, 31, 28, 36, 41, 39, 46, 52, 49, 58, 63, 67];

/**
 * The dashboard, on our own agency's real totals.
 *
 * Exported because the product section shows the same frame; there is one
 * dashboard mock in the codebase, not two that can disagree.
 */
export function DashboardFrame({ className }: { className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.1);
  const ytd = useCountUp(553751, 1400, inView);

  const w = 560, h = 120, max = Math.max(...TREND);
  const step = w / (TREND.length - 1);
  const path = TREND.map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (v / max) * h}`).join(" ");

  const tiles = [
    { label: "Policies", value: "428" },
    { label: "Clients", value: "800" },
    { label: "Producers", value: "9" },
    { label: "Carriers", value: "24" },
  ];

  return (
    <div ref={ref} className={cn("dark mx-auto mt-12 max-w-5xl", className)}>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/40">
        <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
          <span className="flex gap-1.5">
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c, opacity: 0.55 }} />
            ))}
          </span>
          <span className="ml-2 truncate text-[11px] text-muted-foreground">Dashboard — Agent Cloud</span>
        </div>

        <div className="grid md:grid-cols-[1fr_240px]">
          <div className="min-w-0 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              Production year to date (ALP)
            </div>
            <div className="mt-1.5 tnum text-3xl md:text-4xl font-bold leading-none text-gold-bright" style={display}>
              {money(ytd)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Our own agency's book, posted in Agent Cloud
            </div>

            <svg viewBox="0 0 560 130" className="mt-5 w-full" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id="ac-hero-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={`${path} L 560 130 L 0 130 Z`}
                fill="url(#ac-hero-fill)"
                opacity={inView ? 1 : 0}
                style={{ transition: "opacity .9s ease .4s" }}
              />
              <path
                d={path}
                fill="none"
                stroke="var(--gold)"
                strokeWidth="2.5"
                strokeLinecap="round"
                style={{
                  strokeDasharray: 1400,
                  strokeDashoffset: inView ? 0 : 1400,
                  transition: "stroke-dashoffset 1.5s cubic-bezier(.22,.61,.36,1)",
                }}
              />
            </svg>
          </div>

          <div className="grid grid-cols-2 border-t border-border md:grid-cols-1 md:border-l md:border-t-0">
            {tiles.map((t, i) => (
              <div
                key={t.label}
                className={cn(
                  "p-4",
                  i < tiles.length - 1 && "md:border-b md:border-border",
                  i % 2 === 0 && "border-r border-border md:border-r-0",
                  i < 2 && "border-b border-border md:border-b",
                )}
              >
                <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{t.label}</div>
                <div className="tnum mt-1 text-lg font-bold text-foreground" style={display}>{t.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
