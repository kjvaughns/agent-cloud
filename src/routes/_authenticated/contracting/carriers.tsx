import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Settings2, Building2 } from "lucide-react";
import { listCarriers } from "@/lib/contracting.functions";
import { listOrgCarriers } from "@/lib/contracting-ops.functions";
import { useServerFn } from "@/hooks/use-server-fn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { PageShell, HeroBand } from "@/components/page-shell";
import { HubLayout, SummaryCard } from "@/components/ui-kit/hub";
import { EmptyCard, CardSkeleton, FilterChips } from "@/components/ui-kit/states";
import { CarrierCard, CarrierDetailsDialog, CarrierFactsRow, hasDetails } from "@/components/carriers/carrier-card";

export const Route = createFileRoute("/_authenticated/contracting/carriers")({
  component: CarriersPage,
  head: () => ({
    meta: [
      { title: "Carrier directory | Agent Cloud" },
      { name: "description", content: "Portals, phone numbers, pay schedules and training for your agency's carriers." },
    ],
  }),
});

type Filter = "all" | "weekly" | "monthly" | "fast" | "annuity";

const match = (c: any, f: Filter) => {
  const pay = String(c.pay_frequency ?? "").toLowerCase();
  if (f === "weekly") return pay.includes("week");
  if (f === "monthly") return pay.includes("month");
  if (f === "fast") return (c.contracting_speed_days ?? 999) < 5;
  if (f === "annuity") return Boolean(c.is_annuity_carrier);
  return true;
};

function CarriersPage() {
  const { data, isLoading } = useQuery({ queryKey: ["contracting", "carriers"], queryFn: () => listCarriers() });
  const orgFn = useServerFn(listOrgCarriers);
  // Only used to learn whether this person may edit carrier details.
  const { data: org } = useQuery({ queryKey: ["contracting-ops", "carriers"], queryFn: () => orgFn(), retry: false });
  const canEdit = Boolean((org as any)?.access?.canManageCarriers);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [aboutFor, setAboutFor] = useState<any | null>(null);
  const [editFor, setEditFor] = useState<any | null>(null);

  const all = (data?.carriers ?? []) as any[];
  const filtered = useMemo(() => all.filter((c) =>
    match(c, filter) && (!search || c.name.toLowerCase().includes(search.toLowerCase()))), [all, search, filter]);

  const count = (f: Filter) => all.filter((c) => match(c, f)).length;
  const fastest = all.filter((c) => c.contracting_speed_days != null)
    .sort((a, b) => a.contracting_speed_days - b.contracting_speed_days)[0];
  const missing = all.filter((c) => !hasDetails(c)).length;

  const summary = (
    <SummaryCard
      title="At a glance"
      rows={[
        { label: "Active carriers", value: all.length, tone: "gold" },
        { label: "Fastest contracting", value: fastest ? `${fastest.name} · ${fastest.contracting_speed_days}d` : "—" },
        { label: "Weekly pay", value: count("weekly") },
        ...(canEdit ? [{ label: "Missing details", value: missing, tone: missing ? ("red" as const) : ("green" as const) }] : []),
      ]}
      footer={canEdit ? (
        <Button asChild variant="outline" size="sm" className="w-full rounded-full">
          <Link to="/settings/agency" search={{ tab: "carriers" } as any}><Settings2 className="mr-1.5 h-4 w-4" />Manage carriers</Link>
        </Button>
      ) : undefined}
    />
  );

  return (
    <PageShell>
      <HeroBand
        title="Carrier directory"
        subtitle="Portals, phone numbers and pay schedules for every carrier your agency writes."
        actions={canEdit ? (
          <Button asChild variant="ink" className="rounded-full">
            <Link to="/settings/agency" search={{ tab: "carriers" } as any}>Manage carriers</Link>
          </Button>
        ) : undefined}
      />

      <div className="mt-[var(--gap)]">
        <HubLayout preview={summary} label="Summary">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search carriers…" className="rounded-full pl-9" />
            </div>
            <FilterChips value={filter} onChange={setFilter} options={[
              { value: "all", label: "All", count: all.length },
              { value: "weekly", label: "Weekly pay", count: count("weekly") },
              { value: "monthly", label: "Monthly pay", count: count("monthly") },
              { value: "fast", label: "Fast (under 5 days)", count: count("fast") },
              { value: "annuity", label: "Annuity", count: count("annuity") },
            ]} />
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map((i) => <CardSkeleton key={i} />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyCard
              icon={<Building2 className="h-5 w-5" />}
              title={all.length === 0 ? "No carriers switched on yet" : "No carriers match"}
              body={all.length === 0 ? "Switch carriers on in Agency settings and they'll show up here for your agents." : "Try a different search or filter."}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filtered.map((c) => (
                <CarrierCard key={c.id} c={c} onOpen={() => setAboutFor(c)}
                  onEdit={canEdit && c.org_carrier_id ? () => setEditFor(c) : undefined} />
              ))}
            </div>
          )}
        </HubLayout>
      </div>

      <Sheet open={!!aboutFor} onOpenChange={(o) => !o && setAboutFor(null)}>
        <SheetContent className="border-border bg-card">
          <SheetHeader>
            <SheetTitle>{aboutFor?.name}</SheetTitle>
            {aboutFor?.ideal_client && <SheetDescription>Ideal client: {aboutFor.ideal_client}</SheetDescription>}
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {aboutFor && <CarrierFactsRow c={aboutFor} />}
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{aboutFor?.about_text ?? "No additional information yet."}</p>
          </div>
        </SheetContent>
      </Sheet>

      <CarrierDetailsDialog open={!!editFor} onOpenChange={(o) => !o && setEditFor(null)}
        orgCarrierId={editFor?.org_carrier_id ?? null} carrier={editFor} />
    </PageShell>
  );
}
