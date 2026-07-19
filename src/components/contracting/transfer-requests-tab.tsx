import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ArrowLeftRight, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  listTransferRequests, createTransferRequest, updateTransferStatus, addTransferNote,
  getTransferTimeline, searchAgencies, TRANSFER_TYPES, TRANSFER_STATUSES, type TransferRequest,
} from "@/lib/transfer-requests.functions";
import { useMyAccess } from "@/hooks/use-my-access";
import { CarrierReleasesContent } from "@/routes/_authenticated/contracting/transfers";

const TYPE_LABEL: Record<string, string> = {
  hierarchy_transfer: "Hierarchy Transfer",
  full_release: "Full Release",
  add_state: "Add State",
  writing_number_transfer: "Writing Number Transfer",
};

const STATUS_META: Record<string, { label: string; v: any }> = {
  draft: { label: "Draft", v: "outline" },
  submitted: { label: "Submitted", v: "info" },
  pending_agent: { label: "Pending Agent", v: "warning" },
  pending_carrier: { label: "Pending Carrier", v: "warning" },
  pending_receiving_agency: { label: "Pending Receiving Agency", v: "warning" },
  completed: { label: "Completed", v: "success" },
  rejected: { label: "Rejected", v: "destructive" },
  cancelled: { label: "Cancelled", v: "outline" },
};

const FILTERS = ["all", "incoming", "outgoing", "pending", "completed", "rejected"] as const;

export function TransferRequestsTab({
  carriers,
  prefillCarrierId,
}: {
  carriers: { id: string; name: string }[];
  prefillCarrierId?: string | null;
}) {
  const qc = useQueryClient();
  const { access } = useMyAccess();
  const listFn = useServerFn(listTransferRequests);
  const { data, isLoading } = useQuery({ queryKey: ["transfer-requests"], queryFn: () => listFn() });

  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [timelineFor, setTimelineFor] = useState<TransferRequest | null>(null);

  useEffect(() => {
    if (prefillCarrierId) setCreateOpen(true);
  }, [prefillCarrierId]);

  const rows = (data?.rows ?? []).filter((r) => {
    if (filter === "all") return true;
    if (filter === "incoming") return r.direction === "incoming";
    if (filter === "outgoing") return r.direction === "outgoing" || r.direction === "own";
    if (filter === "pending") return r.status.startsWith("pending") || r.status === "submitted";
    return r.status === filter;
  });

  const isOwner = !!access?.isOwner;

  return (
    <div className="space-y-[var(--gap)]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.filter((f) => (isOwner ? true : !["incoming", "outgoing"].includes(f))).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold border capitalize transition-colors",
                filter === f
                  ? "bg-gold-glow text-gold-bright border-primary/40"
                  : "bg-surface-2 text-muted-foreground border-border hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Request
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : rows.length === 0 ? (
        <Panel>
          <div className="py-10 text-center space-y-2">
            <ArrowLeftRight className="h-8 w-8 mx-auto text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              No transfer requests{filter !== "all" ? ` matching "${filter}"` : ""}. Use New Request to start a carrier hierarchy transfer or release.
            </div>
          </div>
        </Panel>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Panel key={r.id} className="!p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="font-medium">
                  {r.agent ? `${r.agent.first_name ?? ""} ${r.agent.last_name ?? ""}`.trim() : "Agent"}
                  <span className="text-muted-foreground"> · {r.carrier?.name ?? "Carrier"}</span>
                  {isOwner && r.direction !== "own" && (
                    <Badge variant={r.direction === "incoming" ? "info" : "outline"} className="ml-2 text-[10px] capitalize">{r.direction}</Badge>
                  )}
                </div>
                <Badge variant={STATUS_META[r.status]?.v ?? "outline"}>{STATUS_META[r.status]?.label ?? r.status}</Badge>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm mt-3">
                <Row k="Type" v={TYPE_LABEL[r.transfer_type] ?? r.transfer_type} />
                <Row k="From Agency" v={r.from_agency?.name ?? "—"} />
                <Row k="To Agency" v={r.to_agency?.name ?? r.to_agency_name ?? "—"} />
                <Row k="Submitted" v={new Date(r.created_at).toLocaleDateString()} tnum />
                <Row k="Current Level" v={r.current_level ?? "—"} tnum />
              </div>
              {r.reason && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">Notes: {r.reason}</p>}
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTimelineFor(r)}>
                  <Clock className="h-3 w-3 mr-1" /> View Timeline
                </Button>
                <StatusUpdater request={r} onDone={() => qc.invalidateQueries({ queryKey: ["transfer-requests"] })} />
                <NoteAdder request={r} onDone={() => qc.invalidateQueries({ queryKey: ["transfer-requests"] })} />
              </div>
            </Panel>
          ))}
        </div>
      )}

      {/* Legacy carrier-release workflow lives here too so nothing is lost */}
      <div className="pt-2 border-t border-border-soft">
        <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground mb-3">Carrier Releases</div>
        <CarrierReleasesContent />
      </div>

      {createOpen && (
        <NewRequestSheet
          carriers={carriers}
          prefillCarrierId={prefillCarrierId ?? null}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); qc.invalidateQueries({ queryKey: ["transfer-requests"] }); }}
        />
      )}
      {timelineFor && <TimelineSheet request={timelineFor} onClose={() => setTimelineFor(null)} />}
    </div>
  );
}

