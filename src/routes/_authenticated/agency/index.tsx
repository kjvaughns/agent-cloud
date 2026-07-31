import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight, BookOpen, Heart, Target, Trophy, UserPlus, Users,
} from "lucide-react";
import { Panel } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { getAgencyPeopleOverview } from "@/lib/agency-overview.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agency/")({
  component: AgencyOverviewPage,
  head: () => ({ meta: [{ title: "Agency Admin | Agent Cloud" }] }),
});

/**
 * The people side of running an agency.
 *
 * One tile per destination in the rail, each showing the number that would
 * make you open it. A hub whose cards only say what a page is called makes
 * you visit all six to find out where the work is; these say it up front.
 *
 * Deliberately narrow. Configuration is in Settings, contracting in
 * Contracting Operations, numbers in Reports. This hub answers "how are my
 * people doing" and nothing else.
 */

type Tile = {
  title: string;
  to: string;
  icon: LucideIcon;
  /** The number worth knowing before you click. */
  value: (m: Metrics) => number;
  /** What that number means, in the words somebody would say out loud. */
  caption: (n: number) => string;
  /** Non-zero is a problem worth flagging rather than a neutral count. */
  warnWhenPositive?: boolean;
};

type Metrics = {
  team: number; ready: number; onboarding: number;
  invites: number; retention: number; challenges: number;
};

const TILES: Tile[] = [
  {
    title: "Team", to: "/team", icon: Users,
    value: (m) => m.team,
    caption: (n) => `${n} ${n === 1 ? "person" : "people"} in the agency`,
  },
  {
    title: "Getting agents ready", to: "/onboarding", icon: UserPlus,
    value: (m) => m.onboarding,
    caption: (n) => n === 0
      ? "Everyone is ready to sell"
      : `${n} still can't sell`,
    warnWhenPositive: true,
  },
  {
    title: "Invite an agent", to: "/contracting/invite", icon: UserPlus,
    value: (m) => m.invites,
    caption: (n) => n === 0
      ? "No invites outstanding"
      : `${n} ${n === 1 ? "invite" : "invites"} not accepted yet`,
  },
  {
    title: "Leaderboard", to: "/leaderboard", icon: Trophy,
    value: (m) => m.ready,
    caption: (n) => `${n} ${n === 1 ? "agent" : "agents"} cleared to write`,
  },
  {
    title: "Challenges", to: "/challenges", icon: Target,
    value: (m) => m.challenges,
    caption: (n) => n === 0 ? "Nothing running" : `${n} running now`,
  },
  {
    title: "Retention", to: "/retention", icon: Heart,
    value: (m) => m.retention,
    caption: (n) => n === 0
      ? "No policies at risk"
      : `${n} ${n === 1 ? "policy" : "policies"} at risk`,
    warnWhenPositive: true,
  },
];

function AgencyOverviewPage() {
  const fn = useServerFn(getAgencyPeopleOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["agency-people-overview"],
    queryFn: () => fn(),
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    );
  }

  const m: Metrics = data ?? {
    team: 0, ready: 0, onboarding: 0, invites: 0, retention: 0, challenges: 0,
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((t) => {
          const n = t.value(m);
          const warn = Boolean(t.warnWhenPositive) && n > 0;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "group flex flex-col rounded-xl border bg-card p-4 transition-colors",
                warn ? "border-warning/40 hover:border-warning" : "border-border hover:border-primary/40",
              )}
            >
              <span className="flex items-center gap-2">
                <t.icon className={cn("h-4 w-4", warn ? "text-warning" : "text-muted-foreground")} />
                <span className="text-sm font-semibold text-foreground">{t.title}</span>
                <ArrowRight className="ml-auto h-3.5 w-3.5 text-text-dim transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className={cn(
                "tnum mt-2 text-3xl font-bold leading-none",
                warn ? "text-warning" : "text-foreground",
              )}>
                {n}
              </span>
              <span className="mt-1.5 text-xs text-muted-foreground">{t.caption(n)}</span>
            </Link>
          );
        })}
      </div>

      <Panel title="Help them sell">
        <p className="text-sm text-muted-foreground">
          Guides, scripts and the agent academy — what a new agent reads in their first week.
        </p>
        <Link
          to="/resources/new-agent-guide"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Open Resources
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Panel>

      <p className="text-[11px] text-text-dim">
        Agency settings, automations and emails live in Settings. Contracting lives in Contracting
        Operations. Production numbers live in Reports.
      </p>
    </div>
  );
}
