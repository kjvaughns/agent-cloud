import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { supabase } from "@/integrations/supabase/client";
import {
  listAllCaseDesignsAdmin, getCaseDesignDetail, updateCaseDesignAdmin,
} from "@/lib/back-office.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { format } from "date-fns";
import { toast } from "sonner";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/back-office/case-design/admin")({
  head: () => ({ meta: [{ title: "Case Design Admin — Agent Cloud" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    if (!roles) throw redirect({ to: "/back-office/case-design" });
  },
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllCaseDesignsAdmin);
  const detailFn = useServerFn(getCaseDesignDetail);
  const updateFn = useServerFn(updateCaseDesignAdmin);

  const list = useQuery({ queryKey: ["case-designs-admin"], queryFn: () => listFn() });
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["case-design-admin", openId],
    queryFn: () => detailFn({ data: { id: openId! } }),
    enabled: !!openId,
  });

  const [status, setStatus] = useState<"pending" | "complete" | "needs_info">("pending");
  const [responseText, setResponseText] = useState("");

  const mutation = useMutation({
    mutationFn: () => updateFn({ data: { id: openId!, status, response_html: markdownToHtml(responseText) } }),
    onSuccess: () => {
      toast.success("Case updated");
      qc.invalidateQueries({ queryKey: ["case-designs-admin"] });
      setOpenId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageShell>
      <div className="space-y-6">
        <HeroBand
          title="Case Design — Admin Review"
          subtitle="Review and respond to submitted cases."
        />

        <Panel title="All Case Submissions">
          <div className="rounded-[var(--radius)] border border-border-soft divide-y divide-border-soft overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground bg-surface-2">
              <div className="col-span-2">Submitted</div>
              <div className="col-span-3">Client</div>
              <div className="col-span-2">Coverage</div>
              <div className="col-span-2">Product</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1"></div>
            </div>
            {list.data?.map((c) => (
              <button key={c.id} onClick={() => {
                setOpenId(c.id);
                setStatus((c.status as "pending" | "complete" | "needs_info") ?? "pending");
                setResponseText("");
              }} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm w-full text-left hover:bg-surface-2 transition-colors">
                <div className="col-span-2 tnum">{format(new Date(c.created_at), "MMM d, yyyy")}</div>
                <div className="col-span-3 truncate">{c.client_name_manual ?? c.client_id?.slice(0, 8) ?? "—"}</div>
                <div className="col-span-2 tnum">${Number(c.coverage_amount ?? 0).toLocaleString()}</div>
                <div className="col-span-2">{c.product_type}</div>
                <div className="col-span-2"><Badge variant="outline">{c.status}</Badge></div>
                <div className="col-span-1"></div>
              </button>
            ))}
            {list.data?.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No cases yet.</div>}
          </div>
        </Panel>

        <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="sm:max-w-3xl overflow-y-auto">
          <SheetHeader><SheetTitle>Review Case</SheetTitle></SheetHeader>
          {detail.data && (
            <div className="space-y-4 mt-4">
              <DetailGrid d={detail.data} />

              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={status} onValueChange={(v) => setStatus(v as "pending" | "complete" | "needs_info")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="needs_info">Needs Info</SelectItem>
                    <SelectItem value="complete">Complete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Response (Markdown supported)</label>
                <Textarea rows={12} placeholder="**1st Choice — Mutual of Omaha**&#10;Standard Plus likely.&#10;..."
                  value={responseText} onChange={(e) => setResponseText(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">Existing response: {detail.data.response_html ? "stored — overwrite by typing above" : "none"}</p>
              </div>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>Save Response</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
      </div>
    </PageShell>
  );
}

function DetailGrid({ d }: { d: Record<string, unknown> }) {
  const f = (k: string) => (d[k] as string | number | boolean | null) ?? "—";
  return (
    <div className="grid grid-cols-2 gap-3 text-sm rounded-[var(--radius)] border border-border-soft p-4 bg-surface-2 tnum">
      <Row label="Coverage" v={`$${Number(f("coverage_amount")).toLocaleString()}`} />
      <Row label="Product" v={String(f("product_type"))} />
      <Row label="Height (in)" v={String(f("height_in"))} />
      <Row label="Weight" v={`${f("weight_lbs")} lbs`} />
      <Row label="Tobacco" v={String(f("tobacco_use"))} />
      <Row label="Prior decline" v={f("prior_decline") ? "Yes" : "No"} />
      <div className="col-span-2"><b>Primary condition:</b> {String(f("primary_condition"))}</div>
      <div className="col-span-2"><b>Medications:</b> {String(f("medications"))}</div>
      <div className="col-span-2"><b>Notes:</b> {String(f("additional_notes"))}</div>
    </div>
  );
}
function Row({ label, v }: { label: string; v: React.ReactNode }) {
  return <div><span className="text-muted-foreground">{label}:</span> {v}</div>;
}

function markdownToHtml(md: string): string {
  // Very small markdown → HTML (bold, italic, line breaks, headings, lists)
  let h = md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/^- (.*)$/gm, "<li>$1</li>");
  h = h.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  h = h.split(/\n{2,}/).map((p) => /^<(h\d|ul|ol|p)/.test(p) ? p : `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("");
  return h;
}
