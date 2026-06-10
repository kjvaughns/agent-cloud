import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listTransferRequests, respondTransferRequest,
  submitTransferSheet, getTransferWorkflowStatus,
} from "@/lib/contracting.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeftRight, AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/contracting/transfers")({
  component: TransfersPage,
  head: () => ({ meta: [{ title: "Transfer Requests | Agent Cloud" }] }),
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  pending: "secondary", accepted: "default", declined: "destructive", complete: "default",
};

function TransfersPage() {
  const qc = useQueryClient();

  const getWorkflowFn = useServerFn(getTransferWorkflowStatus);
  const respondFn = useServerFn(respondTransferRequest);

  const { data: workflowData, isLoading: wLoading } = useQuery({
    queryKey: ["transfer-workflow"],
    queryFn: () => getWorkflowFn({}),
  });
  const { data: incomingData, isLoading: iLoading } = useQuery({
    queryKey: ["contracting", "transfers"],
    queryFn: () => listTransferRequests(),
  });

  const needsTransfer   = workflowData?.needs_transfer_request ?? false;
  const workflowComplete = workflowData?.transfer_complete ?? false;
  const workflowCarriers = (workflowData?.workflow_carriers ?? []) as Array<{ carrier_id: string; carrier_name: string }>;

  const respond = async (id: string, decision: "accepted" | "declined") => {
    try {
      await respondFn({ data: { id, decision } });
      toast.success(decision === "accepted" ? "Accepted" : "Declined");
      qc.invalidateQueries({ queryKey: ["contracting", "transfers"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6" /> Transfer Requests
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage carrier release requests and transfer your existing contracts.
        </p>
      </div>

      {/* ── Pending Transfer Workflow Banner ── */}
      {wLoading ? <Skeleton className="h-32" /> : needsTransfer && !workflowComplete && (
        <div className="rounded-xl border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-red-700 dark:text-red-400 text-base">
                Action Required — Complete Your Transfer Request
              </div>
              <p className="text-sm text-red-600 dark:text-red-300 mt-1">
                You indicated you need a release from a previous upline for{" "}
                {workflowCarriers.length} carrier{workflowCarriers.length !== 1 ? "s" : ""}.
                Complete the form below to submit your transfer request. Your profile completion
                is blocked until this is done.
              </p>
            </div>
          </div>
          <TransferRequestForm
            workflowCarriers={workflowCarriers}
            onSubmitted={() => {
              qc.invalidateQueries({ queryKey: ["transfer-workflow"] });
              qc.invalidateQueries({ queryKey: ["producer-profile-completion"] });
              qc.invalidateQueries({ queryKey: ["account", "producerProfile"] });
            }}
          />
        </div>
      )}

      {/* ── Transfer Complete ── */}
      {!wLoading && needsTransfer && workflowComplete && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <div className="font-semibold text-emerald-700">Transfer Request Submitted</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your carrier release request has been submitted. Your upline will process it shortly.
            </p>
          </div>
        </div>
      )}

      {/* ── Incoming Transfer Requests ── */}
      <div>
        <h2 className="font-semibold text-base mb-3">Incoming Transfer Requests</h2>
        {iLoading ? (
          <Skeleton className="h-24" />
        ) : (incomingData?.rows.length ?? 0) === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No incoming transfer requests from your admin.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {(incomingData?.rows ?? []).map((r: any) => (
              <Card key={r.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{r.carriers?.name ?? "Carrier"}</div>
                    <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"} className="capitalize">
                      {r.status}
                    </Badge>
                  </div>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    <div>From: {r.from ? `${r.from.first_name ?? ""} ${r.from.last_name ?? ""}`.trim() : "—"}</div>
                    <div>To: {r.to ? `${r.to.first_name ?? ""} ${r.to.last_name ?? ""}`.trim() : "—"}</div>
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => respond(r.id, "accepted")}>Accept</Button>
                      <Button size="sm" variant="outline" onClick={() => respond(r.id, "declined")}>Decline</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Transfer Request Form ──────────────────────────────────────────────────
function TransferRequestForm({
  workflowCarriers,
  onSubmitted,
}: {
  workflowCarriers: Array<{ carrier_id: string; carrier_name: string }>;
  onSubmitted: () => void;
}) {
  const submitFn = useServerFn(submitTransferSheet);

  const [rows, setRows] = useState<Array<{
    carrier_id:           string;
    carrier_name:         string;
    writing_number:       string;
    current_upline_name:  string;
    current_upline_email: string;
  }>>(
    workflowCarriers.length > 0
      ? workflowCarriers.map((c) => ({
          carrier_id:           c.carrier_id,
          carrier_name:         c.carrier_name,
          writing_number:       "",
          current_upline_name:  "",
          current_upline_email: "",
        }))
      : [{
          carrier_id: "", carrier_name: "", writing_number: "",
          current_upline_name: "", current_upline_email: "",
        }]
  );

  const [reason, setReason] = useState("joining_new_upline");
  const [notes, setNotes]   = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = rows.length > 0 && rows.every((r) => r.carrier_name.trim() && r.current_upline_name.trim());

  const updateRow = (i: number, patch: Partial<typeof rows[0]>) =>
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await submitFn({ data: { rows, reason, notes: notes || undefined } });
      toast.success("Transfer request submitted! Your upline has been notified.");
      onSubmitted();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to submit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 mt-2">
      <div className="rounded-lg bg-white/70 dark:bg-black/20 border p-4 text-sm space-y-1">
        <p className="font-medium">Fill out the details for each carrier you need a release from:</p>
        <ul className="list-disc pl-4 text-muted-foreground space-y-0.5 text-xs">
          <li>Enter your <strong>current writing number</strong> with each carrier</li>
          <li>Enter your <strong>current upline's name and email</strong> so we can contact them for the release</li>
          <li>You can add additional carriers not listed if needed</li>
        </ul>
      </div>

      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="rounded-lg border bg-white dark:bg-black/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">
                {row.carrier_name || <span className="text-muted-foreground italic">Carrier {i + 1}</span>}
              </div>
              {rows.length > 1 && (
                <Button
                  size="sm" variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {!row.carrier_id && (
              <div className="space-y-1.5">
                <Label className="text-xs">Carrier Name *</Label>
                <Input
                  value={row.carrier_name}
                  onChange={(e) => updateRow(i, { carrier_name: e.target.value })}
                  placeholder="Carrier name"
                  className="h-8 text-sm"
                />
              </div>
            )}
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Writing / Agent Number</Label>
                <Input
                  value={row.writing_number}
                  onChange={(e) => updateRow(i, { writing_number: e.target.value })}
                  placeholder="Your current agent #"
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Current Upline Name *</Label>
                <Input
                  value={row.current_upline_name}
                  onChange={(e) => updateRow(i, { current_upline_name: e.target.value })}
                  placeholder="Full name"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Current Upline Email</Label>
                <Input
                  type="email"
                  value={row.current_upline_email}
                  onChange={(e) => updateRow(i, { current_upline_email: e.target.value })}
                  placeholder="email@example.com"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>
        ))}

        <Button
          variant="outline" size="sm" className="gap-1.5 text-muted-foreground"
          onClick={() => setRows((prev) => [...prev, {
            carrier_id: "", carrier_name: "", writing_number: "",
            current_upline_name: "", current_upline_email: "",
          }])}
        >
          <Plus className="h-3.5 w-3.5" /> Add another carrier
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Reason for Transfer</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="joining_new_upline">Joining a new upline / FMO</SelectItem>
              <SelectItem value="agency_owner_leaving">Starting my own agency</SelectItem>
              <SelectItem value="inactive_upline">Previous upline is inactive</SelectItem>
              <SelectItem value="better_compensation">Better compensation structure</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Additional Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any context for your upline..."
            className="min-h-[60px] text-sm resize-none"
          />
        </div>
      </div>

      <Button className="w-full" disabled={!canSubmit || saving} onClick={submit}>
        {saving ? "Submitting..." : "Submit Transfer Request"}
      </Button>
    </div>
  );
}
