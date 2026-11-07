import { Link } from "@tanstack/react-router";
import { ArrowRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/landing-analytics";
import { display } from "./primitives";
import heroImg from "@/assets/hero-producer.jpg";

const STATS = [
  { value: "$1.8M+", label: "production tracked" },
  { value: "1,000+", label: "clients managed" },
  { value: "0%", label: "of your comp taken" },
];

export function Hero({ ctaLabel, ctaHref }: { ctaLabel: string; ctaHref: string }) {
  const secondary =
    { label: "See pricing", href: "#pricing" };

  return (
    <section id="top" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 md:pt-20 md:pb-24 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            The operating system for life insurance
          </p>
          <h1
            className="mt-5 text-[2.4rem] leading-[1.05] font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl"
            style={display}
          >
            Run your agency. Own your book.
            <span className="mt-2 block text-primary">Keep 100% of your comp.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Track production, automate contracting and manage your hierarchy — without a $50k
            upfront fee or a cut of your commissions.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to={ctaHref} onClick={() => track("hero_cta_clicked", { label: ctaLabel })}>
              <Button size="lg" variant="ink" className="h-12 w-full rounded-full px-7 text-base sm:w-auto">
                {ctaLabel} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
            <a href={secondary.href} onClick={() => track("demo_cta_clicked")}>
              <Button size="lg" variant="outline" className="h-12 w-full rounded-full px-7 text-base sm:w-auto">
                {secondary.label}
              </Button>
            </a>
          </div>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-border pt-6">
            {STATS.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="text-2xl font-bold text-foreground md:text-3xl" style={display}>{s.value}</dd>
                <dd className="mt-1 text-xs text-muted-foreground">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div aria-hidden className="absolute -inset-6 rounded-[2.5rem] bg-primary/25 blur-3xl" />
          <img
            src={heroImg}
            alt="Insurance agent reviewing her book at her desk"
            width={1024}
            height={1200}
            className="relative aspect-[4/5] w-full rounded-[2rem] object-cover shadow-xl"
          />
          <div className="absolute -bottom-5 left-4 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-lg sm:left-[-1.5rem]">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
              <TrendingUp className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Top week written</p>
              <p className="text-lg font-bold text-foreground" style={display}>$20,477</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
