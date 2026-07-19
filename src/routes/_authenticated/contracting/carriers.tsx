import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCarriers } from "@/lib/contracting.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Globe, Phone, Clock, Zap, DollarSign, Lock, User, ExternalLink, GraduationCap, Info, Search } from "lucide-react";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { useRole } from "@/hooks/use-role";
import { useServerFn } from "@/hooks/use-server-fn";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addCarrier } from "@/lib/contracting.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contracting/carriers")({
  component: CarriersPage,
  head: () => ({ meta: [{ title: "Carriers | Agent Cloud" }] }),
});

type Filter = "all" | "weekly" | "monthly" | "fast";

function CarriersPage() {
  const { data, isLoading } = useQuery({ queryKey: ["contracting","carriers"], queryFn: () => listCarriers() });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [aboutFor, setAboutFor] = useState<any | null>(null);

  const filtered = useMemo(() => {
    let rows = (data?.carriers ?? []) as any[];
    if (search) rows = rows.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    if (filter === "weekly") rows = rows.filter(c => c.pay_frequency === "weekly");
    if (filter === "monthly") rows = rows.filter(c => c.pay_frequency === "monthly");
    if (filter === "fast") rows = rows.filter(c => (c.contracting_speed_days ?? 999) < 5);
    return rows;
  }, [data, search, filter]);

  return (
    <PageShell>
      <HeroBand title="Carriers" subtitle="Reference directory — contacts, pay schedules, and portals. Contracts and comp live in the Contracts hub." actions={<AddCarrierButton />} />

      <div className="flex flex-col md:flex-row gap-3 mt-[var(--gap)]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search carriers..." className="pl-9" />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="bg-surface-2 border border-border">
            {(["all","weekly","monthly","fast"] as const).map((v) => (
              <TabsTrigger key={v} value={v}
                className="data-[state=active]:bg-gold-glow data-[state=active]:text-gold-bright data-[state=active]:shadow-none text-muted-foreground">
                {v === "all" ? "All" : v === "weekly" ? "Weekly Pay" : v === "monthly" ? "Monthly Pay" : "Fast (<5 days)"}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-[var(--gap)]">
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-56" />)}</div>
        ) : filtered.length === 0 ? (
          <Panel><div className="py-10 text-center text-sm text-muted-foreground">No carriers match.</div></Panel>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {filtered.map((c: any) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setAboutFor(c)}
                onKeyDown={(e) => { if (e.key === "Enter") setAboutFor(c); }}
                className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-surface-2 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display text-lg font-bold text-gold-bright" style={{ fontFamily: "var(--font-display)" }}>{c.name}</div>
                    {c.is_annuity_carrier && <Badge variant="secondary" className="mt-1">Annuity</Badge>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {c.website && <Row Icon={Globe} label={<a href={c.website} target="_blank" rel="noreferrer" className="hover:underline">Website</a>} />}
                  {c.phone && <Row Icon={Phone} label={<span className="tnum">{c.phone}</span>} />}
                  {c.hours && <Row Icon={Clock} label={c.hours} />}
                  {c.contracting_speed_days != null && <Row Icon={Zap} label={<span className="tnum">{`${c.contracting_speed_days} days avg`}</span>} />}
                  {c.pay_frequency && <Row Icon={DollarSign} label={`Pay: ${cap(c.pay_frequency)}`} />}
                  {(c.advance_cap || c.advance_cap_amount) && <Row Icon={Lock} label={<span>Advance Cap: <span className="tnum">{c.advance_cap ?? `$${Number(c.advance_cap_amount).toLocaleString()}`}</span></span>} />}
                  {c.ideal_client && <Row Icon={User} label={<span><span className="text-muted-foreground">Ideal:</span> {c.ideal_client}</span>} full />}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                  {c.agent_portal_url && (
                    <a href={c.agent_portal_url} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm" className="w-full"><ExternalLink className="h-3.5 w-3.5" /> Agent Portal</Button>
                    </a>
                  )}
                  {c.training_url && (
                    <a href={c.training_url} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm" className="w-full"><GraduationCap className="h-3.5 w-3.5" /> Carrier Training</Button>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!aboutFor} onOpenChange={(o) => !o && setAboutFor(null)}>
        <SheetContent className="bg-card border-border">
          <SheetHeader>
            <SheetTitle className="font-display text-gold-bright" style={{ fontFamily: "var(--font-display)" }}>{aboutFor?.name}</SheetTitle>
            <SheetDescription className="text-muted-foreground">{aboutFor?.ideal_client}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
            {aboutFor?.about_text ?? "No additional information available."}
          </div>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function Row({ Icon, label, full }: { Icon: any; label: React.ReactNode; full?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${full ? "col-span-2" : ""}`}>
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }


function AddCarrierButton() {
  const { isAdmin, isAgencyOwner } = useRole();
  const qc = useQueryClient();
  const addFn = useServerFn(addCarrier);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ name: "", phone: "", hours: "", pay_frequency: "", advance_cap: "", ideal_client: "", website: "", agent_portal_url: "", training_url: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const mut = useMutation({
    mutationFn: () => addFn({ data: {
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      hours: form.hours.trim() || undefined,
      pay_frequency: (form.pay_frequency === "weekly" || form.pay_frequency === "monthly") ? form.pay_frequency : undefined,
      advance_cap: form.advance_cap.trim() || undefined,
      ideal_client: form.ideal_client.trim() || undefined,
      website: form.website.trim() || undefined,
      agent_portal_url: form.agent_portal_url.trim() || undefined,
      training_url: form.training_url.trim() || undefined,
    } as any }),
    onSuccess: () => {
      toast.success("Carrier added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["contracting"] });
      qc.invalidateQueries({ queryKey: ["carriers-filter"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't add carrier"),
  });

  if (!(isAdmin || isAgencyOwner)) return null;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ Add Carrier</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Carrier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {([["name","Carrier name *"],["phone","Phone"],["hours","Hours"],["advance_cap","Advance cap"],["ideal_client","Ideal client"],["website","Website URL"],["agent_portal_url","Agent portal URL"],["training_url","Training URL"]] as const).map(([k, label]) => (
              <div key={k}>
                <Label className="text-xs">{label}</Label>
                <Input className="mt-1" value={form[k]} onChange={set(k)} />
              </div>
            ))}
            <div>
              <Label className="text-xs">Pay schedule</Label>
              <div className="flex gap-2 mt-1">
                {(["weekly","monthly"] as const).map((p) => (
                  <Button key={p} type="button" size="sm" variant={form.pay_frequency === p ? "default" : "outline"} onClick={() => setForm((f) => ({ ...f, pay_frequency: f.pay_frequency === p ? "" : p }))}>
                    {p === "weekly" ? "Weekly" : "Monthly"}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => mut.mutate()} disabled={!form.name.trim() || mut.isPending}>{mut.isPending ? "Saving…" : "Save Carrier"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
