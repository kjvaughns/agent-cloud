import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { PageShell, Panel } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useServerFn } from "@/hooks/use-server-fn";
import { getAgentDetail } from "@/lib/team.functions";
import { getAgentOnboarding, type OnboardingStep } from "@/lib/agent-onboarding.functions";
import { AgentContractingTab } from "@/components/contracting/agent-contracting-tab";
import { cn } from "@/lib/utils";

/**
 * The agency owner's view of one agent.
 *
 * This is not the agent's Producer Profile, and the distinction is the point.
 * Producer Profile is self-scoped by design — `getProducerProfile()` takes no
 * arguments and filters everything on `context.userId`, and the route's
 * `validateSearch` whitelists only `tab`, so an agent id in the URL is stripped.
 *
 * That is why "Open the profile" on the Getting Ready panel opened the *owner's
 * own* profile: six CTAs in `agent-onboarding.functions.ts` hardcoded
 * `/account/producer-profile` with no params, the id was computed and then
 * dropped, and the destination could not have accepted it anyway. The bug
 * survived because the same component is reused on the agent's own dashboard,
 * where self-scoping is correct.
 *
 * So this page exists to be the destination those CTAs actually needed. It
 * shows what an owner needs to run their agency — where this agent is, what is
 * outstanding, and what the owner can clear themselves — and deliberately not
 * the agent's personal details.
 */
const TABS = ["overview", "readiness", "contracting"] as const;
type AgentTab = (typeof TABS)[number];

export const Route = createFileRoute("/_authenticated/agency/agents/$agentId")({
  component: AgentView,
  // Whitelisted, like every other tabbed route here — arriving from a readiness
  // CTA should land on Readiness rather than making the owner find it again.
  validateSearch: (s: Record<string, unknown>): { tab?: AgentTab } => ({
    tab: TABS.includes(String(s.tab) as AgentTab) ? (s.tab as AgentTab) : undefined,
  }),
  head: () => ({ meta: [{ title: "Agent · Agent Cloud" }] }),
});

const STAGE_TONE: Record<string, string> = {
  active: "bg-success/15 text-success border-success/30",
  pending: "bg-warning/15 text-warning border-warning/30",
  inactive: "bg-muted text-muted-foreground border-border",
  terminated: "bg-destructive/15 text-destructive border-destructive/30",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border-soft bg-surface-2 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <div className="tnum mt-0.5 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

function AgentView() {
  const { agentId } = Route.useParams();
  const { tab } = Route.useSearch();
  const detailFn = useServerFn(getAgentDetail);
  const readyFn = useServerFn(getAgentOnboarding);

  const { data, isLoading } = useQuery({
    queryKey: ["agency", "agent", agentId],
    queryFn: () => detailFn({ data: { agentId } }),
  });
  const { data: ready } = useQuery({
    queryKey: ["agent-onboarding", agentId],
    queryFn: () => readyFn({ data: { agent_id: agentId } }),
  });

  if (isLoading) {
    return (
      <PageShell>
        <Skeleton className="h-64 rounded-xl" />
      </PageShell>
    );
  }

  const p = (data as any)?.profile;
  if (!p) {
    return (
      <PageShell>
        <Panel title="Not available">
          <p className="text-sm text-muted-foreground">
            That agent is not in your agency, or no longer has a profile.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link to="/team">Back to the team</Link>
          </Button>
        </Panel>
      </PageShell>
    );
  }

  const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Agent";
  const b = (data as any).breakdown ?? {};
  const contracts = ((data as any).contracts ?? []) as any[];
  const recent = ((data as any).recent ?? []) as any[];
  const steps = ((ready as any)?.steps ?? []) as OnboardingStep[];
  const outstanding = steps.filter((s) => !s.done && !s.waiting);

  const days = p.created_at
    ? Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86_400_000)
    : null;

  return (
    <PageShell>
      <div className="mb-1">
        <h1 className="text-xl font-semibold text-foreground">{name}</h1>
        <p className="text-sm text-muted-foreground">
          {[p.email, days != null ? `${days} days as an agent` : null]
            .filter(Boolean).join(" \u00b7 ")}
        </p>
      </div>

      <div className="mb-4 mt-3 flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/team">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Team
          </Link>
        </Button>
        <Badge
          variant="outline"
          className={cn("text-[10px] uppercase tracking-wide", STAGE_TONE[p.status] ?? STAGE_TONE.pending)}
        >
          {p.status}
        </Badge>
        {ready ? (
          <Badge variant="outline" className="text-[10px]">
            {(ready as any).complete} of {(ready as any).total} ready
          </Badge>
        ) : null}
        <div className="ml-auto flex gap-1.5">
          {p.email && (
            <Button asChild variant="outline" size="sm">
              <a href={`mailto:${p.email}`}><Mail className="mr-1.5 h-3.5 w-3.5" /> Email</a>
            </Button>
          )}
          {p.phone && (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${p.phone}`}><Phone className="mr-1.5 h-3.5 w-3.5" /> Call</a>
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue={tab ?? "overview"}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="readiness">
            Readiness{outstanding.length ? ` (${outstanding.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="contracting">Contracting</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Policies" value={b.total ?? 0} />
            <Stat label="Active" value={b.active ?? 0} />
            <Stat label="Lapsed" value={b.lapsed ?? 0} />
            <Stat label="Premium" value={money(Number(b.premium ?? 0))} />
          </div>

          <Panel title="Recent policies">
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing submitted yet.</p>
            ) : (
              <ul className="divide-y divide-border-soft">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {r.carriers?.name ?? "Carrier"}
                      <span className="text-muted-foreground"> · {r.product ?? "—"}</span>
                    </span>
                    <span className="tnum shrink-0 text-muted-foreground">
                      {money(Number(r.annual_premium ?? 0))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="readiness" className="mt-4">
          <Panel title="What is outstanding">
            {outstanding.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing outstanding — {name.split(" ")[0]} is cleared to write.
              </p>
            ) : (
              <ul className="space-y-2">
                {outstanding.map((s) => (
                  <li
                    key={s.key}
                    className="rounded-lg border border-border-soft bg-surface-2 px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{s.title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.why}</p>
                      </div>
                      {/* Says who can actually clear it. An owner cannot file
                          somebody else's background disclosure, and a button
                          implying otherwise is worse than no button. */}
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {s.actor === "owner" ? "You can do this" : "Only they can"}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="contracting" className="mt-4 space-y-4">
          {/* Licences, appointments, writing numbers, open requests and what
              each carrier still needs. This tab used to be a list of carrier
              names and commission levels, which answered the one contracting
              question nobody was asking. */}
          <AgentContractingTab agentId={agentId} />

          {contracts.length > 0 && (
            <Panel title="Commission levels">
              <ul className="divide-y divide-border-soft">
                {contracts.map((c, i) => (
                  <li key={`${c.carrier_id}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{c.carriers?.name ?? "Carrier"}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {c.commission_level ?? (c.assigned_pct != null ? `${c.assigned_pct}%` : "—")}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
