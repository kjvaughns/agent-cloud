import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCarriers } from "@/lib/contracting.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Globe, Phone, Clock, Zap, DollarSign, Lock, User, ExternalLink, GraduationCap, Info, Search } from "lucide-react";

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
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Carriers</h1>
        <p className="text-sm text-muted-foreground">Partner with leading insurance carriers</p>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search carriers..." className="pl-9" />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="weekly">Weekly Pay</TabsTrigger>
            <TabsTrigger value="monthly">Monthly Pay</TabsTrigger>
            <TabsTrigger value="fast">Fast (&lt;5 days)</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-56" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No carriers match.</CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((c: any) => (
            <Card key={c.id}><CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-bold">{c.name}</div>
                  {c.is_annuity_carrier && <Badge variant="secondary" className="mt-1">Annuity</Badge>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {c.website && <Row Icon={Globe} label={<a href={c.website} target="_blank" rel="noreferrer" className="hover:underline">Website</a>} />}
                {c.phone && <Row Icon={Phone} label={c.phone} />}
                {c.hours && <Row Icon={Clock} label={c.hours} />}
                {c.contracting_speed_days != null && <Row Icon={Zap} label={`${c.contracting_speed_days} days avg`} />}
                {c.pay_frequency && <Row Icon={DollarSign} label={`Pay: ${cap(c.pay_frequency)}`} />}
                {(c.advance_cap || c.advance_cap_amount) && <Row Icon={Lock} label={`Advance Cap: ${c.advance_cap ?? `$${Number(c.advance_cap_amount).toLocaleString()}`}`} />}
                {c.ideal_client && <Row Icon={User} label={<span><span className="text-muted-foreground">Ideal:</span> {c.ideal_client}</span>} full />}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
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
              <Button onClick={() => setAboutFor(c)} className="w-full" size="sm">
                <Info className="h-4 w-4" /> About
              </Button>
            </CardContent></Card>
          ))}
        </div>
      )}

      <Sheet open={!!aboutFor} onOpenChange={(o) => !o && setAboutFor(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{aboutFor?.name}</SheetTitle>
            <SheetDescription>{aboutFor?.ideal_client}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 text-sm leading-relaxed whitespace-pre-wrap">
            {aboutFor?.about_text ?? "No additional information available."}
          </div>
        </SheetContent>
      </Sheet>
    </div>
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
