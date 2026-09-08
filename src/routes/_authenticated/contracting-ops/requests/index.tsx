import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WritingNumbersPage } from "@/components/contracting/writing-numbers-panel";
import { HierarchiesPage } from "@/components/contracting/hierarchies-panel";
import { HierarchyChangesPage } from "@/components/contracting/hierarchy-changes-panel";
import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { createContractingRequest, listOrgCarriers } from "@/lib/contracting-ops.functions";
import { listOrgAgents } from "@/lib/contracting-records.functions";
import { Panel } from "@/components/page-shell";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { listContractingAgents } from "@/lib/contracting-agents.functions";
import {
  CONTRACT_TYPES, CONTRACT_TYPE_LABELS, PRIMARY_REQUEST_STATUSES, REQUEST_STATUS_META,
} from "@/lib/contracting-ops/types";
import { EmptyState, StatusBadge } from "@/components/contracting/shared";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/time-ago";

const TABS = ["requests", "numbers", "hierarchies", "changes"] as const;
type Tab = (typeof TABS)[number];

const FILTERS = [
  { key: "all", label: "All agents" },
  { key: "needs_attention", label: "Needs attention" },
  { key: "new_requests", label: "New requests" },
  ...PRIMARY_REQUEST_STATUSES.map((s) => ({ key: s, label: REQUEST_STATUS_META[s].label })),
  { key: "fully_contracted", label: "Fully contracted" },
] as const;

const SORTS = [
  { key: "updated", label: "Last updated" },
  { key: "newest", label: "Newest request" },
  { key: "oldest", label: "Oldest request" },
  { key: "name", label: "Agent name" },
  { key: "carriers", label: "Carriers" },
  { key: "attention", label: "Needs attention" },
] as const;

type SearchParams = { tab?: Tab; q?: string; filter?: string; sort?: string; page?: number };

export const Route = createFileRoute("/_authenticated/contracting-ops/requests/")({
  component: RequestsTabs,
  /**
   * Filters live in the URL, not in component state.
   *
   * Opening an agent and coming back used to reset the list to its default —
   * which, halfway through working a filtered queue, means finding your place
   * again every single time. In the URL they survive the round trip, a refresh
   * and a shared link.
   */
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    ...(TABS.includes(s.tab as Tab) ? { tab: s.tab as Tab } : {}),
    ...(typeof s.q === "string" && s.q ? { q: s.q } : {}),
    ...(typeof s.filter === "string" && s.filter ? { filter: s.filter } : {}),
    ...(typeof s.sort === "string" && s.sort ? { sort: s.sort } : {}),
    ...(Number(s.page) > 1 ? { page: Number(s.page) } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Contract Requests | Agent Cloud" },
      { name: "description", content: "Every agent's carrier contracting, grouped by agent: status, writing numbers, notes and history." },
    ],
  }),
});

/**
 * Contract requests, and the hierarchy they sit in.
 *
 * Carrier hierarchies, hierarchy changes and writing numbers were all sidebar
 * entries of their own, and all of them describe where a request sits, who it
 * routes through, and what came back — which is what a request already is.
 * One destination.
 */
function RequestsTabs() {
  const { tab } = Route.useSearch();
  return (
    <Tabs defaultValue={tab ?? "requests"} className="space-y-4">
      <TabsList>
        <TabsTrigger value="requests">Agents</TabsTrigger>
        <TabsTrigger value="numbers">Writing numbers</TabsTrigger>
        <TabsTrigger value="hierarchies">Current hierarchy</TabsTrigger>
        <TabsTrigger value="changes">Change requests</TabsTrigger>
      </TabsList>
      <TabsContent value="requests"><AgentsQueue /></TabsContent>
      <TabsContent value="numbers"><WritingNumbersPage /></TabsContent>
      <TabsContent value="hierarchies"><HierarchiesPage /></TabsContent>
      <TabsContent value="changes"><HierarchyChangesPage /></TabsContent>
    </Tabs>
  );
}

