import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Panel } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { getAgentContracting } from "@/lib/contracting-records.functions";
import { CONTRACT_TYPE_LABELS, type ContractType } from "@/lib/contracting-ops/types";
import { Pill } from "@/components/contracting/table";
import { EmptyState, StatusBadge } from "@/components/contracting/shared";
import { ProducerNotesPanel } from "@/components/contracting/producer-notes-panel";
import { cn } from "@/lib/utils";

/**
 * Everything contracting knows about one agent, on one screen.
 *
 * The question this answers — "where is Daniel, and what is stopping him?" —
 * had no single place to be asked. Licences were in the licensing sheet,
 * writing numbers in a tab of Requests, appointments nowhere at all, and what a
 * carrier still needs only inside a request that had to be created first.
 *
 * Ordered the way the question is actually asked: what is blocking each
 * carrier, then the licences those blocks refer to, then the appointments and
 * numbers that prove the ones that cleared.
 */
export function AgentContractingTab({ agentId }: { agentId: string }) {
  const fn = useServerFn(getAgentContracting);
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-contracting", agentId],
    queryFn: () => fn({ data: { agent_id: agentId } }),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">
          {(error as any)?.message ?? "Contracting records are not available for this agent."}
        </p>
      </Panel>
    );
  }

  const d = data as any;

  return (
    <div className="space-y-4">
      <CarrierReadiness carriers={d.carriers} requests={d.requests} />
      <Licences licenses={d.licenses} warnDays={d.warnDays} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Appointments rows={d.appointments} />
        <WritingNumbers rows={d.writing_numbers} />
      </div>
      <Documents rows={d.documents} />
      <ProducerNotesPanel agentId={agentId} />
    </div>
  );
}

function CarrierReadiness({ carriers, requests }: { carriers: any[]; requests: any[] }) {
  if (carriers.length === 0) {
    return (
      <Panel title="Carriers">
        <EmptyState
          title="No carrier relationship yet"
          body="Once a contracting request is created or a writing number recorded, each carrier appears here with what it still needs."
        />
      </Panel>
    );
  }

  return (
    <Panel title="Carriers and what each still needs" pad={false}>
      <ul className="divide-y divide-border-soft">
        {carriers.map((c) => (
          <li key={c.org_carrier_id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{c.carrier_name}</span>
              {c.writing_number && (
                <span className="tnum text-[11px] text-muted-foreground">#{c.writing_number}</span>
              )}
              {c.request_status
                ? <StatusBadge status={c.request_status} />
                : <Pill tone={c.writing_number ? "success" : "neutral"}>{c.writing_number ? "Appointed" : "No open request"}</Pill>}
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className={cn("block h-full rounded-full", c.readiness_pct === 100 ? "bg-success" : "bg-primary")}
                    style={{ width: `${c.readiness_pct}%` }}
                  />
                </span>
                <span className="tnum text-[11px] text-muted-foreground">{c.readiness_pct}%</span>
              </span>
              {c.request_id && (
                <Link
                  to="/contracting-ops/requests/$requestId"
                  params={{ requestId: c.request_id }}
                  className="inline-flex shrink-0 items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  Open packet <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>

            {c.blockers.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {c.blockers.map((b: any) => (
                  <li
                    key={b.requirement_key}
                    title={b.reason}
                    className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/[0.06] px-2 py-0.5 text-[10px] text-foreground"
                  >
                    <AlertTriangle className="h-2.5 w-2.5 text-warning" />
                    {b.label}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {requests.length > carriers.length && (
        <p className="border-t border-border-soft px-4 py-2 text-[11px] text-text-dim">
          {requests.length} request{requests.length === 1 ? "" : "s"} in total, including settled ones.
        </p>
      )}
    </Panel>
  );
}

function Licences({ licenses, warnDays }: { licenses: any[]; warnDays: number }) {
  const trouble = licenses.filter((l) => l.expired || l.expiring_soon).length;
  return (
    <Panel
      title={`Licences${trouble ? ` — ${trouble} need attention` : ""}`}
      pad={false}
    >
      {licenses.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No licences recorded"
            body="Upload and review a PDB report, or add a licence by hand from the licensing table."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border-soft">
          {[...licenses]
            .sort((a, b) => String(a.expires_date ?? "9999").localeCompare(String(b.expires_date ?? "9999")))
            .map((l) => (
              <li key={l.id} className="flex items-center gap-2 px-4 py-2">
                <span className="w-8 shrink-0 text-sm font-semibold text-foreground">{l.state_code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-muted-foreground">
                    {l.license_number ?? "No number"}{l.is_resident ? " · Resident" : ""}
                  </span>
                  <span className="block truncate text-[10px] text-text-dim">
                    {l.last_verified_at
                      ? `Verified ${new Date(l.last_verified_at).toLocaleDateString()} · ${String(l.verification_source ?? "").replace(/_/g, " ")}`
                      : "Never verified"}
                  </span>
                </span>
                <span className={cn("tnum shrink-0 text-xs", l.expired ? "text-destructive" : "text-muted-foreground")}>
                  {l.expires_date ?? "No expiry"}
                </span>
                {l.expired
                  ? <Pill tone="danger">Expired</Pill>
                  : l.expiring_soon
                    ? <Pill tone="warning">Within {warnDays} days</Pill>
                    : <Pill tone={l.status === "active" ? "success" : "neutral"}>{l.status}</Pill>}
              </li>
            ))}
        </ul>
      )}
    </Panel>
  );
}

function Appointments({ rows }: { rows: any[] }) {
  return (
    <Panel title="Carrier appointments" pad={false}>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          None recorded. Appointments come from a reviewed PDB report or are entered by staff.
        </p>
      ) : (
        <ul className="divide-y divide-border-soft">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{a.carrier_name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{a.state_code ?? "—"}</span>
              <Pill tone={a.status === "active" ? "success" : a.status === "pending" ? "warning" : "neutral"}>
                {a.status}
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function WritingNumbers({ rows }: { rows: any[] }) {
  return (
    <Panel title="Writing numbers" pad={false}>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          None on file. A carrier issues one when contracting is approved.
        </p>
      ) : (
        <ul className="divide-y divide-border-soft">
          {rows.map((n) => (
            <li key={n.id} className="flex items-center gap-2 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{n.carrier_name}</span>
              <span className="tnum shrink-0 font-medium text-foreground">{n.writing_number}</span>
              <span className="shrink-0 text-[10px] text-text-dim">
                {n.state_code ?? n.product_line ?? n.scope}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const DOC_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  approved: "success", uploaded: "warning", rejected: "danger",
  expired: "danger", superseded: "neutral",
};

function Documents({ rows }: { rows: any[] }) {
  return (
    <Panel title="Documents on file" pad={false}>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nothing uploaded yet.</p>
      ) : (
        <ul className="divide-y divide-border-soft">
          {rows.map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate capitalize">{String(d.doc_type).replace(/_/g, " ")}</span>
              {d.expiration_date && (
                <span className={cn("tnum shrink-0 text-xs", d.expired ? "text-destructive" : "text-muted-foreground")}>
                  {d.expiration_date}
                </span>
              )}
              <Pill tone={d.expired ? "danger" : (DOC_TONE[d.review_status] ?? "neutral")}>
                {d.expired ? "expired" : (d.review_status ?? "uploaded")}
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Exported so the request packet can label a type the same way this does. */
export function contractTypeLabel(t: string) {
  return CONTRACT_TYPE_LABELS[t as ContractType] ?? t;
}