function Row({ k, v, tnum }: { k: string; v: string; tnum?: boolean }) {
  return (
    <div className="flex justify-between sm:justify-start sm:gap-3">
      <span className="text-muted-foreground w-32 shrink-0">{k}</span>
      <span className={tnum ? "tnum" : undefined}>{v}</span>
    </div>
  );
}

function StatusUpdater({ request, onDone }: { request: TransferRequest; onDone: () => void }) {
  const fn = useServerFn(updateTransferStatus);
  const mut = useMutation({
    mutationFn: (status: string) => fn({ data: { id: request.id, status: status as any } }),
    onSuccess: () => { toast.success("Status updated"); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't update"),
  });
  return (
    <Select onValueChange={(v) => mut.mutate(v)}>
      <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue placeholder="Update Status" /></SelectTrigger>
      <SelectContent>
        {TRANSFER_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>{STATUS_META[s]?.label ?? s}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NoteAdder({ request, onDone }: { request: TransferRequest; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const fn = useServerFn(addTransferNote);
  const mut = useMutation({
    mutationFn: () => fn({ data: { id: request.id, note } }),
    onSuccess: () => { toast.success("Note added"); setOpen(false); setNote(""); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't add note"),
  });
  if (!open) {
    return <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>Add Note</Button>;
  }
  return (
    <div className="flex gap-1.5 items-center flex-1 min-w-[200px]">
      <Input className="h-7 text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note…" autoFocus />
      <Button size="sm" className="h-7 text-xs" onClick={() => mut.mutate()} disabled={!note.trim() || mut.isPending}>Save</Button>
    </div>
  );
}

function TimelineSheet({ request, onClose }: { request: TransferRequest; onClose: () => void }) {
  const fn = useServerFn(getTransferTimeline);
  const { data, isLoading } = useQuery({
    queryKey: ["transfer-timeline", request.id],
    queryFn: () => fn({ data: { id: request.id } }),
  });
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>Activity Timeline</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
          {isLoading ? <Skeleton className="h-32" /> : (data?.events ?? []).map((e: any) => (
            <div key={e.id} className="flex gap-3 text-sm">
              <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium">
                  {e.action === "status_changed"
                    ? `${STATUS_META[e.previous_status]?.label ?? e.previous_status ?? "—"} → ${STATUS_META[e.new_status]?.label ?? e.new_status}`
                    : e.action === "note_added" ? "Note added" : "Request created"}
                </div>
                {e.note && <div className="text-xs text-muted-foreground mt-0.5">{e.note}</div>}
                <div className="text-[10.5px] text-text-dim mt-0.5 tnum">
                  {e.performer ? `${e.performer.first_name ?? ""} ${e.performer.last_name ?? ""}`.trim() : "—"} · {new Date(e.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
          {!isLoading && (data?.events?.length ?? 0) === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center">No activity yet.</div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NewRequestSheet({
  carriers, prefillCarrierId, onClose, onCreated,
}: {
  carriers: { id: string; name: string }[];
  prefillCarrierId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const createFn = useServerFn(createTransferRequest);
  const searchFn = useServerFn(searchAgencies);

  const [carrierId, setCarrierId] = useState(prefillCarrierId ?? "");
  const [type, setType] = useState<string>("hierarchy_transfer");
  const [agencyQuery, setAgencyQuery] = useState("");
  const [toAgency, setToAgency] = useState<{ id: string | null; name: string } | null>(null);
  const [reason, setReason] = useState("");

  const { data: agencyResults } = useQuery({
    queryKey: ["agency-search", agencyQuery],
    queryFn: () => searchFn({ data: { q: agencyQuery } }),
    enabled: agencyQuery.trim().length >= 2,
  });

  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          carrier_id: carrierId,
          transfer_type: type as any,
          to_agency_id: toAgency?.id ?? null,
          to_agency_name: toAgency?.id ? null : (toAgency?.name || agencyQuery.trim() || null),
          reason: reason.trim(),
        },
      }),
    onSuccess: () => { toast.success("Transfer request submitted"); onCreated(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't submit"),
  });

  const canSubmit = carrierId && reason.trim().length > 0;

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>New Transfer Request</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4">
          <div>
            <Label>Carrier</Label>
            <Select value={carrierId} onValueChange={setCarrierId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select carrier" /></SelectTrigger>
              <SelectContent>
                {carriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Transfer Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRANSFER_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Receiving Agency</Label>
            <Input
              className="mt-1"
              value={toAgency?.name ?? agencyQuery}
              onChange={(e) => { setToAgency(null); setAgencyQuery(e.target.value); }}
              placeholder="Search Agent Cloud agencies or type an external name"
            />
            {!toAgency && (agencyResults?.orgs?.length ?? 0) > 0 && (
              <div className="border border-border rounded-md mt-1 overflow-hidden">
                {agencyResults!.orgs.map((o: any) => (
                  <button
                    key={o.id}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-surface-2"
                    onClick={() => setToAgency({ id: o.id, name: o.name })}
                  >
                    {o.name}
                  </button>
                ))}
                <button
                  className="block w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-surface-2 border-t border-border-soft"
                  onClick={() => setToAgency({ id: null, name: agencyQuery.trim() })}
                >
                  Use "{agencyQuery.trim()}" as an external agency
                </button>
              </div>
            )}
          </div>
          <div>
            <Label>Reason (required)</Label>
            <Textarea className="mt-1 min-h-[90px]" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
          </div>
          <Button className="w-full" onClick={() => mut.mutate()} disabled={!canSubmit || mut.isPending}>
            {mut.isPending ? "Submitting…" : "Submit Request"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Your agency owner is notified automatically. Every status change is logged to the timeline.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
