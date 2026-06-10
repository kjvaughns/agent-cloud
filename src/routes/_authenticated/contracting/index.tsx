import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listMyContracts, addAgentCarrier, requestCommissionLevel, listCarriers,
  listDownlineMatrix, assignDownlineContract, updateContractStatus,
  listWorkInbox, activateContract, createContractRequest, deleteContractRequest,
} from "@/lib/contracting.functions";
import { checkSureLcStatus, getSureLcSsoUrl, submitToSureLc, syncSureLcStatuses } from "@/lib/surelc.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ContractStatusBadge, CONTRACT_STATUSES, statusDot, type ContractStatus } from "@/components/contracting/contract-status-badge";
import { Plus, AlertTriangle, ExternalLink, CheckCircle2, Inbox, AlertCircle, Trash2, RefreshCw, Send } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracting/")({
  component: ContractingHome,
  head: () => ({ meta: [{ title: "Contract Requests | Agent Cloud" }] }),
});

const myContractsQuery = queryOptions({
  queryKey: ["contracting","myContracts"],
  queryFn: () => listMyContracts(),
});
const carriersQuery = queryOptions({
  queryKey: ["contracting","carriers"],
  queryFn: () => listCarriers(),
});

function ContractingHome() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contracting</h1>
        <p className="text-sm text-muted-foreground">Manage your carrier contracts and downline agent contracting</p>
      </div>
      <Tabs defaultValue="my">
        <TabsList>
          <TabsTrigger value="my">My Contracts</TabsTrigger>
          <TabsTrigger value="downline">Downline Contracts</TabsTrigger>
          <TabsTrigger value="inbox">Work Inbox</TabsTrigger>
        </TabsList>
        <TabsContent value="my" className="mt-4"><MyContractsTab /></TabsContent>
        <TabsContent value="downline" className="mt-4"><DownlineTab /></TabsContent>
        <TabsContent value="inbox" className="mt-4"><InboxTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------- Inline Writing Number Activation ----------------
function AddWritingNumberInline({ contractId, onActivated }: { contractId: string; onActivated: () => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const activateFn = useServerFn(activateContract);

  const save = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await activateFn({ data: { contract_id: contractId, writing_number: value.trim() } });
      toast.success("Contract activated!");
      onActivated();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to activate");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Agent #"
        className="h-7 text-xs w-28"
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      <Button size="sm" className="h-7 text-xs px-2" onClick={save} disabled={!value.trim() || saving}>
        {saving ? "…" : "Activate"}
      </Button>
    </div>
  );
}

