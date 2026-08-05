import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Search } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@/hooks/use-server-fn";
import { listProducerDocuments, reviewDocument } from "@/lib/contracting-records.functions";
import { DOCUMENT_REQUIREMENTS } from "@/lib/contracting-ops/types";
import { Column, FilterChips, Pill, RecordTable, Stacked } from "@/components/contracting/table";
import { ghostFor } from "@/lib/empty-states";

export const Route = createFileRoute("/_authenticated/contracting-ops/documents")({
  component: DocumentsPage,
  head: () => ({ meta: [{ title: "Documents | Agent Cloud" }] }),
});

const TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  approved: "success", uploaded: "warning", rejected: "danger",
  expired: "danger", superseded: "neutral",
};

function DocumentsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listProducerDocuments);
  const reviewFn = useServerFn(reviewDocument);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | "">("");

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "documents"], queryFn: () => listFn(),
  });

  const review = useMutation({
    mutationFn: (v: any) => reviewFn({ data: v }),
    onSuccess: () => {
      toast.success("Document reviewed");
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not review the document"),
  });

  const all = (data?.rows ?? []) as any[];
  const rows = useMemo(() => {
    let out = all;
    if (status) out = out.filter((r) => r.review_status === status);
    if (search.trim()) {
      const s = search.toLowerCase();
      out = out.filter((r) =>
        r.agent_name.toLowerCase().includes(s) ||
        String(r.doc_type).toLowerCase().includes(s));
    }
    return out;
  }, [all, status, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of all) c[r.review_status] = (c[r.review_status] ?? 0) + 1;
    return c;
  }, [all]);

  const label = (t: string) =>
    (DOCUMENT_REQUIREMENTS as Record<string, string>)[t] ?? t.replace(/_/g, " ");

  const columns: Column<any>[] = [
    { key: "agent", header: "Agent", className: "flex-[2]",
      render: (r) => <Stacked top={r.agent_name} bottom={label(r.doc_type)} /> },
    { key: "file", header: "File", className: "flex-1",
      render: (r) => r.is_sensitive && !r.file_name
        ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Restricted
          </span>
        : <span className="truncate text-xs text-muted-foreground">{r.file_name ?? "—"}</span> },
    { key: "expires", header: "Expires", className: "w-28", secondary: true,
      render: (r) => <span className="tnum text-xs text-muted-foreground">{r.expiration_date ?? "—"}</span> },
    { key: "status", header: "Status", className: "w-28",
      render: (r) => <Pill tone={TONE[r.review_status] ?? "neutral"}>{r.review_status}</Pill> },
    { key: "actions", header: "", className: "w-36",
      render: (r) => r.review_status === "uploaded" ? (
        <span className="flex gap-1.5">
          <Button size="sm" variant="outline" disabled={review.isPending}
                  onClick={(e) => { e.stopPropagation(); review.mutate({ id: r.id, review_status: "approved" }); }}>
            Approve
          </Button>
          <Button size="sm" variant="outline" disabled={review.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    const reason = prompt("What needs fixing? The agent sees this.");
                    if (reason !== null) review.mutate({ id: r.id, review_status: "rejected", rejection_reason: reason });
                  }}>
            Reject
          </Button>
        </span>
      ) : <span className="text-[11px] text-text-dim">
            {r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString() : "—"}
          </span> },
  ];

  return (
    <div className="space-y-4">
      {!data?.canViewSensitive && (
        <p className="flex items-start gap-1.5 rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-[11px] text-muted-foreground">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" />
          Tax, banking and identity documents are restricted. Their filenames are withheld here
          because a filename can itself be disclosive.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
                 placeholder="Agent or document type" className="pl-8" />
        </div>
      </div>

      <FilterChips
        value={status}
        onChange={setStatus}
        allLabel="Any status"
        options={Object.entries(counts).map(([v, count]) => ({ value: v, label: v, count }))}
      />

      <Panel pad={false}>
        <RecordTable
          rows={rows}
          columns={columns}
          loading={isLoading}
          empty={{
            ghost: ghostFor("documents"),
            title: "Documents waiting on review",
            body: "Documents appear here as agents upload them against carrier requirements. A document waiting on review does not satisfy a requirement — approve it first.",
          }}
        />
      </Panel>
    </div>
  );
}
