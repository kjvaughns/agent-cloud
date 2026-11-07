import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronRight, Copy, Search, Trophy, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { FilterChips, EmptyCard } from "@/components/ui-kit/states";
import { PreviewCard } from "@/components/ui-kit/hub";
import { fmtCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isInactiveAgentId } from "@/lib/agents/inactive";
import { gettingReady, goingQuiet } from "@/lib/team/needs-you";
import { producedInRange } from "@/lib/team/production";
import { STAGE_LABELS } from "@/lib/team-roster";
import type { RosterAgent } from "@/lib/team.functions";

export type TeamChip = "all" | "producing" | "onboarding" | "attention";

function initials(a: RosterAgent) {
  return `${(a.first_name ?? "?")[0] ?? "?"}${(a.last_name ?? "")[0] ?? ""}`.toUpperCase();
}
const name = (a: RosterAgent) => `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || a.email || "Agent";

const DOT: Record<string, string> = {
  ok: "bg-success", warn: "bg-warning", bad: "bg-destructive", unknown: "bg-muted-foreground/40",
};

/** People who need a nudge: can't sell yet, stopped selling, or carry a flag. */
export function attentionIds(rows: RosterAgent[]) {
  const s = new Set<string>();
  for (const a of gettingReady(rows)) s.add(a.id);
  for (const a of goingQuiet(rows)) s.add(a.id);
  for (const a of rows) if (a.flags.length) s.add(a.id);
  return s;
}

export function TeamFilterBar({ rows, chip, onChip, search, onSearch }: {
  rows: RosterAgent[]; chip: TeamChip; onChip: (c: TeamChip) => void; search: string; onSearch: (s: string) => void;
}) {
  const counts = useMemo(() => ({
    all: rows.length,
    producing: rows.filter((a) => producedInRange(a.own, a.team)).length,
    onboarding: gettingReady(rows).length,
    attention: attentionIds(rows).size,
  }), [rows]);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative sm:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search your team…" className="pl-9 rounded-full" />
      </div>
      <FilterChips<TeamChip>
        className="flex-nowrap overflow-x-auto"
        value={chip} onChange={onChip}
        options={[
          { value: "all", label: "All", count: counts.all },
          { value: "producing", label: "Producing", count: counts.producing },
          { value: "onboarding", label: "Onboarding", count: counts.onboarding },
          { value: "attention", label: "Needs attention", count: counts.attention },
        ]}
      />
    </div>
  );
}

export function filterRows(rows: RosterAgent[], chip: TeamChip, search: string) {
  const q = search.trim().toLowerCase();
  const ready = new Set(gettingReady(rows).map((a) => a.id));
  const att = chip === "attention" ? attentionIds(rows) : null;
  return rows.filter((a) => {
    if (q && !`${a.first_name} ${a.last_name} ${a.email}`.toLowerCase().includes(q)) return false;
    if (chip === "producing" && !producedInRange(a.own, a.team)) return false;
    if (chip === "onboarding" && !ready.has(a.id)) return false;
    if (att && !att.has(a.id)) return false;
    return true;
  });
}

export function AgentCard({ a, onOpen }: { a: RosterAgent; onOpen: (id: string) => void }) {
  const canOpen = !isInactiveAgentId(a.id);
  return (
    <button
      type="button"
      onClick={() => canOpen && onOpen(a.id)}
      className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar className="h-11 w-11"><AvatarFallback className="bg-gold-glow text-sm font-semibold">{initials(a)}</AvatarFallback></Avatar>
          <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card", DOT[a.compliance] ?? DOT.unknown)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {name(a)}
            {(a as any).is_self && <span className="ml-2 text-[10px] font-normal text-muted-foreground">You</span>}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {a.position_name ? `${a.position_name}${a.position_pct != null ? ` · ${a.position_pct}%` : ""}` : "No position yet"}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-center">
        <div><p className="tnum text-sm font-semibold">{fmtCurrency(a.own.premium)}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Own</p></div>
        <div><p className="tnum text-sm font-semibold">{a.team.premium ? fmtCurrency(a.team.premium) : "—"}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Team</p></div>
        <div><p className="tnum text-sm font-semibold">{a.active_carriers}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Carriers</p></div>
      </div>
      <p className={cn("truncate text-xs", a.flags.length ? "text-warning" : "text-muted-foreground")}>
        {a.flags.length ? a.flags[0].reason : STAGE_LABELS[a.stage]}
      </p>
    </button>
  );
}

export function AgentCardGrid({ rows, onOpen }: { rows: RosterAgent[]; onOpen: (id: string) => void }) {
  const [limit, setLimit] = useState(24);
  if (rows.length === 0) return <EmptyCard title="No agents match" body="Try another filter or clear the search." />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.slice(0, limit).map((a) => <AgentCard key={a.id} a={a} onOpen={onOpen} />)}
      </div>
      {rows.length > limit && (
        <div className="text-center">
          <Button variant="outline" className="rounded-full" onClick={() => setLimit((l) => l + 24)}>
            Show more ({rows.length - limit})
          </Button>
        </div>
      )}
    </div>
  );
}

export function TeamPulse({ rows, onOpen, attentionOpen, onAttention }: {
  rows: RosterAgent[]; onOpen: (id: string) => void; attentionOpen: boolean; onAttention: () => void;
}) {
  const top = useMemo(() => [...rows].filter((a) => a.own.premium > 0).sort((a, b) => b.own.premium - a.own.premium).slice(0, 3), [rows]);
  const att = useMemo(() => attentionIds(rows).size, [rows]);
  const link = typeof window !== "undefined" ? `${window.location.origin}/contracting/invite` : "";
  return (
    <>
      <PreviewCard className="p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Trophy className="h-4 w-4 text-primary" /> Top producers</p>
        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground">No production in this range yet.</p>
        ) : (
          <ol className="space-y-2">
            {top.map((a, i) => (
              <li key={a.id}>
                <button type="button" onClick={() => !isInactiveAgentId(a.id) && onOpen(a.id)} className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-surface-2">
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold", i === 0 ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground")}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{name(a)}</span>
                  <span className="tnum text-sm font-semibold">{fmtCurrency(a.own.premium)}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </PreviewCard>

      <button type="button" onClick={onAttention} aria-expanded={attentionOpen}
        className={cn("flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
          att ? "border-warning/40 bg-warning/10 hover:bg-warning/15" : "border-border bg-card")}>
        <AlertTriangle className={cn("h-4 w-4 shrink-0", att ? "text-warning" : "text-muted-foreground")} />
        <span className="flex-1 text-sm">
          {att ? <><span className="tnum font-semibold">{att}</span> agent{att === 1 ? "" : "s"} need attention</> : "Everyone's on track"}
        </span>
        {att > 0 && <span className="text-xs text-muted-foreground">{attentionOpen ? "Hide" : "View"}</span>}
      </button>

      <PreviewCard className="space-y-2 p-4">
        <p className="text-sm font-semibold">Grow your team</p>
        <Button asChild className="w-full rounded-full"><Link to="/contracting/invite"><UserPlus className="mr-2 h-4 w-4" />Invite agent</Link></Button>
        <Button variant="outline" className="w-full rounded-full" onClick={() => { navigator.clipboard.writeText(link); toast.success("Invite link copied"); }}>
          <Copy className="mr-2 h-4 w-4" />Copy invite link
        </Button>
      </PreviewCard>
    </>
  );
}
