import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTransferRequests, respondTransferRequest } from "@/lib/contracting.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contracting/transfers")({
  component: TransfersPage,
  head: () => ({ meta: [{ title: "Transfer Requests | Agent Cloud" }] }),
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  pending: "secondary", accepted: "default", declined: "destructive", complete: "default",
};

function TransfersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["contracting","transfers"], queryFn: () => listTransferRequests() });
  const respondFn = useServerFn(respondTransferRequest);
  const respond = useMutation({
    mutationFn: (v: { id: string; decision: "accepted" | "declined" }) => respondFn({ data: v }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["contracting","transfers"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transfer Requests</h1>
        <p className="text-sm text-muted-foreground">Complete external transfer requests to move your contracts</p>
      </div>

      {isLoading ? <Skeleton className="h-32" /> : (data?.rows.length ?? 0) === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <ArrowLeftRight className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <div className="font-semibold">No Transfer Requests</div>
          <p className="text-sm text-muted-foreground mt-1">When your admin initiates a carrier transfer, it will appear here.</p>
        </CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {(data?.rows ?? []).map((r: any) => (
            <Card key={r.id}><CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{r.carriers?.name ?? "Carrier"}</div>
                <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"} className="capitalize">{r.status}</Badge>
              </div>
              <div className="text-sm space-y-1">
                <div><span className="text-muted-foreground">From upline:</span> {r.from ? `${r.from.first_name ?? ""} ${r.from.last_name ?? ""}`.trim() : "—"}</div>
                <div><span className="text-muted-foreground">To upline:</span> {r.to ? `${r.to.first_name ?? ""} ${r.to.last_name ?? ""}`.trim() : "—"}</div>
              </div>
              {r.status === "pending" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => respond.mutate({ id: r.id, decision: "accepted" })}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => respond.mutate({ id: r.id, decision: "declined" })}>Decline</Button>
                </div>
              )}
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
