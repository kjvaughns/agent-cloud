import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { ArrowLeft, Mail, Phone, Search } from "lucide-react";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatTile } from "@/components/ui/stat-tile";
import { SmoothAreaChart } from "@/components/ui/area-chart";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fmtCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getAgentDashboard } from "@/lib/team.functions";
import { AgentContractingTab } from "@/components/contracting/agent-contracting-tab";
import {
  RANGES, RANGE_LABELS, rangeBounds, inRange, summarize, dailySeries, byCarrier,
  type RangeKey, type DealRow,
} from "@/lib/team/agent-dashboard";

/**
 * One agent, everything about how they are doing.
 *
 * A route rather than a drawer so it deep-links, shares and back-buttons — an
 * owner sending "look at Dana's numbers" to a manager should be sending a URL.
 *
 * This absorbed `/agency/agents/$agentId`, which showed readiness and
 * contracting for the same person one nav branch away. Two owner-facing pages
 * about one agent is the duplication the Agency rebuild exists to remove; that
 * path now redirects here.
 *
 * On what it shows: contact details and producer identity — email, phone, NPN,
 * resident licence — are legitimate agency oversight. SSN, date of birth and
 * banking are not shown to anybody, owner included. The product stopped
 * collecting them and this does not quietly re-open a window onto the rows that
 * remain.
 */
export const Route = createFileRoute("/_authenticated/team/agent/$agentId")({
  component: AgentDashboard,
  head: () => ({ meta: [{ title: "Agent — Agent Cloud" }] }),
});

function initials(f?: string | null, l?: string | null) {
  return `${(f ?? "").charAt(0)}${(l ?? "").charAt(0)}`.toUpperCase() || "?";
}

function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function AgentDashboard() {
  const { agentId } = Route.useParams();
  const fetchDashboard = useServerFn(getAgentDashboard);
  const { data, isLoading, error } = useQuery({
    queryKey: ["team", "agent-dashboard", agentId],
    queryFn: () => fetchDashboard({ data: { agentId } }),
  });

  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const bounds = useMemo(() => rangeBounds(rangeKey, Date.now(), custom), [rangeKey, custom]);

  const deals = (data?.deals ?? []) as (DealRow & Record<string, any>)[];
  const scoped = useMemo(
    () => (bounds.start === null && bounds.end === null
      ? deals
      : deals.filter((d) => inRange(d, bounds.start, bounds.end))),
    [deals, bounds],
  );
  const totals = useMemo(() => summarize(scoped), [scoped]);
  const series = useMemo(
    () => (bounds.start && bounds.end ? dailySeries(scoped, bounds.start, bounds.end) : []),
    [scoped, bounds],
  );
  const carriers = useMemo(() => byCarrier(scoped), [scoped]);

  if (isLoading) {
    return <PageShell><Skeleton className="h-72 rounded-xl" /></PageShell>;
  }
  if (error) {
    return (
      <PageShell>
        <Panel>
          <div className="space-y-3 py-14 text-center">
            <p className="text-muted-foreground">{(error as Error).message}</p>
            <Button asChild variant="outline"><Link to="/team">Back to Team</Link></Button>
          </div>
        </Panel>
      </PageShell>
    );
  }

  const p = data!.profile as any;
  const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Agent";

  return (
    <PageShell>
      <div className="space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link to="/team"><ArrowLeft className="mr-1 h-4 w-4" /> Team</Link>
          </Button>
          <HeroBand
            title={name}
            subtitle={<>Joined {when(p.created_at)} · Last active {p.last_active_at ? when(p.last_active_at) : "never"}</>}
            actions={
              <div className="flex gap-2">
                {p.email && <Button asChild variant="outline" size="sm"><a href={`mailto:${p.email}`}><Mail className="mr-1 h-4 w-4" /> Email</a></Button>}
                {p.phone && <Button asChild variant="outline" size="sm"><a href={`tel:${p.phone}`}><Phone className="mr-1 h-4 w-4" /> Call</a></Button>}
              </div>
            }
          />
        </div>

        {/* The range drives every production number below it, and nothing else:
            contracts and the book are current state, not a window. */}
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRangeKey(r)}
              aria-pressed={rangeKey === r}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                rangeKey === r
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-border-soft text-muted-foreground hover:text-foreground",
              )}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
          {rangeKey === "custom" && (
            <div className="flex items-center gap-2">
              <Input type="date" className="h-8 w-auto" value={custom.from ?? ""}
                     onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" className="h-8 w-auto" value={custom.to ?? ""}
                     onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </div>
          )}
        </div>

        <AgentInformation profile={p} producer={data!.producer} licences={data!.licences} />

        {/* Production summary. Average is per deal. */}
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
          {[
            { label: "Annual premium", value: fmtCurrency(totals.premium), tone: "gold" as const },
            { label: "Deals", value: totals.deals, tone: "default" as const },
            { label: "Average premium", value: totals.deals ? fmtCurrency(totals.average) : "—", tone: "default" as const },
          ].map((t) => (
            <div key={t.label} className="rounded-[10px] border border-border-soft bg-surface-2 p-3.5">
              <StatTile label={t.label} value={t.value} tone={t.tone} delta={RANGE_LABELS[rangeKey]} />
            </div>
          ))}
        </div>

        <ContractsOverview contracts={data!.contracts as any[]} />

        <Panel title="Production trend">
          {series.length < 2 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {rangeKey === "all"
                ? "Pick a date range to see a trend."
                : "Not enough activity in this range to draw a trend."}
            </p>
          ) : (
            <div className="space-y-2">
              <SmoothAreaChart data={series.map((d) => d.premium)} className="w-full" />
              <div className="flex justify-between text-xs text-muted-foreground tnum">
                <span>{series[0].day}</span>
                <span>{series[series.length - 1].day}</span>
              </div>
            </div>
          )}
        </Panel>

        <CarrierBreakdown slices={carriers} total={totals.premium} />

        <BookOfBusiness deals={scoped as any[]} />

        {data!.directReports.length > 0 && (
          <TheirTeam reports={data!.directReports as any[]} />
        )}

        {/* Readiness and contracting came from the page this one absorbed. */}
        <Panel title="Contracting">
          <AgentContractingTab agentId={agentId} />
        </Panel>
      </div>
    </PageShell>
  );
}

