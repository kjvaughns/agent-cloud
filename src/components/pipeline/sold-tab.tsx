import { useMemo, useState } from "react";
import { CheckCircle2, Phone, Mail, MessageSquare, Search, Cake, Heart, AlertCircle, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { phone as fmtPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "all" | "needs_review" | "needs_contact" | "birthdays" | "anniversaries";

const fmtMoney = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  const next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.floor((next.getTime() - today.getTime()) / 86_400_000);
}

export function SoldTab({ clients, onOpen }: { clients: any[]; onOpen: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [carrier, setCarrier] = useState<string>("all");
  const [sort, setSort] = useState<string>("recent");
  const [filter, setFilter] = useState<Filter>("all");

  const carriers = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => c.latest_policy?.carriers?.name && set.add(c.latest_policy.carriers.name));
    return Array.from(set).sort();
  }, [clients]);

  const stats = useMemo(() => {
    const policies = clients.filter((c) => c.latest_policy).length;
    const face = clients.reduce((s, c) => s + Number(c.latest_policy?.face_amount ?? 0), 0);
    const annual = clients.reduce(
      (s, c) => s + Number(c.latest_policy?.annual_premium ?? (c.latest_policy?.monthly_premium ?? 0) * 12),
      0,
    );
    const avg = policies > 0 ? annual / policies : 0;
    const thisMonth = clients.filter((c) => {
      const d = c.latest_policy?.effective_date;
      if (!d) return false;
      const dt = new Date(d);
      const now = new Date();
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    }).length;
    return { clients: clients.length, policies, face, annual, avg, thisMonth };
  }, [clients]);

  const needsReview = clients.filter((c) => c.latest_policy?.status === "in_review").length;
  const needsContact = clients.filter((c) => {
    if (!c.last_opened_at) return true;
    return (Date.now() - new Date(c.last_opened_at).getTime()) / 86_400_000 > 60;
  }).length;
  const birthdays = clients.filter((c) => {
    const d = daysUntil(c.date_of_birth);
    return d != null && d <= 30;
  }).length;
  const anniversaries = clients.filter((c) => {
    const d = daysUntil(c.latest_policy?.effective_date);
    return d != null && d <= 30;
  }).length;

  const filtered = useMemo(() => {
    let list = [...clients];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
          (c.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "")),
      );
    }
    if (carrier !== "all") list = list.filter((c) => c.latest_policy?.carriers?.name === carrier);
    if (filter === "needs_review") list = list.filter((c) => c.latest_policy?.status === "in_review");
    if (filter === "needs_contact")
      list = list.filter(
        (c) => !c.last_opened_at || (Date.now() - new Date(c.last_opened_at).getTime()) / 86_400_000 > 60,
      );
    if (filter === "birthdays") list = list.filter((c) => { const d = daysUntil(c.date_of_birth); return d != null && d <= 30; });
    if (filter === "anniversaries") list = list.filter((c) => { const d = daysUntil(c.latest_policy?.effective_date); return d != null && d <= 30; });

    if (sort === "recent")
      list.sort((a, b) => new Date(b.latest_policy?.effective_date ?? 0).getTime() - new Date(a.latest_policy?.effective_date ?? 0).getTime());
    else if (sort === "name") list.sort((a, b) => `${a.last_name}`.localeCompare(`${b.last_name}`));
    else if (sort === "premium")
      list.sort(
        (a, b) =>
          Number(b.latest_policy?.monthly_premium ?? 0) - Number(a.latest_policy?.monthly_premium ?? 0),
      );
    return list;
  }, [clients, search, carrier, sort, filter]);

  return (
    <div className="space-y-4">
      {/* KPI strip — 6 tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Clients" value={String(stats.clients)} tone="text-foreground" />
        <Kpi label="Policies" value={String(stats.policies)} tone="text-primary" />
        <Kpi label="Total Face" value={fmtMoney(stats.face)} tone="text-primary" />
        <Kpi label="Annual Premium" value={fmtMoney(stats.annual)} tone="text-emerald-600" />
        <Kpi label="Avg Policy" value={fmtMoney(stats.avg)} tone="text-violet-600" />
        <Kpi label="This Month" value={String(stats.thisMonth)} tone="text-amber-600" />
      </div>

      {/* Alerts banner */}
      {(needsReview + needsContact + birthdays + anniversaries) > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-4 py-3">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
          <div className="text-xs text-amber-900 dark:text-amber-200">
            <span className="font-semibold">Client Alerts: </span>
            {needsReview > 0 && <span>{needsReview} in review · </span>}
            {needsContact > 0 && <span>{needsContact} need contact · </span>}
            {birthdays > 0 && <span>{birthdays} birthdays · </span>}
            {anniversaries > 0 && <span>{anniversaries} anniversaries</span>}
          </div>
        </div>
      )}

      {/* Search + Carrier + Sort */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sold clients..." className="pl-9 h-9" />
        </div>
        <Select value={carrier} onValueChange={setCarrier}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Carrier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All carriers</SelectItem>
            {carriers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="name">Name (A–Z)</SelectItem>
            <SelectItem value="premium">Premium (High)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        <Chip label="All Clients" active={filter === "all"} onClick={() => setFilter("all")} count={clients.length} />
        <Chip label="Needs Review" active={filter === "needs_review"} onClick={() => setFilter("needs_review")} count={needsReview} icon={<Filter className="h-3 w-3" />} />
        <Chip label="Needs Contact" active={filter === "needs_contact"} onClick={() => setFilter("needs_contact")} count={needsContact} />
        <Chip label="Upcoming Birthdays" active={filter === "birthdays"} onClick={() => setFilter("birthdays")} count={birthdays} icon={<Cake className="h-3 w-3" />} />
        <Chip label="Anniversaries" active={filter === "anniversaries"} onClick={() => setFilter("anniversaries")} count={anniversaries} icon={<Heart className="h-3 w-3" />} />
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-16 border rounded-lg">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No sold clients match this filter</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => <SoldClientCard key={c.id} client={c} onClick={() => onOpen(c.id)} />)}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-bold mt-0.5", tone)}>{value}</div>
    </div>
  );
}

