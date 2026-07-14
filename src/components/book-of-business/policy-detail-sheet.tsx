import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ExternalLink, Link2 } from "lucide-react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { money, phone as fmtPhone } from "@/lib/format";
import { POLICY_STATUSES, statusBadgeClass, statusLabel, type PolicyStatus } from "@/lib/policy-status";
import { updatePolicyStatus, getPolicyCommissionTotal } from "@/lib/book-of-business.functions";
import { supabase } from "@/integrations/supabase/client";
import { PolicyAiPanel } from "@/components/ai/policy-ai-panel";

export type BookRow = any;

export function PolicyDetailSheet({
  row,
  open,
  onOpenChange,
}: {
  row: BookRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const updateStatusFn = useServerFn(updatePolicyStatus);
  const commFn = useServerFn(getPolicyCommissionTotal);

  const clientQ = useQuery({
    enabled: !!row?.client_id,
    queryKey: ["bob", "client", row?.client_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, phone, email, city, state")
        .eq("id", row!.client_id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const commQ = useQuery({
    enabled: !!row?.id,
    queryKey: ["bob", "commission", row?.id],
    queryFn: () => commFn({ data: { policyId: row!.id } }),
  });

  const statusMut = useMutation({
    mutationFn: (status: PolicyStatus) => updateStatusFn({ data: { policyId: row!.id, status } }),
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: ["bob", "list"] });
      const prev = qc.getQueriesData<BookRow[]>({ queryKey: ["bob", "list"] });
      qc.setQueriesData<BookRow[]>({ queryKey: ["bob", "list"] }, (old) =>
        old?.map((r) => (r.id === row!.id ? { ...r, status } : r)) ?? [],
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([k, v]) => qc.setQueryData(k, v));
      toast.error("Failed to update status");
    },
    onSuccess: () => toast.success("Status updated"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["bob", "list"] }),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetTitle className="sr-only">Policy details</SheetTitle>
        {!row ? (
          <div className="p-6 space-y-3"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-32 w-full" /></div>
        ) : (
          <div className="flex flex-col">
            <div className="p-6 border-b">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Client</div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {row.client_last_name}, {row.client_first_name}
                  </h2>
                  {clientQ.data && (
                    <div className="mt-1 text-sm text-muted-foreground space-y-0.5">
                      {clientQ.data.phone && <div>{fmtPhone(clientQ.data.phone)}</div>}
                      {clientQ.data.email && <div>{clientQ.data.email}</div>}
                      {(clientQ.data.city || clientQ.data.state) && (
                        <div>{[clientQ.data.city, clientQ.data.state].filter(Boolean).join(", ")}</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={cn("inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium", statusBadgeClass(row.status))}>
                    {statusLabel(row.status)}
                  </span>
                  {row.carrier_integration && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Link2 className="h-3 w-3" /> From carrier
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Policy details</h3>
                  <Link
                    to="/pipeline"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    View client profile <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Row k="Carrier" v={row.carrier_name ?? "—"} />
                  <Row k="Product" v={row.product ?? "—"} />
                  <Row k="Policy #" v={row.policy_number ?? "—"} />
                  <Row k="Effective" v={row.effective_date ?? "—"} />
                  <Row k="Face amount" v={row.face_amount ? money(row.face_amount) : "—"} />
                  <Row k="Monthly premium" v={row.monthly_premium ? money(row.monthly_premium, { maximumFractionDigits: 2 }) : "—"} />
                  <Row k="Annual premium" v={<span className="font-semibold text-emerald-700 dark:text-emerald-400">{row.annual_premium ? money(row.annual_premium, { maximumFractionDigits: 2 }) : "—"}</span>} />
                  <Row k="Agent" v={`${row.agent_first_name ?? ""} ${row.agent_last_name ?? ""}`.trim() || "—"} />
                </dl>
              </div>

              <div className="rounded-lg border bg-card p-4 space-y-2">
                <h3 className="font-semibold">Update status</h3>
                <Select value={row.status} onValueChange={(v) => statusMut.mutate(v as PolicyStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POLICY_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Moving to "Lapse Pending" auto-creates a 3-day follow-up event.</p>
              </div>

              <div className="rounded-lg border bg-card p-4 space-y-2">
                <h3 className="font-semibold">Commissions</h3>
                {commQ.isLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : commQ.data ? (
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <Stat label="Total scheduled" value={money(commQ.data.total, { maximumFractionDigits: 2 })} />
                    <Stat label="Paid to date" value={money(commQ.data.paid, { maximumFractionDigits: 2 })} />
                    <Stat label="Entries" value={String(commQ.data.count)} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No commission data.</p>
                )}
              </div>

              {row?.id && <PolicyAiPanel policyId={row.id} />}

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className="mt-0.5">{v}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
