import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Check, Copy, ExternalLink, Lock, Mail, Printer, Send, Table2, UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { getContractingRequest, updateRequestStatus } from "@/lib/contracting-ops.functions";
import { beginContractingHandoff } from "@/lib/contracting-handoff.functions";
import { generateEmail, generateSpreadsheetRow, listTemplates } from "@/lib/contracting-templates.functions";
// The same server function the queue's bulk assign calls, with one id. It
// already audits and notifies the assignee; a second single-request endpoint
// would be a second place for those to be forgotten.
import { bulkAssignRequests } from "@/lib/contracting-workflow.functions";
import { listOrgAgents } from "@/lib/contracting-records.functions";
import {
  CONTRACT_TYPE_LABELS, METHOD_LABELS, REQUEST_STATUSES, REQUEST_STATUS_META,
  type ContractType, type ContractingMethod, type RequestStatus,
} from "@/lib/contracting-ops/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { agentBlock, fullBlock, hierarchyBlock } from "@/lib/contracting-ops/packet";
import {
  DOC_STATUS_LABEL, DocStatusIcon, ReadinessBar, StatusBadge,
} from "@/components/contracting/shared";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracting-ops/requests/$requestId")({
  component: RequestDetailPage,
  head: () => ({ meta: [{ title: "Contracting Packet | Agent Cloud" }] }),
});

function CopyButton({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          // Clipboard is blocked in some embedded browsers; say so rather than
          // failing silently and leaving the operator thinking it copied.
          toast.error("Your browser blocked the copy. Select the text manually.");
        }
      }}
    >
      {done ? <Check className="mr-1.5 h-3.5 w-3.5 text-success" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
      {done ? "Copied" : label}
    </Button>
  );
}

function Field({ label, value, masked }: { label: string; value: string | null; masked?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 truncate text-sm", value ? "text-foreground" : "text-text-dim")}>
        {masked ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Lock className="h-3 w-3" /> Hidden
          </span>
        ) : (value || "Not on file")}
      </dd>
    </div>
  );
}

