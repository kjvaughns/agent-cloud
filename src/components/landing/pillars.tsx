import { FileCheck2, Network, RefreshCw, Trophy } from "lucide-react";
import { display } from "./primitives";

const PILLARS = [
  { icon: FileCheck2, title: "Post & track", body: "Post a deal in 30 seconds. Pipeline, book and payouts update on their own." },
  { icon: Network, title: "Hierarchy & comp", body: "Overrides, splits and downline payouts calculated for every level." },
  { icon: RefreshCw, title: "Carrier book sync", body: "Drop in carrier statements and see active, lapsed and pending at a glance." },
  { icon: Trophy, title: "Leaderboard & Trophy Case", body: "Live rankings and all-time records that keep your team competing." },
];

export function PillarsSection() {
  return (
    <section id="product" className="border-t border-border bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Everything in one place</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-foreground md:text-4xl" style={display}>
          Built for how life insurance actually runs.
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <p.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-foreground" style={display}>{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
