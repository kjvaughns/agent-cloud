import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BookOpen, Heart, KanbanSquare } from "lucide-react";
import { PageShell, Panel } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { useNavContext } from "@/hooks/use-my-access";
import { reachableFor } from "@/lib/navigation";
import { getClientsOverview, type ClientsOverview } from "@/lib/clients-overview.functions";
import { money, number } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/clients")({
  component: ClientsOverviewPage,
  head: () => ({
    meta: [
      { title: "Clients — Agent Cloud" },
      { name: "description", content: "Your pipeline, your book of business and your retention queue in one place." },
    ],
  }),
});

/**
 * One person, three stages.
 *
 * Somebody you are working, somebody you sold, and somebody about to leave are
 * the same person at different points, but they used to be three unrelated
 * sidebar rows, which made them read as three unrelated jobs.
 *
 * Each block shows the numbers you would go to that page to find out, so this
 * is worth opening on its own rather than only being a door to three others.
 * Counts and money. Anything that wants a chart belongs in Reports.
 */

type Stat = { label: string; value: string; delta?: string; deltaUp?: boolean; tone?: "default" | "red" };

type Block = {
  id: string;
  title: string;
  to: string;
  icon: LucideIcon;
  /** Who these numbers are about — the scope question, answered up front. */
  scope: string;
  stats: (o: ClientsOverview) => Stat[];
  /** What to say instead of the numbers when there is nothing yet. */
  empty: (o: ClientsOverview) => string | null;
};

const BLOCKS: Block[] = [
  {
    id: "pipeline",
    title: "Pipeline",
    to: "/pipeline",
    icon: KanbanSquare,
    scope: "Your leads",
    stats: (o) => [
      { label: "Working", value: number(o.pipeline.working) },
      { label: "Hot", value: number(o.pipeline.hot) },
      {
        label: "Gone quiet",
        value: number(o.pipeline.quiet),
        delta: o.pipeline.quiet > 0 ? "14+ days untouched" : undefined,
        deltaUp: o.pipeline.quiet > 0 ? false : undefined,
        tone: o.pipeline.quiet > 0 ? "red" : "default",
      },
    ],
    empty: (o) => (o.pipeline.working === 0 ? "No leads in play. Add one to get started." : null),
  },
  {
    id: "book",
    title: "Book of Business",
    to: "/book-of-business",
    icon: BookOpen,
    scope: "You and your downline",
    stats: (o) => [
      {
        label: "Active policies",
        value: number(o.book.active),
        delta: o.book.placedThisMonth > 0 ? `+${o.book.placedThisMonth} this month` : undefined,
        deltaUp: o.book.placedThisMonth > 0 ? true : undefined,
      },
      { label: "Monthly premium", value: money(o.book.monthlyPremium) },
      {
        label: "Awaiting issue",
        value: number(o.book.pending),
        delta: o.book.pending > 0 ? "Not paid yet" : undefined,
      },
    ],
    empty: (o) =>
      o.book.active === 0 && o.book.pending === 0 ? "Nothing placed yet. Post a deal to start your book." : null,
  },
  {
    id: "retention",
    title: "Retention",
    to: "/retention",
    icon: Heart,
    scope: "Policies you can see",
    stats: (o) => {
      const r = o.retention!;
      return [
        {
          label: "At risk now",
          value: number(r.live),
          tone: r.live > 0 ? "red" : "default",
        },
        { label: "Premium at risk", value: money(r.atRisk), tone: r.atRisk > 0 ? "red" : "default" },
        {
          label: "Save rate",
          value: r.saveRate === null ? "—" : `${Math.round(r.saveRate * 100)}%`,
          delta: r.saveRate === null ? "Nothing decided yet" : undefined,
        },
      ];
    },
    empty: (o) => (o.retention!.live === 0 ? "Nothing at risk right now." : null),
  },
];

function ClientsOverviewPage() {
  const fn = useServerFn(getClientsOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["clients-overview"],
    queryFn: () => fn(),
  });

  // Retention is not everybody's page, and an empty queue looks the same from
  // here as no access to one — so the block is decided by the same gate the
  // sidebar uses, never by whether the numbers came back zero.
  const nav = useNavContext();
  const canSeeRetention = reachableFor(nav).some((p) => p.id === "retention");
  const blocks = BLOCKS.filter((b) => b.id !== "retention" || canSeeRetention);

  return (
    <PageShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Clients</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Everyone you are working, everyone you sold, and everyone about to leave.
          </p>
        </div>

        {isLoading || !data ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {blocks.map((b) => <Skeleton key={b.id} className="h-40 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {blocks.map((b) => {
              const empty = b.empty(data);
              return (
                <Panel key={b.id}>
                  <Link
                    to={b.to}
                    className="group flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary"
                  >
                    <b.icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
                    {b.title}
                    <ArrowRight className="ml-auto h-3.5 w-3.5 text-text-dim transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <p className="mt-0.5 text-[11px] uppercase tracking-[0.07em] text-text-dim">{b.scope}</p>

                  {empty ? (
                    <p className="mt-4 text-sm text-muted-foreground">{empty}</p>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {b.stats(data).map((s) => (
                        <StatTile
                          key={s.label}
                          label={s.label}
                          value={s.value}
                          delta={s.delta}
                          deltaUp={s.deltaUp}
                          tone={s.tone}
                        />
                      ))}
                    </div>
                  )}
                </Panel>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-text-dim">
          Production numbers over time live in Reports. Commissions live under Contracting.
        </p>
      </div>
    </PageShell>
  );
}
