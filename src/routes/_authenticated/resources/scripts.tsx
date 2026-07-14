import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@/hooks/use-server-fn";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { getScripts } from "@/lib/resources.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Printer, Copy, ScrollText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/resources/scripts")({
  head: () => ({ meta: [{ title: "Scripts — Agent Cloud" }] }),
  component: Page,
});

const CATS = [
  { key: "all", label: "All" },
  { key: "basic", label: "Opening" },
  { key: "needs_analysis", label: "Needs Analysis" },
  { key: "objection_handling", label: "Objection Handling" },
  { key: "mortgage_protection", label: "Mortgage" },
  { key: "beneficiary", label: "Beneficiary" },
  { key: "check_in", label: "Follow-Up" },
];

function Page() {
  const fn = useServerFn(getScripts);
  const { data: scripts = [] } = useQuery({ queryKey: ["scripts"], queryFn: () => fn() });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<any>(null);

  const filtered = useMemo(() => scripts.filter((s: any) =>
    (cat === "all" || s.category === cat) &&
    (q === "" || s.title.toLowerCase().includes(q.toLowerCase()))
  ), [scripts, q, cat]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><ScrollText className="h-7 w-7" /> Scripts</h1>
        <p className="text-muted-foreground">Access proven sales scripts, objection handling guides, and conversation templates to close more deals.</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search scripts..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {CATS.map((c) => (
          <Badge
            key={c.key}
            variant={cat === c.key ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setCat(c.key)}
          >{c.label}</Badge>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((s: any) => (
          <Card key={s.id} className="overflow-hidden flex flex-col">
            <div className="h-1.5" style={{ background: s.accent_color || "hsl(var(--primary))" }} />
            <CardContent className="pt-5 flex-1 flex flex-col">
              <Badge variant="outline" className="self-start mb-2 capitalize">{String(s.category).replace(/_/g, " ")}</Badge>
              <div className="font-semibold">{s.title}</div>
              <div className="text-sm mt-1">{s.short_description}</div>
              <div className="text-xs text-muted-foreground mt-2 flex-1">{s.long_description}</div>
              <Button
                className="mt-4 self-start"
                style={{ background: s.accent_color, borderColor: s.accent_color }}
                onClick={() => setOpen(s)}
              >View Script</Button>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <div className="text-sm text-muted-foreground">No scripts match.</div>}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {open?.title}
              {open && <Badge variant="outline" className="capitalize">{String(open.category).replace(/_/g, " ")}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {open && (
            <>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const tmp = document.createElement("div"); tmp.innerHTML = open.content_html || "";
                  navigator.clipboard.writeText(tmp.innerText); toast.success("Script copied");
                }}><Copy className="h-4 w-4 mr-1" /> Copy</Button>
              </div>
              <article className="prose prose-sm dark:prose-invert max-w-none mt-3" dangerouslySetInnerHTML={{ __html: open.content_html || "" }} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