function Chip({ label, active, onClick, count, icon }: { label: string; active: boolean; onClick: () => void; count: number; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted/50 border-border",
      )}
    >
      {icon}
      {label}
      {count > 0 && (
        <span className={cn("inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full text-[10px] font-bold",
          active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>{count}</span>
      )}
    </button>
  );
}

function SoldClientCard({ client, onClick }: { client: any; onClick: () => void }) {
  const policies: any[] = client.policies ?? (client.latest_policy ? [client.latest_policy] : []);
  const initials = `${client.first_name?.[0] ?? ""}${client.last_name?.[0] ?? ""}`.toUpperCase();
  const totalFace = policies.reduce((s, p) => s + Number(p.face_amount ?? 0), 0);
  const totalMonthly = policies.reduce((s, p) => s + Number(p.monthly_premium ?? 0), 0);

  return (
    <div className="bg-card border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-md transition-all">
      <button onClick={onClick} className="w-full text-left p-4 pb-3 border-b">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <div className="h-10 w-10 rounded-full bg-emerald-500/15 grid place-items-center text-sm font-bold text-emerald-700 dark:text-emerald-400">{initials}</div>
            <CheckCircle2 className="h-4 w-4 absolute -bottom-1 -right-1 text-emerald-600 bg-card rounded-full" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">{client.first_name} {client.last_name}</div>
            <div className="text-[11px] text-muted-foreground">{policies.length} {policies.length === 1 ? "policy" : "policies"}</div>
          </div>
        </div>
      </button>

      {/* Action chips */}
      <div className="flex border-b">
        <ActionChip icon={Phone} label="Call" href={client.phone ? `tel:${client.phone}` : undefined} />
        <ActionChip icon={MessageSquare} label="Text" href={client.phone ? `sms:${client.phone}` : undefined} />
        <ActionChip icon={Mail} label="Email" href={client.email ? `mailto:${client.email}` : undefined} />
      </div>

      {/* Policies list */}
      <button onClick={onClick} className="w-full text-left p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Policies ({policies.length})
        </div>
        {policies.slice(0, 3).map((p, i) => (
          <div key={p.id ?? i} className="text-xs border rounded-md p-2 space-y-0.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{p.carriers?.name ?? "—"}</div>
                <div className="text-[10px] text-muted-foreground truncate">{p.product ?? "—"}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-emerald-600">${Number(p.monthly_premium ?? 0).toFixed(0)}<span className="text-[9px] font-normal text-muted-foreground">/mo</span></div>
                {p.face_amount > 0 && <div className="text-[10px] text-muted-foreground">${Number(p.face_amount).toLocaleString()}</div>}
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              {p.policy_number && <span className="font-mono">#{p.policy_number}</span>}
              <PolicyStatusPill status={p.status} />
            </div>
          </div>
        ))}
        {policies.length > 3 && <div className="text-[10px] text-muted-foreground text-center">+ {policies.length - 3} more</div>}
      </button>

      {/* Footer */}
      <div className="border-t bg-emerald-50/50 dark:bg-emerald-950/10 px-3 py-2 flex items-center justify-between text-[11px]">
        <div>
          <span className="text-muted-foreground">Total: </span>
          <span className="font-bold">${totalFace.toLocaleString()}</span>
        </div>
        <div className="font-bold text-emerald-700 dark:text-emerald-400">${totalMonthly.toFixed(0)}/mo</div>
      </div>
    </div>
  );
}

function ActionChip({ icon: Icon, label, href }: { icon: any; label: string; href?: string }) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    href ? <a href={href} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium hover:bg-muted/50 transition-colors">{children}</a>
         : <div className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium text-muted-foreground/60">{children}</div>;
  return <Wrapper><Icon className="h-3 w-3" />{label}</Wrapper>;
}

function PolicyStatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    active:          { cls: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900", label: "Active" },
    issued_not_paid: { cls: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900", label: "Not Taken" },
    in_review:       { cls: "bg-primary/15 text-primary border-primary/30", label: "In Review" },
    lapsed:          { cls: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900", label: "Lapsed" },
  };
  const s = map[status] ?? { cls: "bg-muted text-muted-foreground border-border", label: status ?? "—" };
  return <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 font-medium", s.cls)}>{s.label}</span>;
}
