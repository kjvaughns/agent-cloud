import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, ClipboardCopy, History, Loader2 } from "lucide-react";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { getContractingAgentWorkspace, getRequestHistory } from "@/lib/contracting-agents.functions";
import { addRequestNote, updateRequestStatus } from "@/lib/contracting-ops.functions";
import {
  ADVANCE_OPTION_LABELS, PRIMARY_REQUEST_STATUSES, REQUEST_STATUS_META,
  isAgentActionStatus, type AdvanceOptionKey, type RequestStatus,
} from "@/lib/contracting-ops/types";
import { EmptyState, StatusBadge } from "@/components/contracting/shared";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracting-ops/requests/agent/$agentId")({
  component: AgentWorkspace,
  head: () => ({
    meta: [
      { title: "Agent contracting | Agent Cloud" },
      { name: "description", content: "One agent's carrier contracting: every request, its status, writing number, compensation and history." },
    ],
  }),
});

/**
 * One agent's contracting, on one page.
 *
 * The carrier requests are edited in place here — status, writing number and
 * notes — because opening a separate page per carrier to change one field is
 * most of the working day for contracting staff. Each row is still its own
 * record: changing one carrier's status touches nothing else.
 */
function AgentWorkspace() {
  const { agentId } = Route.useParams();
  const search = Route.useSearch() as Record<string, unknown>;
  const fn = useServerFn(getContractingAgentWorkspace);

  const { data, isLoading, error } = useQuery({
    queryKey: ["contracting-ops", "agent-workspace", agentId],
    queryFn: () => fn({ data: { agentId } }),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-48 rounded-md" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Panel>
        <EmptyState
          title="That agent didn't load"
          body={(error as Error)?.message ?? "This agent may not be in your agency."}
          action={<BackLink search={search} />}
        />
      </Panel>
    );
  }

  const { agent, hierarchy, requests, progress, access } = data;

  const contactBlock = [
    agent.name,
    agent.npn ? `NPN ${agent.npn}` : null,
    agent.email,
    agent.phone,
    agent.position_name ? `Level: ${agent.position_name}${agent.position_pct != null ? ` (${agent.position_pct}%)` : ""}` : null,
    hierarchy.upline_name ? `Upline: ${hierarchy.upline_name}` : null,
    hierarchy.upline_npn ? `Upline NPN: ${hierarchy.upline_npn}` : null,
  ].filter(Boolean).join("\n");

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackLink search={search} />
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-foreground">
            {agent.initials}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold leading-tight text-foreground">{agent.name}</h2>
            <p className="tnum text-[11px] text-muted-foreground">
              {progress.active} of {progress.total} active
              {progress.needs_attention > 0 ? ` · ${progress.needs_attention} needing the agent` : ""}
              {data.last_updated ? ` · updated ${timeAgo(data.last_updated)}` : ""}
            </p>
          </div>
        </div>
        {progress.needs_attention > 0 && (
          <span className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning">
            {progress.needs_attention} need attention
          </span>
        )}
      </div>

      {/* Agent + hierarchy, two compact columns */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Agent</h3>
            <CopyButton label="Copy agent info" value={contactBlock} />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <Field label="Full legal name" value={agent.name} />
            <Field label="NPN" value={agent.npn} mono />
            <Field label="Email" value={agent.email} />
            <Field label="Phone" value={agent.phone} />
            <Field label="Agency position" value={agent.position_name} />
            <Field label="Compensation" value={agent.position_pct != null ? `${agent.position_pct}%` : null} />
          </dl>
        </Panel>

        <Panel>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Hierarchy</h3>
            <div className="flex gap-1.5">
              <CopyButton
                label="Copy hierarchy"
                value={[
                  hierarchy.upline_name ? `Upline: ${hierarchy.upline_name}` : null,
                  hierarchy.upline_npn ? `Upline NPN: ${hierarchy.upline_npn}` : null,
                  hierarchy.owner_name ? `Agency owner: ${hierarchy.owner_name}` : null,
                  hierarchy.owner_npn ? `Owner NPN: ${hierarchy.owner_npn}` : null,
                ].filter(Boolean).join("\n")}
              />
              <CopyButton label="Copy contracting info" value={contactBlock} />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <Field label="Direct upline" value={hierarchy.upline_name} />
            <Field label="Upline NPN" value={hierarchy.upline_npn} mono />
            <Field label="Agency owner" value={hierarchy.owner_name} />
            <Field label="Owner NPN" value={hierarchy.owner_npn} mono />
          </dl>
        </Panel>
      </div>

      {/* Carrier requests */}
      <Panel pad={false}>
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Carrier requests ({requests.length})
          </h3>
        </div>

        {requests.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No carrier requests" body="This agent has no contracting requests on file yet." />
          </div>
        ) : (
          <>
            <div className="hidden items-center gap-3 border-b border-border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground lg:flex">
              <span className="flex-1">Carrier</span>
              <span className="w-40">Level granted</span>
              <span className="w-28">Advance</span>
              <span className="w-40">Status</span>
              <span className="w-36">Writing number</span>
              <span className="flex-1">Note</span>
              <span className="w-20">Updated</span>
              <span className="w-9" />
            </div>
            <ul className="divide-y divide-border-soft">
              {requests.map((r) => (
                <CarrierRow key={r.id} row={r} agentId={agentId} access={access} />
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}

function BackLink({ search }: { search: Record<string, unknown> }) {
  return (
    <Link
      to="/contracting-ops/requests"
      search={search as any}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to agents
    </Link>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.06em] text-text-dim">{label}</dt>
      <dd className={cn("truncate text-sm text-foreground", mono && "tnum")}>{value || "—"}</dd>
    </div>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 px-2 text-[11px]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Your browser blocked the clipboard");
        }
      }}
    >
      {done ? <Check className="mr-1 h-3 w-3" /> : <ClipboardCopy className="mr-1 h-3 w-3" />}
      {done ? "Copied" : label}
    </Button>
  );
}

/**
 * One carrier request, editable in place.
 *
 * Validation lives on the server — Active needs a writing number, Agent action
 * needed needs a note the agent can read, Declined needs a reason — and this
 * form asks for whichever of those the chosen status requires before it will
 * submit, so the refusal is a prompt rather than an error.
 */
function CarrierRow({ row, agentId, access }: { row: any; agentId: string; access: any }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(updateRequestStatus);
  const noteFn = useServerFn(addRequestNote);

  const [status, setStatus] = useState<RequestStatus>(row.status);
  const [writing, setWriting] = useState<string>(row.writing_number ?? "");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [internal, setInternal] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  // What the carrier actually granted. "" means "not recorded"; "custom" lets
  // staff type a percentage when the carrier put them somewhere off the ladder.
  const options: { id: string; level_name: string; commission_pct: number | null }[] = row.comp_level_options ?? [];
  // A grant recorded as a bare name (carriers whose rungs come from the
  // commission grid, not a configured ladder) still selects its own option.
  const matchedByName = row.granted_level_name
    ? options.find((o) => o.level_name.toLowerCase() === row.granted_level_name!.trim().toLowerCase())
    : undefined;
  const initialLevel = row.granted_comp_level_id
    ? row.granted_comp_level_id
    : matchedByName
      ? matchedByName.id
      : row.granted_level_name || row.granted_pct != null
        ? "custom"
        : "";
  const [levelChoice, setLevelChoice] = useState<string>(initialLevel);
  const [customName, setCustomName] = useState<string>(row.granted_level_name ?? "");
  const [customPct, setCustomPct] = useState<string>(row.granted_pct != null ? String(row.granted_pct) : "");
  const [advance, setAdvance] = useState<string>(row.advance_option ?? "");

  const dirtyStatus = status !== row.status;
  const dirtyWriting = (row.writing_number ?? "") !== writing.trim();
  const dirtyLevel =
    levelChoice !== initialLevel ||
    (levelChoice === "custom" &&
      (customName !== (row.granted_level_name ?? "") ||
        customPct !== (row.granted_pct != null ? String(row.granted_pct) : "")));
  const dirtyAdvance = advance !== (row.advance_option ?? "");
  const dirty = dirtyStatus || dirtyWriting || dirtyLevel || dirtyAdvance;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["contracting-ops", "agent-workspace", agentId] });
    qc.invalidateQueries({ queryKey: ["contracting-ops"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const chosen = options.find((o) => o.id === levelChoice);
      const pctText = customPct.trim();
      await statusFn({
        data: {
          id: row.id,
          status,
          writing_number: writing.trim() || null,
          agent_visible_message: message.trim() || null,
          internal_message: internal.trim() || null,
          decline_reason: reason.trim() || null,
          // The rung the carrier actually granted. A ladder pick carries the
          // carrier's own name and percentage; "custom" carries whatever staff
          // typed; empty clears the grant rather than guessing at one.
          // Grid-derived rungs have no row in the comp-level table, so they are
          // stored as a name + percentage instead of a level id.
          granted_comp_level_id: chosen && !chosen.id.startsWith("grid:") ? chosen.id : null,
          granted_level_name: chosen
            ? chosen.level_name
            : levelChoice === "custom"
              ? customName.trim() || (pctText ? `${pctText}%` : null)
              : null,
          granted_pct: chosen
            ? chosen.commission_pct ?? null
            : levelChoice === "custom" && pctText
              ? Number(pctText)
              : null,
          granted_advance_option: (advance || null) as any,
        },
      });
    },
    onSuccess: () => {
      toast.success("Saved");
      setMessage(""); setReason(""); setInternal("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that change"),
  });

  const note = useMutation({
    mutationFn: async (kind: "agent" | "internal") =>
      noteFn({
        data: {
          id: row.id,
          agent_visible_message: kind === "agent" ? message.trim() : null,
          internal_message: kind === "internal" ? internal.trim() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Note added");
      setMessage(""); setInternal("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not add the note"),
  });

  const needsNote = isAgentActionStatus(status);
  const needsWriting = status === "active" || status === "writing_number_issued";
  const needsReason = status === "declined";
  const blocked =
    (needsNote && !message.trim()) ||
    (needsWriting && !writing.trim()) ||
    (needsReason && !reason.trim() && !row.decline_reason);

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:flex-nowrap">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{row.carrier_name}</span>
          <span className="tnum block truncate text-[11px] text-muted-foreground">{row.reference ?? "—"}</span>
        </span>

        <span className="w-40 min-w-0">
          {access?.canUpdateStatus ? (
            <>
              <label className="sr-only" htmlFor={`lvl-${row.id}`}>Carrier level granted for {row.carrier_name}</label>
              <select
                id={`lvl-${row.id}`}
                value={levelChoice}
                onChange={(e) => setLevelChoice(e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-card px-2 text-xs text-foreground"
              >
                <option value="">Level not recorded</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.level_name}{o.commission_pct != null ? ` · ${o.commission_pct}%` : ""}
                  </option>
                ))}
                <option value="custom">Other level / percentage…</option>
              </select>
              <span className="block truncate text-[10px] text-text-dim">
                {options.length === 0
                  ? "No levels on file for this carrier — use “Other level / percentage”"
                  : `Asked at: ${row.comp_level ?? "—"}`}
              </span>
            </>
          ) : (
            <>
              <span className="block truncate text-xs text-foreground">{row.comp_level ?? "—"}</span>
              <span className="block truncate text-[10px] text-text-dim">{row.comp_source ?? "Not set"}</span>
            </>
          )}
        </span>

        <span className="w-28 min-w-0">
          {access?.canUpdateStatus ? (
            <>
              <label className="sr-only" htmlFor={`adv-${row.id}`}>Advance for {row.carrier_name}</label>
              <select
                id={`adv-${row.id}`}
                value={advance}
                onChange={(e) => setAdvance(e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-card px-2 text-xs text-foreground"
              >
                <option value="">Advance —</option>
                {Object.entries(ADVANCE_OPTION_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </>
          ) : (
            <span className="truncate text-xs text-muted-foreground">
              {row.advance_option ? ADVANCE_OPTION_LABELS[row.advance_option as AdvanceOptionKey] ?? row.advance_option : "—"}
            </span>
          )}
        </span>

        <span className="w-40">
          {access?.canUpdateStatus ? (
            <>
              <label className="sr-only" htmlFor={`st-${row.id}`}>Status for {row.carrier_name}</label>
              <select
                id={`st-${row.id}`}
                value={status}
                onChange={(e) => setStatus(e.target.value as RequestStatus)}
                className="h-8 w-full rounded-md border border-border bg-card px-2 text-xs text-foreground"
              >
                {/* The stored value first when it is a legacy one, so a row
                    never silently re-labels itself just by being opened. */}
                {!(PRIMARY_REQUEST_STATUSES as readonly string[]).includes(row.status) && (
                  <option value={row.status}>{REQUEST_STATUS_META[row.status as RequestStatus]?.label ?? row.status}</option>
                )}
                {PRIMARY_REQUEST_STATUSES.map((s) => (
                  <option key={s} value={s}>{REQUEST_STATUS_META[s].label}</option>
                ))}
              </select>
            </>
          ) : (
            <StatusBadge status={row.status} />
          )}
        </span>

        <span className="w-36">
          {access?.canSetWritingNumber ? (
            <>
              <label className="sr-only" htmlFor={`wn-${row.id}`}>Writing number for {row.carrier_name}</label>
              <Input
                id={`wn-${row.id}`}
                value={writing}
                onChange={(e) => setWriting(e.target.value)}
                placeholder="Writing number"
                className="h-8 text-xs"
              />
            </>
          ) : (
            <span className="tnum text-xs text-foreground">{row.writing_number ?? "—"}</span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          {row.agent_note ? (
            <span
              className={cn(
                "block truncate text-[11px]",
                isAgentActionStatus(row.status) ? "text-warning" : "text-muted-foreground",
              )}
              title={row.agent_note}
            >
              {row.agent_note}
            </span>
          ) : (
            <span className="text-[11px] text-text-dim">No note</span>
          )}
          {row.internal_note && (
            <span className="block truncate text-[11px] text-text-dim" title={row.internal_note}>
              Internal: {row.internal_note}
            </span>
          )}
        </span>

        <span className="w-20 truncate text-[11px] text-muted-foreground">{timeAgo(row.updated_at)}</span>

        <button
          onClick={() => setShowHistory((v) => !v)}
          aria-label={`History for ${row.carrier_name}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
        >
          <History className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* What the chosen status still needs, and nothing more. */}
      {dirty && (
        <div className="mt-2 space-y-2 rounded-md border border-border bg-surface-2/30 p-2.5">
          {levelChoice === "custom" && (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor={`lvn-${row.id}`} className="block text-[11px] text-muted-foreground">Level name</label>
                <Input
                  id={`lvn-${row.id}`} value={customName} onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Street 90" className="h-8 w-40 text-xs"
                />
              </div>
              <div>
                <label htmlFor={`lvp-${row.id}`} className="block text-[11px] text-muted-foreground">Percentage</label>
                <Input
                  id={`lvp-${row.id}`} value={customPct} onChange={(e) => setCustomPct(e.target.value)}
                  inputMode="decimal" placeholder="90" className="h-8 w-24 text-xs"
                />
              </div>
              <p className="text-[11px] text-text-dim">
                Use this only when the carrier put them somewhere that isn't on the configured ladder.
              </p>
            </div>
          )}
          {needsNote && (
            <div>
              <label htmlFor={`msg-${row.id}`} className="text-[11px] font-medium text-warning">
                Tell the agent exactly what to do — required for “Agent action needed”
              </label>
              <textarea
                id={`msg-${row.id}`} rows={2} value={message} onChange={(e) => setMessage(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
                placeholder="e.g. Upload your E&O certificate — it expired in June."
              />
            </div>
          )}
          {needsReason && (
            <div>
              <label htmlFor={`rsn-${row.id}`} className="text-[11px] font-medium text-destructive">
                Reason for declining — required
              </label>
              <textarea
                id={`rsn-${row.id}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
              />
            </div>
          )}
          {needsWriting && !writing.trim() && (
            <p className="text-[11px] text-warning">Active needs a writing number — add it above.</p>
          )}
          {access?.canNoteInternal && (
            <div>
              <label htmlFor={`int-${row.id}`} className="text-[11px] text-muted-foreground">
                Internal note (staff only, never shown to the agent)
              </label>
              <textarea
                id={`int-${row.id}`} rows={1} value={internal} onChange={(e) => setInternal(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={save.isPending || blocked} onClick={() => save.mutate()}>
              {save.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…</> : "Save changes"}
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => {
                setStatus(row.status); setWriting(row.writing_number ?? "");
                setLevelChoice(initialLevel);
                setCustomName(row.granted_level_name ?? "");
                setCustomPct(row.granted_pct != null ? String(row.granted_pct) : "");
                setAdvance(row.advance_option ?? "");
                setMessage(""); setReason(""); setInternal("");
              }}
            >
              Cancel
            </Button>
            {blocked && <span className="text-[11px] text-text-dim">Fill in what's required above.</span>}
          </div>
        </div>
      )}

      {/* Notes without a status change. */}
      {!dirty && (message.trim() || internal.trim()) && (
        <div className="mt-2 flex gap-2">
          {message.trim() && (
            <Button size="sm" disabled={note.isPending} onClick={() => note.mutate("agent")}>Send note to agent</Button>
          )}
          {internal.trim() && access?.canNoteInternal && (
            <Button size="sm" variant="outline" disabled={note.isPending} onClick={() => note.mutate("internal")}>
              Save internal note
            </Button>
          )}
        </div>
      )}

      {!dirty && access?.canNoteAgent && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-muted-foreground">Add a note</summary>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            <textarea
              rows={2} value={message} onChange={(e) => setMessage(e.target.value)}
              aria-label={`Agent-visible note for ${row.carrier_name}`}
              placeholder="Note the agent will see"
              className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
            />
            {access?.canNoteInternal && (
              <textarea
                rows={2} value={internal} onChange={(e) => setInternal(e.target.value)}
                aria-label={`Internal note for ${row.carrier_name}`}
                placeholder="Internal note (staff only)"
                className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
              />
            )}
          </div>
        </details>
      )}

      {showHistory && (
        <div className="mt-2 rounded-md border border-border bg-surface-2/20 p-2.5">
          <RequestTimeline requestId={row.id} />
        </div>
      )}
    </li>
  );
}

/**
 * A compact timeline for one carrier request.
 *
 * Statuses, notes, writing-number and level changes, and who did each one —
 * loaded only when opened, because a workspace with a dozen carriers should not
 * fetch a dozen histories nobody asked for.
 */
function RequestTimeline({ requestId }: { requestId: string }) {
  const fn = useServerFn(getRequestHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "request-history", requestId],
    queryFn: () => fn({ data: { requestId } }),
  });

  if (isLoading) return <Skeleton className="h-16 rounded-md" />;
  const rows = data?.rows ?? [];
  if (!rows.length) return <p className="text-xs text-muted-foreground">Nothing has happened on this request yet.</p>;

  return (
    <ol className="space-y-2">
      {rows.map((h: any) => (
        <li key={h.id} className="flex gap-2">
          <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
          <div className="min-w-0">
            <div className="text-xs text-foreground">
              {h.field
                ? `${h.field}: ${h.old_value ?? "—"} → ${h.new_value ?? "—"}`
                : h.change_kind === "note" || h.change_kind === "internal_note"
                  ? "Note added"
                  : h.from_status
                    ? `${REQUEST_STATUS_META[h.from_status as RequestStatus]?.label ?? h.from_status} → ${REQUEST_STATUS_META[h.to_status as RequestStatus]?.label ?? h.to_status}`
                    : `Created as ${REQUEST_STATUS_META[h.to_status as RequestStatus]?.label ?? h.to_status}`}
            </div>
            {h.agent_visible_message && <div className="text-[11px] text-muted-foreground">{h.agent_visible_message}</div>}
            {h.internal_message && <div className="text-[11px] text-warning">Internal: {h.internal_message}</div>}
            <div className="text-[10px] text-text-dim">
              {new Date(h.created_at).toLocaleString()}{h.changed_by_name ? ` · ${h.changed_by_name}` : ""}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