// ── 2 · Agent information ───────────────────────────────────────────────────

function AgentInformation({ profile, producer, licences }: { profile: any; producer: any; licences: any[] }) {
  const live = (licences ?? []).filter(
    (l) => !l.expires_date || l.expires_date >= new Date().toISOString().slice(0, 10),
  );
  const fields: [string, string][] = [
    ["Email", profile.email || "—"],
    ["Phone", profile.phone || "—"],
    ["NPN", profile.npn_number || "—"],
    ["Resident state", producer?.resident_state || "—"],
    ["Resident licence", producer?.resident_license_number || "—"],
    ["Active licences", String(live.length)],
  ];
  return (
    <Panel title="Agent information">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 md:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
            <div className="truncate text-sm">{value}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── 4 · Contracts ───────────────────────────────────────────────────────────

function ContractsOverview({ contracts }: { contracts: any[] }) {
  const active = contracts.filter((c) => c.status === "active").length;
  const pending = contracts.filter((c) => c.status && c.status !== "active").length;
  return (
    <Panel title="Contracts" action={<Badge variant="secondary" className="tnum">{contracts.length}</Badge>}>
      <div className="mb-3 flex gap-4 text-sm text-muted-foreground tnum">
        <span><span className="font-medium text-foreground">{active}</span> active</span>
        <span><span className="font-medium text-foreground">{pending}</span> pending</span>
      </div>
      {contracts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No carrier contracts yet.</p>
      ) : (
        <div className="space-y-1.5">
          {contracts.map((c, i) => (
            <div key={`${c.carrier_id}-${i}`} className="flex items-center justify-between rounded-lg border border-border-soft bg-surface-2 px-3 py-2 text-sm">
              <span className="truncate">{c.carriers?.name ?? "Carrier"}</span>
              <span className="flex shrink-0 items-center gap-2">
                {c.commission_level && <span className="text-xs text-muted-foreground">{c.commission_level}</span>}
                {c.assigned_pct != null && <span className="tnum text-xs">{c.assigned_pct}%</span>}
                <Badge variant={c.status === "active" ? "success" : "secondary"}>{c.status ?? "unknown"}</Badge>
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── 6 · Carrier breakdown ───────────────────────────────────────────────────

function CarrierBreakdown({ slices, total }: { slices: { carrier: string; premium: number; deals: number }[]; total: number }) {
  return (
    <Panel title="By carrier">
      {slices.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No production in this range.</p>
      ) : (
        <div className="space-y-2">
          {slices.map((s) => (
            <div key={s.carrier} className="flex items-center gap-3">
              <div className="w-32 shrink-0 truncate text-xs">{s.carrier}</div>
              <div className="h-5 flex-1 overflow-hidden rounded bg-surface-2">
                <div className="h-full bg-primary" style={{ width: `${total > 0 ? (s.premium / total) * 100 : 0}%` }} />
              </div>
              <div className="w-28 shrink-0 text-right text-xs tnum">
                {fmtCurrency(s.premium)} · {s.deals}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── 7 · Their book ──────────────────────────────────────────────────────────

const PAGE = 20;

function BookOfBusiness({ deals }: { deals: any[] }) {
  const [q, setQ] = useState("");
  const [carrier, setCarrier] = useState("all");
  const [page, setPage] = useState(0);

  const carriers = useMemo(
    () => [...new Set(deals.map((d) => d.carrier_name).filter(Boolean))].sort(),
    [deals],
  );
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return deals.filter((d) => {
      if (carrier !== "all" && d.carrier_name !== carrier) return false;
      if (!needle) return true;
      return [d.client_name, d.product, d.policy_number].some(
        (v) => v && String(v).toLowerCase().includes(needle),
      );
    });
  }, [deals, q, carrier]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <Panel title="Book of business" action={<Badge variant="secondary" className="tnum">{filtered.length}</Badge>}>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Client, product or policy number"
                 value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        {carriers.length > 0 && (
          <Select value={carrier} onValueChange={(v) => { setCarrier(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-auto min-w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All carriers</SelectItem>
              {carriers.map((c) => <SelectItem key={c as string} value={c as string}>{c as string}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No deals in this range.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead className="text-right">Annual premium</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Policy #</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="max-w-[180px] truncate">
                      {d.client_id
                        ? <Link to="/pipeline" search={{ client: d.client_id } as any} className="hover:underline">{d.client_name ?? "Client"}</Link>
                        : (d.client_name ?? "—")}
                    </TableCell>
                    <TableCell className="text-xs">{d.product ?? "—"}</TableCell>
                    <TableCell className="text-xs">{d.carrier_name ?? "—"}</TableCell>
                    <TableCell className="text-right tnum">{fmtCurrency(Number(d.annual_premium ?? 0))}</TableCell>
                    <TableCell className="text-xs tnum">{when(d.effective_date ?? d.posted_at)}</TableCell>
                    <TableCell className="text-xs">{d.policy_number ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between pt-3 text-sm">
              <span className="text-muted-foreground tnum">Page {page + 1} of {pages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((n) => n + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

// ── 8 · Their team ──────────────────────────────────────────────────────────

function TheirTeam({ reports }: { reports: any[] }) {
  return (
    <Panel
      title={`Their team (${reports.length})`}
      action={<Badge variant="secondary" className="tnum">{reports.length}</Badge>}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <Link
            key={r.id}
            to="/team/agent/$agentId"
            params={{ agentId: r.id }}
            className="flex items-center gap-3 rounded-lg border border-border-soft bg-surface-2 p-3 transition-colors hover:border-primary/40"
          >
            <Avatar className="h-9 w-9"><AvatarFallback>{initials(r.first_name, r.last_name)}</AvatarFallback></Avatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{r.first_name} {r.last_name}</div>
              <div className="text-xs text-muted-foreground tnum">
                {r.deals} deal{r.deals === 1 ? "" : "s"} · {fmtCurrency(r.premium)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