// ---------------- My Contracts ----------------
function MyContractsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(myContractsQuery);
  const deleteFn = useServerFn(deleteContractRequest);
  const [filter, setFilter] = useState<ContractStatus | "all">("all");
  const [requestLevelFor, setRequestLevelFor] = useState<any | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const checkSureLcFn = useServerFn(checkSureLcStatus);
  const syncFn = useServerFn(syncSureLcStatuses);
  const getSsoFn = useServerFn(getSureLcSsoUrl);
  const submitToSureLcFn = useServerFn(submitToSureLc);

  const { data: sureLcStatus } = useQuery({
    queryKey: ["surelc", "status"],
    queryFn: () => checkSureLcFn({}),
    staleTime: 60 * 60 * 1000,
  });
  const sureLcAvailable = sureLcStatus?.available ?? false;

  useEffect(() => {
    if (!sureLcAvailable) return;
    syncFn({ data: {} }).then((result) => {
      if (result && result.activated > 0) {
        toast.success(`${result.activated} contract${result.activated > 1 ? "s" : ""} activated via SureLC`);
        qc.invalidateQueries({ queryKey: ["contracting"] });
      }
    }).catch(() => {});
  }, [sureLcAvailable]);

  const openInSureLc = async () => {
    try {
      const result = await getSsoFn({ data: {} });
      if (result.sso_url) {
        window.open(result.sso_url, "_blank", "noopener,noreferrer");
      } else {
        toast.info(result.message ?? "SureLC link unavailable");
      }
    } catch {
      toast.error("Failed to generate SureLC link");
    }
  };

  const submitContract = async (row: any) => {
    setSubmittingId(row.id);
    try {
      const result = await submitToSureLcFn({
        data: { contract_request_id: row.id, carrier_id: row.carrier_id },
      });
      if (result.submitted) {
        toast.success(result.message ?? "Submitted to SureLC");
        qc.invalidateQueries({ queryKey: ["contracting"] });
      } else {
        toast.info(result.message ?? "Queued for manual processing");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Submission failed");
    } finally {
      setSubmittingId(null);
    }
  };

  const rows = data?.rows ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    CONTRACT_STATUSES.forEach(s => c[s] = 0);
    rows.forEach((r: any) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);
  const filtered = filter === "all" ? rows : rows.filter((r: any) => r.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilter("all")}
            className={cn("text-xs rounded-full border px-3 py-1", filter === "all" ? "bg-foreground text-background" : "bg-card hover:bg-muted")}
          >All: {rows.length}</button>
          {CONTRACT_STATUSES.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={cn("text-xs rounded-full border px-3 py-1 capitalize", filter === s ? "bg-foreground text-background" : "bg-card hover:bg-muted")}
            >{s}: {counts[s] ?? 0}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {sureLcAvailable && (
            <Button size="sm" variant="outline" onClick={openInSureLc}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open in SureLC
            </Button>
          )}
          <AddCarrierDialog onAdded={() => qc.invalidateQueries({ queryKey: ["contracting"] })} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Showing {filtered.length} of {rows.length} contracts</p>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
          No contracts yet. Click "+ Add Carrier" to add your first active carrier contract.
        </CardContent></Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {filtered.map((c: any) => (
            <Card key={c.id}><AccordionItem value={c.id} className="border-0">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex-1 text-left">
                    <div className="font-semibold">{c.carriers?.name ?? "Carrier"}</div>
                    <div className="text-xs text-muted-foreground">Requested: {fmtDate(c.requested_at)}</div>
                  </div>
                  <ContractStatusBadge status={c.status} />
                  {c.status !== "active" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`Remove ${c.carriers?.name ?? "this carrier"} from your contracts?`)) return;
                        try {
                          await deleteFn({ data: { id: c.id } });
                          qc.invalidateQueries({ queryKey: ["contracting", "myContracts"] });
                          toast.success("Contract request removed");
                        } catch (err: any) {
                          toast.error(err.message ?? "Failed");
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-3">
                  {c.status === "issue" && c.issue_description && (
                    <Alert variant="default" className="border-orange-500/40 bg-orange-500/10">
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                      <AlertTitle className="text-orange-700 dark:text-orange-300">Issue</AlertTitle>
                      <AlertDescription>{c.issue_description}</AlertDescription>
                    </Alert>
                  )}
                  {c.writing_number && (
                    <div className="rounded-lg border p-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs text-muted-foreground">Writing Number</div>
                        <div className="font-mono font-semibold">{c.writing_number}</div>
                      </div>
                      {c.carriers?.agent_portal_url && (
                        <a href={c.carriers.agent_portal_url} target="_blank" rel="noreferrer"
                          className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
                          <ExternalLink className="h-3.5 w-3.5" /> Access Agent Portal
                        </a>
                      )}
                    </div>
                  )}
                  {c.status === "active" && c.activated_at && (
                    <div className="text-sm inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" /> Active: {fmtDate(c.activated_at)}
                    </div>
                  )}
                  {c.status === "assigned" && (
                    <div className="flex items-center gap-2 flex-wrap rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                      <span className="text-xs text-primary font-medium flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Add your agent # to activate
                      </span>
                      <AddWritingNumberInline
                        contractId={c.id}
                        onActivated={() => qc.invalidateQueries({ queryKey: ["contracting"] })}
                      />
                    </div>
                  )}
                  {c.notes && <div className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Notes:</span> {c.notes}</div>}
                  {c.surelc_request_id && (
                    <div className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                      <RefreshCw className="h-3 w-3" /> Tracking in SureLC
                    </div>
                  )}
                  <div className="pt-1 flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => setRequestLevelFor(c)}>
                      Request Commission Level
                    </Button>
                    {sureLcAvailable && c.status === "requested" && c.carriers?.surelc_carrier_code && !c.surelc_request_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={submittingId === c.id}
                        onClick={() => submitContract(c)}
                      >
                        {submittingId === c.id
                          ? <><RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> Submitting…</>
                          : <><Send className="h-3 w-3 mr-1.5" /> Submit to SureLC</>
                        }
                      </Button>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem></Card>
          ))}
        </Accordion>
      )}
      {requestLevelFor && (
        <RequestLevelDialog
          contract={requestLevelFor}
          onClose={() => setRequestLevelFor(null)}
        />
      )}
    </div>
  );
}

const LOA_OPTIONS = [
  { value: "life", label: "Life" },
  { value: "health_accident", label: "Health & Accident" },
  { value: "annuity", label: "Annuity" },
  { value: "life_health", label: "Life & Health" },
] as const;

function AddCarrierDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"active" | "request">("active");
  const [carrierId, setCarrierId] = useState("");
  const [writingNumber, setWritingNumber] = useState("");
  const [loa, setLoa] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery({ ...carriersQuery, enabled: open });
  const addFn = useServerFn(addAgentCarrier);
  const requestFn = useServerFn(createContractRequest);

  const submit = useMutation({
    mutationFn: () => {
      if (mode === "active") {
        return addFn({ data: { carrier_id: carrierId, writing_number: writingNumber || undefined, loa: loa as any } });
      } else {
        return requestFn({ data: { carrier_id: carrierId, notes: notes || undefined } });
      }
    },
    onSuccess: () => {
      toast.success(mode === "active" ? "Carrier added" : "Contracting request sent");
      setOpen(false);
      setCarrierId(""); setWritingNumber(""); setLoa(""); setNotes(""); setError(null);
      onAdded();
    },
    onError: (e: any) => setError(e?.message ?? "Failed"),
  });

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) { setCarrierId(""); setWritingNumber(""); setLoa(""); setNotes(""); setError(null); setMode("active"); }
  }

  const canSubmit = mode === "active"
    ? (!!carrierId && !!writingNumber.trim() && !!loa)
    : !!carrierId;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" /> Add Carrier</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "active" ? "Add Active Carrier" : "Request Contracting"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === "active" ? "default" : "outline"}
              onClick={() => { setMode("active"); setError(null); }}
            >
              I have a writing number
            </Button>
            <Button
              size="sm"
              variant={mode === "request" ? "default" : "outline"}
              onClick={() => { setMode("request"); setError(null); }}
            >
              Request contracting
            </Button>
          </div>

          <div>
            <Label>Carrier</Label>
            <Select value={carrierId} onValueChange={(v) => { setCarrierId(v); setError(null); }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select carrier..." /></SelectTrigger>
              <SelectContent>
                {(data?.carriers ?? []).filter((c: any) => !c.my_active).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.is_annuity_carrier ? " (Annuity)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === "active" ? (
            <>
              <div>
                <Label>Writing / Agent Number *</Label>
                <Input value={writingNumber} onChange={(e) => setWritingNumber(e.target.value.slice(0, 64))} className="mt-1" placeholder="e.g. AG-12345" />
              </div>
              <div>
                <Label>Line of Authority *</Label>
                <Select value={loa} onValueChange={setLoa}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select LOA..." /></SelectTrigger>
                  <SelectContent>
                    {LOA_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div>
              <Label>Message to admin (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} className="mt-1" rows={3} placeholder="Any notes about this contracting request..." />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!canSubmit || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? "Saving..." : mode === "active" ? "Add Carrier" : "Send Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestLevelDialog({ contract, onClose }: { contract: any; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const reqFn = useServerFn(requestCommissionLevel);
  const submit = useMutation({
    mutationFn: () => reqFn({ data: { carrier_id: contract.carrier_id, message: message || undefined } }),
    onSuccess: () => { toast.success("Request sent to your upline"); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Request Commission Level</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border p-3 bg-muted/30">
            <div className="text-xs text-muted-foreground">Carrier</div>
            <div className="font-semibold">{contract.carriers?.name ?? "Carrier"}</div>
          </div>
          <div>
            <Label>Message to upline (optional)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 500))}
              className="mt-1"
              rows={3}
              placeholder="e.g. I've been writing for 2 years and would like to discuss my commission level..."
            />
            <p className="text-xs text-muted-foreground mt-1">{message.length}/500</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? "Sending..." : "Send Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Downline ----------------
function DownlineTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["contracting","downlineMatrix"],
    queryFn: () => listDownlineMatrix(),
  });
  const [cell, setCell] = useState<{ agent: any; carrier: any; existing?: any } | null>(null);

  if (isLoading) return <Skeleton className="h-64" />;

  const agents = data?.agents ?? [];
  const carriers = data?.carriers ?? [];
  const map = new Map<string, any>();
  (data?.requests ?? []).forEach((r: any) => map.set(`${r.agent_id}:${r.carrier_id}`, r));

  if (agents.length === 0) {
    return <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No downline agents yet. Invite agents from the Agent Network page.</CardContent></Card>;
  }

  return (
    <>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <th className="sticky left-0 bg-muted/40 px-3 py-2 text-left">Agent</th>
              {carriers.map((c: any) => (
                <th key={c.id} className="px-2 py-2 text-center whitespace-nowrap">{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((a: any) => (
              <tr key={a.id} className="border-t">
                <td className="sticky left-0 bg-card px-3 py-2 font-medium whitespace-nowrap">{a.first_name} {a.last_name}</td>
                {carriers.map((c: any) => {
                  const existing = map.get(`${a.id}:${c.id}`);
                  return (
                    <td key={c.id} className="px-2 py-2 text-center">
                      <button onClick={() => setCell({ agent: a, carrier: c, existing })}
                        className="h-7 w-7 rounded-full inline-flex items-center justify-center hover:ring-2 hover:ring-primary/30"
                        title={existing ? existing.status : "Not contracted"}
                      >
                        {existing ? <span className={cn("h-3 w-3 rounded-full", statusDot(existing.status))} />
                                  : <Plus className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>

      {cell && (
        <DownlineCellDialog
          cell={cell}
          onClose={() => setCell(null)}
          onUpdated={() => { qc.invalidateQueries({ queryKey: ["contracting"] }); setCell(null); }}
        />
      )}
    </>
  );
}

function DownlineCellDialog({ cell, onClose, onUpdated }:
  { cell: { agent: any; carrier: any; existing?: any }; onClose: () => void; onUpdated: () => void }) {
  const isNew = !cell.existing;
  const assignFn = useServerFn(assignDownlineContract);
  const updateFn = useServerFn(updateContractStatus);
  const [levelPct, setLevelPct] = useState<string>("80");
  const [levelName, setLevelName] = useState<string>("");
  const [status, setStatus] = useState<ContractStatus>(cell.existing?.status ?? "requested");
  const [wn, setWn] = useState<string>(cell.existing?.writing_number ?? "");
  const [issue, setIssue] = useState<string>("");

  const assign = useMutation({
    mutationFn: () => assignFn({ data: {
      agent_id: cell.agent.id, carrier_id: cell.carrier.id,
      level_pct: Number(levelPct), level_name: levelName || undefined,
    }}),
    onSuccess: () => { toast.success("Contract assigned"); onUpdated(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const update = useMutation({
    mutationFn: () => updateFn({ data: {
      id: cell.existing!.id, status,
      writing_number: wn || undefined,
      issue_description: status === "issue" ? issue : undefined,
    }}),
    onSuccess: () => { toast.success("Status updated"); onUpdated(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isNew ? "Send" : "Update"} {cell.carrier.name} contract — {cell.agent.first_name} {cell.agent.last_name}
          </DialogTitle>
        </DialogHeader>
        {isNew ? (
          <div className="space-y-3">
            <div>
              <Label>Commission level %</Label>
              <Input type="number" min={0} max={200} value={levelPct} onChange={(e) => setLevelPct(e.target.value)} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Must be at or below your assigned level for this carrier.</p>
            </div>
            <div>
              <Label>Level code (optional)</Label>
              <Input value={levelName} onChange={(e) => setLevelName(e.target.value)} className="mt-1" placeholder="L15" />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ContractStatus)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTRACT_STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Writing number</Label>
              <Input value={wn} onChange={(e) => setWn(e.target.value)} className="mt-1" />
            </div>
            {status === "issue" && (
              <div>
                <Label>Issue description</Label>
                <Textarea value={issue} onChange={(e) => setIssue(e.target.value.slice(0, 1000))} className="mt-1" rows={2} />
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {isNew ? (
            <Button disabled={assign.isPending} onClick={() => assign.mutate()}>{assign.isPending ? "Saving..." : "Assign"}</Button>
          ) : (
            <Button disabled={update.isPending} onClick={() => update.mutate()}>{update.isPending ? "Saving..." : "Update"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Inbox ----------------
function InboxTab() {
  const { data, isLoading } = useQuery({ queryKey: ["contracting","inbox"], queryFn: () => listWorkInbox() });
  if (isLoading) return <Skeleton className="h-32" />;
  const items = data?.items ?? [];
  if (items.length === 0) {
    return <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
      <Inbox className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
      Inbox zero. Nothing needs your attention.
    </CardContent></Card>;
  }
  return (
    <Card><CardContent className="p-0">
      <div className="divide-y">
        {items.map((it: any) => (
          <div key={`${it.kind}-${it.id}`} className="flex items-center gap-3 p-4">
            <div className="flex-1">
              <div className="font-medium text-sm">{it.agent}</div>
              <div className="text-xs text-muted-foreground">{it.description}</div>
            </div>
            <Badge variant={it.priority === "high" ? "destructive" : "secondary"} className="capitalize">{it.priority}</Badge>
            <Button size="sm" variant="outline">Review</Button>
          </div>
        ))}
      </div>
    </CardContent></Card>
  );
}

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