/**
 * One row per agent, not one row per carrier request.
 *
 * An agent contracting with five carriers appeared five times here, and the
 * question this page exists to answer — "where is this person up to?" — had to
 * be reassembled by eye. The agent is the object now; the five carrier records
 * live inside their workspace, each with its own status, writing number, level
 * and history.
 *
 * Grouping, search, filtering, sorting and paging all happen on the server: an
 * agency with thousands of requests must not ship all of them to the browser to
 * filter them there.
 */
function AgentsQueue() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();

  const fn = useServerFn(listContractingAgents);
  const carriersFn = useServerFn(listOrgCarriers);
  const agentsFn = useServerFn(listOrgAgents);
  const createFn = useServerFn(createContractingRequest);

  const [creating, setCreating] = useState(false);
  const [draftQuery, setDraftQuery] = useState(search.q ?? "");

  // Typing shouldn't hit the server on every keystroke, and it shouldn't push a
  // history entry per character either — the URL catches up once you stop.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q ?? "") === draftQuery) return;
      navigate({ search: (p: any) => ({ ...p, q: draftQuery || undefined, page: undefined }), replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [draftQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const filter = search.filter ?? "all";
  const sort = search.sort ?? "updated";
  const page = search.page ?? 1;

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["contracting-ops", "agents-queue", search.q ?? "", filter, sort, page],
    queryFn: () => fn({ data: { search: search.q, filter: filter as any, sort: sort as any, page } }),
    placeholderData: keepPreviousData,
  });

  const { data: carrierData } = useQuery({
    queryKey: ["contracting-ops", "carriers"], queryFn: () => carriersFn(), enabled: creating,
  });
  const { data: agentData } = useQuery({
    queryKey: ["contracting-ops", "agents"], queryFn: () => agentsFn(), enabled: creating,
  });

  const create = useMutation({
    mutationFn: (p: any) => createFn({ data: p }),
    onSuccess: (r: any) => {
      toast.success(`Request ${r?.reference ?? ""} created`);
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create the request"),
  });

  const rows = data?.rows ?? [];
  const counts = data?.counts;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 50)));

  const setSearchParam = (patch: Record<string, unknown>) =>
    navigate({ search: (p: any) => ({ ...p, ...patch }) });

  return (
    <div className="space-y-3">
      {/* Summary counts: compact, one line, and each one is a filter. */}
      {counts && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Needs attention", value: counts.needs_attention, key: "needs_attention", tone: "warning" },
            { label: "New requests", value: counts.new_requests, key: "new_requests", tone: "neutral" },
            { label: "Waiting on agent", value: counts.waiting_on_agent, key: "awaiting_agent", tone: "neutral" },
            { label: "Waiting on carrier", value: counts.waiting_on_carrier, key: "submitted", tone: "neutral" },
            { label: "Fully contracted", value: counts.fully_contracted, key: "fully_contracted", tone: "success" },
          ].map((c) => (
            <button
              key={c.key}
              onClick={() => setSearchParam({ filter: filter === c.key ? undefined : c.key, page: undefined })}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors",
                filter === c.key ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:bg-surface-2/40",
              )}
            >
              <span className={cn(
                "tnum block text-lg font-semibold leading-none",
                c.tone === "warning" && c.value > 0 ? "text-warning" : c.tone === "success" ? "text-success" : "text-foreground",
              )}>
                {c.value}
              </span>
              <span className="mt-1 block text-[11px] text-muted-foreground">{c.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
          <Input
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            placeholder="Agent, NPN, email, phone, upline, carrier or writing number"
            aria-label="Search agents"
            className="pl-8"
          />
        </div>

        <label className="sr-only" htmlFor="agent-sort">Sort agents</label>
        <select
          id="agent-sort"
          value={sort}
          onChange={(e) => setSearchParam({ sort: e.target.value, page: undefined })}
          className="h-9 rounded-md border border-border bg-card px-2 text-xs text-foreground"
        >
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> New request
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setSearchParam({ filter: f.key === "all" ? undefined : f.key, page: undefined })}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              (filter === f.key || (f.key === "all" && filter === "all"))
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Panel pad={false}>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[52px] rounded-lg" />)}
          </div>
        ) : error ? (
          <div className="p-4">
            <EmptyState
              title="That list didn't load"
              body={(error as Error)?.message ?? "Something went wrong reading contracting requests."}
              action={<Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={search.q || filter !== "all" ? "No agents match that" : "No contracting requests yet"}
              body={
                search.q || filter !== "all"
                  ? "Clear the search or filter to see every agent with a carrier request."
                  : "Create a contracting request when an agent needs a new carrier contract, transfer, state appointment or hierarchy change."
              }
              action={
                search.q || filter !== "all"
                  ? <Button size="sm" variant="outline" onClick={() => { setDraftQuery(""); navigate({ search: {} as any }); }}>Clear filters</Button>
                  : <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Create one</Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="hidden items-center gap-3 border-b border-border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground lg:flex">
              <span className="flex-[2]">Agent</span>
              <span className="w-24">NPN</span>
              <span className="flex-1">Upline</span>
              <span className="w-16 text-right">Carriers</span>
              <span className="w-24">Progress</span>
              <span className="w-24">Attention</span>
              <span className="flex-1">Status</span>
              <span className="w-24">Updated</span>
              <span className="w-5" />
            </div>

            <ul className={cn("divide-y divide-border-soft", isFetching && "opacity-60 transition-opacity")}>
              {rows.map((a) => (
                <li key={a.agent_id}>
                  <Link
                    to="/contracting-ops/requests/agent/$agentId"
                    params={{ agentId: a.agent_id }}
                    search={search as any}
                    className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-surface-2/40 focus-visible:bg-surface-2/60 lg:flex-nowrap"
                  >
                    <span className="flex min-w-0 flex-[2] items-center gap-2.5">
                      <span
                        aria-hidden
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-foreground"
                      >
                        {a.initials}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{a.agent_name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground lg:hidden">
                          {a.active_count} of {a.carrier_count} active
                          {a.needs_attention > 0 ? ` · ${a.needs_attention} need attention` : ""}
                        </span>
                        <span className="hidden truncate text-[11px] text-muted-foreground lg:block">
                          {a.carrier_names.slice(0, 3).join(", ")}
                          {a.carrier_names.length > 3 ? ` +${a.carrier_names.length - 3}` : ""}
                        </span>
                      </span>
                    </span>

                    <span className="tnum hidden w-24 truncate text-[11px] text-muted-foreground lg:block">
                      {a.npn ?? "—"}
                    </span>

                    <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground lg:block">
                      {a.upline_name ?? "—"}
                    </span>

                    <span className="tnum hidden w-16 text-right text-sm text-foreground lg:block">
                      {a.carrier_count}
                    </span>

                    <span className="hidden w-24 lg:block">
                      <span className="tnum block text-[11px] text-muted-foreground">
                        {a.active_count} of {a.carrier_count} active
                      </span>
                      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                        <span
                          className={cn("block h-full rounded-full", a.fully_contracted ? "bg-success" : "bg-primary")}
                          style={{ width: `${a.carrier_count ? (a.active_count / a.carrier_count) * 100 : 0}%` }}
                        />
                      </span>
                    </span>

                    <span className="hidden w-24 lg:block">
                      {a.needs_attention > 0 ? (
                        <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                          {a.needs_attention} to fix
                        </span>
                      ) : (
                        <span className="text-[11px] text-text-dim">Clear</span>
                      )}
                    </span>

                    <span className="flex-1"><StatusBadge status={a.urgent_status} /></span>

                    <span className="hidden w-24 truncate text-[11px] text-muted-foreground lg:block">
                      {timeAgo(a.last_updated)}
                    </span>

                    <ChevronRight className="hidden h-4 w-4 shrink-0 text-text-dim lg:block" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      {(data?.total ?? 0) > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-text-dim">
            {data!.total} agent{data!.total === 1 ? "" : "s"} · page {page} of {totalPages}. You see the agents your
            role covers.
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm" variant="outline" disabled={page <= 1}
                onClick={() => setSearchParam({ page: page - 1 <= 1 ? undefined : page - 1 })}
              >
                Previous
              </Button>
              <Button
                size="sm" variant="outline" disabled={page >= totalPages}
                onClick={() => setSearchParam({ page: page + 1 })}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      <CreateRequestDialog
        open={creating}
        carriers={(carrierData?.carriers ?? []) as any[]}
        agents={(agentData?.agents ?? []) as any[]}
        pending={create.isPending}
        onClose={() => setCreating(false)}
        onSave={(p) => create.mutate(p)}
      />
    </div>
  );
}

/**
 * New request.
 *
 * States are entered as a comma list rather than a fifty-checkbox grid: staff
 * doing this all day type "TX, OK, NM" faster than they can hunt a grid, and
 * the field normalises whatever separator they use.
 */
function CreateRequestDialog({
  open, carriers, agents, pending, onClose, onSave,
}: {
  open: boolean; carriers: any[]; agents: any[]; pending: boolean;
  onClose: () => void; onSave: (p: any) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({ contract_type: "new_contract" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const selectClass = "mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm";

  const states = (form.requested_states ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length === 2);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New contracting request</DialogTitle>
          <DialogDescription>
            One open request per agent, carrier and type — a duplicate is refused rather than
            quietly created.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="cr-agent">Agent</Label>
            <select id="cr-agent" value={form.agent_id ?? ""} onChange={(e) => set("agent_id", e.target.value)} className={selectClass}>
              <option value="">Select…</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="cr-carrier">Carrier</Label>
            <select id="cr-carrier" value={form.org_carrier_id ?? ""} onChange={(e) => set("org_carrier_id", e.target.value)} className={selectClass}>
              <option value="">Select…</option>
              {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cr-type">Request type</Label>
            <select id="cr-type" value={form.contract_type} onChange={(e) => set("contract_type", e.target.value)} className={selectClass}>
              {CONTRACT_TYPES.map((t) => (
                <option key={t} value={t}>{CONTRACT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cr-states">Requested states</Label>
            <Input id="cr-states" value={form.requested_states ?? ""} onChange={(e) => set("requested_states", e.target.value)}
                   placeholder="TX, OK, NM" className="mt-1" />
            {states.length > 0 && (
              <p className="mt-1 text-[11px] text-text-dim">{states.length} state{states.length === 1 ? "" : "s"}: {states.join(", ")}</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cr-products">Product lines</Label>
            <Input id="cr-products" value={form.product_lines ?? ""} onChange={(e) => set("product_lines", e.target.value)}
                   placeholder="Final expense, Term" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="cr-priority">Priority</Label>
            <select id="cr-priority" value={form.priority ?? ""} onChange={(e) => set("priority", e.target.value)} className={selectClass}>
              <option value="">Agency default</option>
              {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="cr-eff">Desired effective date</Label>
            <Input id="cr-eff" type="date" value={form.desired_effective_date ?? ""}
                   onChange={(e) => set("desired_effective_date", e.target.value)} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cr-notes">Notes</Label>
            <textarea id="cr-notes" rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={pending || !form.agent_id || !form.org_carrier_id}
                  onClick={() => onSave({
                    agent_id: form.agent_id,
                    org_carrier_id: form.org_carrier_id,
                    contract_type: form.contract_type,
                    requested_states: states,
                    product_lines: (form.product_lines ?? "").split(",").map((p) => p.trim()).filter(Boolean),
                    priority: form.priority || undefined,
                    desired_effective_date: form.desired_effective_date || null,
                    is_transfer: form.contract_type === "transfer",
                    notes: form.notes?.trim() || null,
                  })}>
            {pending ? "Creating…" : "Create request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