function RequestDetailPage() {
  const { requestId } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getContractingRequest);
  const statusFn = useServerFn(updateRequestStatus);
  const templatesFn = useServerFn(listTemplates);
  const emailFn = useServerFn(generateEmail);
  const sheetFn = useServerFn(generateSpreadsheetRow);
  const [draftEmail, setDraftEmail] = useState<any | null>(null);
  // `writing_number_issued` is the only status that carries a fact with it.
  // Selecting it opens this rather than moving straight to the final state,
  // because a request that reached "writing number issued" without the number
  // is the exact dead end this workflow had before.
  const [issuingNumber, setIssuingNumber] = useState<string | null>(null);
  /**
   * The status being composed, before it is sent.
   *
   * `StatusSchema` has always accepted `agent_visible_message`,
   * `internal_message`, `next_action` and `decline_reason`, and no control
   * supplied any of them. The consequence people actually met: choosing
   * Declined from the dropdown sent `{ status: "declined" }` with nothing
   * else, so every decline in the system was recorded with no reason — the
   * agent got "Declined" and no explanation, and `decline_reason` stayed null
   * on a column that exists precisely to hold it.
   */
  const [composing, setComposing] = useState<null | {
    status: RequestStatus;
    message: string;
    internal: string;
    nextAction: string;
    reason: string;
  }>(null);
  const compose = (status: RequestStatus) =>
    setComposing({ status, message: "", internal: "", nextAction: "", reason: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "request", requestId],
    queryFn: () => getFn({ data: { id: requestId } }),
  });
  const { data: templateData } = useQuery({
    queryKey: ["contracting-ops", "templates"], queryFn: () => templatesFn(),
  });

  const makeEmail = useMutation({
    mutationFn: (templateId: string) => emailFn({ data: { request_id: requestId, template_id: templateId } }),
    onSuccess: (r: any) => setDraftEmail(r),
    onError: (e: any) => toast.error(e?.message ?? "Could not generate the email"),
  });

  const makeSheet = useMutation({
    mutationFn: (templateId: string) => sheetFn({ data: { request_ids: [requestId], template_id: templateId } }),
    onSuccess: (r: any) => {
      // Required-but-empty columns are named rather than silently exported —
      // a carrier rejecting a batch over one blank column costs days.
      if (r.problems?.length) {
        toast.warning(`Exported with gaps: ${r.problems[0].missing.join(", ")}`);
      } else {
        toast.success("Spreadsheet row exported");
      }
      const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url; a.download = r.filename; a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not export"),
  });

  const handoffFn = useServerFn(beginContractingHandoff);
  const handoff = useMutation({
    // The window opens synchronously on click and gets its destination when
    // the server answers — the one shape popup blockers permit. `about:blank`
    // plus a severed opener, not `noopener` in the features string, because
    // `noopener` makes window.open return null and there would be nothing to
    // point at the URL.
    mutationFn: async (vars: { method_id?: string }) => {
      const w = window.open("about:blank", "_blank");
      if (w) w.opener = null;
      try {
        const r = await handoffFn({ data: { request_id: requestId, ...vars } });
        if (r.url.startsWith("mailto:")) {
          w?.close();
          window.location.href = r.url;
        } else if (w) {
          w.location.href = r.url;
        } else {
          window.open(r.url, "_blank", "noopener,noreferrer");
        }
        return r;
      } catch (e) {
        w?.close();
        throw e;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracting-ops", "request", requestId] }),
    onError: (e: any) => toast.error(e?.message ?? "Could not open the carrier's contracting flow"),
  });

  const assignFn = useServerFn(bulkAssignRequests);
  const agentsFn = useServerFn(listOrgAgents);
  // Only fetched for staff, who are the only people offered the control.
  const { data: staff } = useQuery({
    queryKey: ["contracting-ops", "org-agents"],
    queryFn: () => agentsFn({}),
    staleTime: 5 * 60 * 1000,
  });

  const assign = useMutation({
    mutationFn: (assigned_to: string | null) =>
      assignFn({ data: { ids: [requestId], assigned_to } }),
    onSuccess: (_r, assigned_to) => {
      toast.success(assigned_to ? "Assigned." : "Unassigned.");
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not assign that request."),
  });

  const setStatus = useMutation({
    mutationFn: (vars: { status: string; agent_visible_message?: string | null }) =>
      statusFn({ data: { id: requestId, ...vars } as any }),
    onSuccess: () => {
      toast.success("Request updated");
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    // The readiness gate throws with the outstanding items named, which is
    // exactly the message the operator needs — surface it verbatim.
    onError: (e: any) => toast.error(e?.message ?? "Could not update the request"),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">That request is not available to you.</p>;
  }

  const { packet, readiness, access, request, methods, history, submissions } = data as any;
  const handoffs = ((submissions ?? []) as any[]).filter((s) => s.artifact_type === "portal_handoff");
  const ready = readiness.blockers.length === 0 && readiness.state === "ready_to_submit";
  const isStaff = access.canSubmit || access.canApprove;

  return (
    <div className="space-y-4 ac-print-root">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/contracting-ops/requests" className="ac-no-print">
          <Button variant="ghost" size="sm"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> All requests</Button>
        </Link>
        <span className="tnum text-sm font-semibold text-foreground">{packet.request.reference}</span>
        <StatusBadge status={request.status} />
        <span className="text-sm text-muted-foreground">
          {packet.carrier.name} · {CONTRACT_TYPE_LABELS[packet.request.contract_type as ContractType]}
        </span>
        {/* Browser print-to-PDF rather than a bundled PDF library: it produces
            a correct, selectable document with no extra dependency, and the
            print rules below strip the app chrome. */}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto ac-no-print"
          onClick={() => window.print()}
        >
          <Printer className="mr-1.5 h-3.5 w-3.5" /> Print or save as PDF
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* ── The packet ── */}
        <div className="space-y-4">
          <Panel
            title="Agent information"
            action={
              <span className="flex items-center gap-2">
                {/* This packet is one carrier. The record behind it is every
                    carrier, licence and document — which is the next question
                    an operator has when a blocker here does not explain itself. */}
                <Link
                  to="/agency/agents/$agentId"
                  search={{ tab: "contracting" }}
                  params={{ agentId: request.agent_id }}
                  className="ac-no-print inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  Open agent record <ExternalLink className="h-3 w-3" />
                </Link>
                <CopyButton label="Copy agent" text={agentBlock(packet)} />
              </span>
            }
          >
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Full legal name" value={packet.agent.full_legal_name} />
              <Field label="NPN" value={packet.agent.npn} />
              <Field label="Email" value={packet.agent.email} />
              <Field label="Phone" value={packet.agent.phone} />
              <Field label="Resident state" value={packet.agent.resident_state} />
              <Field label="Resident license" value={packet.agent.resident_license_number} />
              {/* Date of birth appears only when a carrier requirement asks for
                  it, and only to staff. */}
              {packet.agent.date_of_birth !== null && (
                <Field label="Date of birth" value={packet.agent.date_of_birth} masked={!isStaff} />
              )}
              <Field label="Requested states" value={packet.request.requested_states.join(", ") || null} />
              <Field label="Requested products" value={packet.request.product_lines.join(", ") || null} />
              <Field label="Requested level" value={packet.request.requested_comp_level} />
              <Field label="Advance level" value={packet.request.requested_advance_level} />
              <Field label="Desired effective date" value={packet.request.desired_effective_date} />
            </dl>
          </Panel>

          <Panel
            title="Hierarchy for this carrier"
            action={<CopyButton label="Copy hierarchy" text={hierarchyBlock(packet)} />}
          >
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Direct upline" value={packet.hierarchy.upline_name} />
              <Field label="Upline NPN" value={packet.hierarchy.upline_npn} />
              <Field label="Upline writing number" value={packet.hierarchy.upline_writing_number} />
              <Field label="Upline email" value={packet.hierarchy.upline_email} />
              <Field label="Agency owner" value={packet.hierarchy.agency_owner_name} />
              <Field label="Agency owner NPN" value={packet.hierarchy.agency_owner_npn} />
              <Field label="Agency writing number" value={packet.hierarchy.agency_writing_number} />
              <Field label="Hierarchy path" value={packet.hierarchy.hierarchy_path} />
            </dl>
            <p className="mt-3 text-[11px] text-text-dim">
              This is the hierarchy recorded for {packet.carrier.name}, which can differ from your
              internal org chart. Edit it under Hierarchies.
            </p>
          </Panel>

          <Panel title="Required documents">
            {packet.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents are configured for this carrier yet. Add them under Carrier Directory →
                Requirements.
              </p>
            ) : (
              <ul className="divide-y divide-border-soft">
                {packet.documents.map((d: any) => (
                  <li key={d.requirement_key} className="flex items-center gap-3 py-2">
                    <DocStatusIcon status={d.status} />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{d.label}</span>
                    {d.is_sensitive && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-text-dim">
                        <Lock className="h-3 w-3" /> Sensitive
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {DOC_STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {draftEmail && (
            <Panel
              title="Generated email"
              action={
                <span className="flex gap-2">
                  <CopyButton label="Copy body" text={draftEmail.body} />
                  <a
                    href={`mailto:${encodeURIComponent(draftEmail.to ?? "")}?subject=${encodeURIComponent(draftEmail.subject)}&body=${encodeURIComponent(draftEmail.body)}`}
                  >
                    <Button size="sm"><Mail className="mr-1.5 h-3.5 w-3.5" /> Open in mail</Button>
                  </a>
                </span>
              }
            >
              {draftEmail.unresolved?.length > 0 && (
                <p className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
                  These variables did not fill in and are still showing as placeholders:{" "}
                  {draftEmail.unresolved.join(", ")}. Fix the underlying records or edit the draft
                  before sending.
                </p>
              )}
              <dl className="space-y-1 text-xs">
                <div className="flex gap-2"><dt className="w-14 text-muted-foreground">To</dt><dd className="text-foreground">{draftEmail.to || "—"}</dd></div>
                <div className="flex gap-2"><dt className="w-14 text-muted-foreground">Subject</dt><dd className="text-foreground">{draftEmail.subject}</dd></div>
              </dl>
              <textarea
                readOnly
                value={draftEmail.body}
                rows={14}
                className="mt-3 w-full rounded-md border border-border bg-surface-2/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground"
              />
              <p className="mt-2 text-[11px] text-text-dim">
                Nothing has been sent. No document is attached — send any paperwork yourself, and
                only what the carrier asked for.
              </p>
            </Panel>
          )}

          <Panel title="History">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing has happened on this request yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {history.map((h: any) => (
                  <li key={h.id} className="flex gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    <div className="min-w-0">
                      <div className="text-sm text-foreground">
                        {h.from_status ? `${h.from_status} → ${h.to_status}` : `Created as ${h.to_status}`}
                      </div>
                      {h.agent_visible_message && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{h.agent_visible_message}</div>
                      )}
                      {h.internal_message && (
                        <div className="mt-0.5 text-xs text-warning">Internal: {h.internal_message}</div>
                      )}
                      <div className="mt-0.5 text-[10px] text-text-dim">
                        {new Date(h.created_at).toLocaleString()}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* ── Readiness and submission ── */}
        <div className="space-y-4">
          <Panel title="Contract readiness">
            <ReadinessBar state={readiness.state} pct={readiness.pct} blockers={readiness.blockers} />
            {readiness.optional_gaps.length > 0 && (
              <p className="mt-3 text-[11px] text-text-dim">
                Optional and not blocking: {readiness.optional_gaps.map((g: any) => g.label).join(", ")}
              </p>
            )}
          </Panel>

          <Panel title="How this carrier takes submissions">
            <dl className="space-y-3">
              <Field
                label="Method"
                value={packet.carrier.method
                  ? METHOD_LABELS[packet.carrier.method as ContractingMethod] ?? packet.carrier.method
                  : null}
              />
              <Field label="Turnaround" value={packet.carrier.turnaround_days ? `${packet.carrier.turnaround_days} days` : null} />
              <Field label="Support" value={packet.carrier.support_email ?? packet.carrier.support_phone} />
            </dl>

            {packet.carrier.instructions && (
              <p className="mt-3 whitespace-pre-line rounded-lg border border-border bg-surface-2/40 p-3 text-xs leading-relaxed text-muted-foreground">
                {packet.carrier.instructions}
              </p>
            )}

            {/* Every departure goes through beginContractingHandoff rather
                than a raw <a>: the server resolves the destination, fills any
                {npn}-style prefill, and records who left, when, from where —
                which is the whole funnel between "ready" and "submitted". */}
            <div className="mt-4 space-y-2">
              {(methods as any[]).filter((m) => m.method !== "email" ? m.target_url : m.target_email).map((m, i) => (
                <Button
                  key={m.id}
                  variant={i === 0 ? "default" : "outline"}
                  size="sm"
                  className="w-full justify-start"
                  disabled={handoff.isPending}
                  onClick={() => handoff.mutate({ method_id: m.id })}
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Open {METHOD_LABELS[m.method as ContractingMethod] ?? m.method}
                </Button>
              ))}
              {/* Carriers configured before methods existed: one button, the
                  server picks from the legacy columns. */}
              {(methods as any[]).length === 0 &&
                (packet.carrier.surelc_url || packet.carrier.portal_url || packet.carrier.invitation_link) && (
                <Button
                  size="sm"
                  className="w-full justify-start"
                  disabled={handoff.isPending}
                  onClick={() => handoff.mutate({})}
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open contracting flow
                </Button>
              )}
              {packet.carrier.contracting_email && (
                <a href={`mailto:${packet.carrier.contracting_email}`} className="block">
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Mail className="mr-1.5 h-3.5 w-3.5" /> {packet.carrier.contracting_email}
                  </Button>
                </a>
              )}
              <CopyButton label="Copy everything" text={fullBlock(packet)} />
            </div>

            {handoffs.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-border-soft pt-3">
                {handoffs.slice(0, 5).map((h: any) => (
                  <p key={h.id} className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      Opened {METHOD_LABELS[h.method as ContractingMethod] ?? h.method ?? "portal"}
                      {" · "}{new Date(h.generated_at).toLocaleDateString()}
                    </span>
                    <span className={h.marked_submitted_at ? "text-success" : "text-text-dim"}>
                      {h.marked_submitted_at ? "submitted" : "not yet marked submitted"}
                    </span>
                  </p>
                ))}
              </div>
            )}

            {methods.length === 0 && (
              <p className="mt-3 text-[11px] text-text-dim">
                No submission method is configured for this carrier yet. Add one under Carrier Directory
                so staff know where this goes.
              </p>
            )}
          </Panel>

          {isStaff && (
            <Panel title="Actions" className="ac-no-print">
              <div className="space-y-2">
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!ready || setStatus.isPending}
                  onClick={() => setStatus.mutate({ status: "ready_to_submit" })}
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" /> Mark ready to submit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={!ready || setStatus.isPending}
                  onClick={() => setStatus.mutate({ status: "submitted" })}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Mark submitted to carrier
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({
                    status: "missing_information",
                    agent_visible_message: "We need a little more information before this can go to the carrier.",
                  })}
                >
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Request missing information
                </Button>

                {/* The other fourteen.

                    Three buttons covered three transitions out of seventeen,
                    so a carrier decision — approved, declined, and the
                    writing number that ends the whole thing — had nowhere to
                    be recorded. The server has accepted all seventeen since
                    the workflow was built, with its own permission and
                    readiness gates; only the buttons were missing. */}
                {/* Assignment existed only in bulk, on the queue. So a staff
                    member reading one request could not take it — they had to
                    go back to the list, find it again, and tick it. */}
                <div className="pt-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Assigned to
                  </label>
                  <Select
                    value={data.request.assigned_to ?? "none"}
                    onValueChange={(v) => assign.mutate(v === "none" ? null : v)}
                    disabled={assign.isPending}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">Unassigned</SelectItem>
                      {((staff as any)?.rows ?? (staff as any) ?? []).map((p: any) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || "Unnamed"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    The person assigned is told, and the change is audited — the same server
                    function the queue's bulk assign uses.
                  </p>
                </div>

                <div className="pt-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Set status
                  </label>
                  <Select
                    value=""
                    onValueChange={(v) => {
                      if (v === "writing_number_issued") setIssuingNumber("");
                      // Everything else goes through the compose step, so a
                      // status change can carry the explanation the server has
                      // always been willing to store. Sending it bare is still
                      // one click away — the compose panel's fields are all
                      // optional except a decline's reason.
                      else compose(v as RequestStatus);
                    }}
                    disabled={setStatus.isPending}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Choose a status…" />
                    </SelectTrigger>
                    <SelectContent>
                      {REQUEST_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {REQUEST_STATUS_META[s].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Ready to submit and Submitted are gated on readiness; the
                    carrier decisions need contracting rights. The server says
                    so plainly if a move isn't allowed.
                  </p>

                  {composing && (
                    <div className="mt-2 space-y-2 rounded-md border border-border bg-surface-2 p-2">
                      <p className="text-xs font-medium text-foreground">
                        {REQUEST_STATUS_META[composing.status].label}
                      </p>

                      {composing.status === "declined" && (
                        <div>
                          <label htmlFor="decline-reason" className="mb-1 block text-xs font-medium">
                            Why the carrier declined
                          </label>
                          <textarea
                            id="decline-reason"
                            autoFocus
                            rows={2}
                            value={composing.reason}
                            onChange={(e) =>
                              setComposing({ ...composing, reason: e.target.value })
                            }
                            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                            placeholder="e.g. Open debt with a prior carrier"
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Required. A decline with no reason gives the agent nothing to act on
                            and nothing to appeal.
                          </p>
                        </div>
                      )}

                      <div>
                        <label htmlFor="agent-msg" className="mb-1 block text-xs font-medium">
                          What the agent sees
                        </label>
                        <textarea
                          id="agent-msg"
                          rows={2}
                          value={composing.message}
                          onChange={(e) => setComposing({ ...composing, message: e.target.value })}
                          className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                          placeholder="Optional — shown on their Contracts page"
                        />
                      </div>

                      <div>
                        <label htmlFor="next-action" className="mb-1 block text-xs font-medium">
                          What happens next
                        </label>
                        <input
                          id="next-action"
                          value={composing.nextAction}
                          onChange={(e) =>
                            setComposing({ ...composing, nextAction: e.target.value })
                          }
                          className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                          placeholder="Optional — e.g. Upload a current licence"
                        />
                      </div>

                      <div>
                        <label htmlFor="internal-note" className="mb-1 block text-xs font-medium">
                          Internal note
                        </label>
                        <textarea
                          id="internal-note"
                          rows={2}
                          value={composing.internal}
                          onChange={(e) => setComposing({ ...composing, internal: e.target.value })}
                          className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                          placeholder="Optional — staff only, never shown to the agent"
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={
                            setStatus.isPending ||
                            (composing.status === "declined" && !composing.reason.trim())
                          }
                          onClick={() => {
                            setStatus.mutate({
                              status: composing.status,
                              // Empty strings are omitted rather than sent, so
                              // a blank field does not overwrite anything or
                              // create a history row that says nothing.
                              ...(composing.message.trim()
                                ? { agent_visible_message: composing.message.trim() }
                                : {}),
                              ...(composing.internal.trim()
                                ? { internal_message: composing.internal.trim() }
                                : {}),
                              ...(composing.nextAction.trim()
                                ? { next_action: composing.nextAction.trim() }
                                : {}),
                              ...(composing.reason.trim()
                                ? { decline_reason: composing.reason.trim() }
                                : {}),
                            } as any);
                            setComposing(null);
                          }}
                        >
                          Save status
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setComposing(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {issuingNumber !== null && (
                    <div className="mt-2 rounded-md border border-border bg-surface-2 p-2">
                      <label
                        htmlFor="wn-issued"
                        className="mb-1 block text-xs font-medium text-foreground"
                      >
                        Writing number the carrier issued
                      </label>
                      <input
                        id="wn-issued"
                        autoFocus
                        value={issuingNumber}
                        onChange={(e) => setIssuingNumber(e.target.value)}
                        className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                        placeholder="e.g. 4471902"
                      />
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        Recorded against the agent and this carrier, and shown
                        on their Contracts page and in the team matrix.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={!issuingNumber.trim() || setStatus.isPending}
                          onClick={() => {
                            setStatus.mutate({
                              status: "writing_number_issued",
                              writing_number: issuingNumber.trim(),
                            } as any);
                            setIssuingNumber(null);
                          }}
                        >
                          Record and close
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setIssuingNumber(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {!ready && (
                <p className="mt-3 text-[11px] text-warning">
                  Submission is blocked until the outstanding items above are cleared. This is checked
                  again on the server, so the button is not the only guard.
                </p>
              )}

              <div className="mt-4 space-y-2 border-t border-border-soft pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Generate
                </p>

                {(templateData?.emails ?? []).length > 0 ? (
                  <select
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) { makeEmail.mutate(e.target.value); e.currentTarget.value = ""; } }}
                    className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                  >
                    <option value="">Generate an email…</option>
                    {(templateData?.emails ?? []).map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[11px] text-text-dim">
                    No email template yet — add one under Templates.
                  </p>
                )}

                {(templateData?.spreadsheets ?? []).length > 0 ? (
                  <select
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) { makeSheet.mutate(e.target.value); e.currentTarget.value = ""; } }}
                    className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                  >
                    <option value="">Export a spreadsheet row…</option>
                    {(templateData?.spreadsheets ?? []).map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="flex items-start gap-1.5 text-[11px] text-text-dim">
                    <Table2 className="mt-0.5 h-3 w-3 shrink-0" />
                    No spreadsheet template yet — add one under Templates.
                  </p>
                )}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
