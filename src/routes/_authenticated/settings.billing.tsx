import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { CreditCard, Users, Sparkles, Crown, ExternalLink, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { money } from "@/lib/format";
import {
  getBillingOverview, createCheckoutSession, createPortalSession,
  listNovaSeatAgents, assignNovaSeat, unassignNovaSeat, getSeatBreakdown, getNovaProStatus,
} from "@/lib/billing.functions";
import { getMyAccess } from "@/lib/permissions.functions";
import { Link } from "@tanstack/react-router";
import { Check, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/billing")({
  head: () => ({ meta: [{ title: "Billing — Agent Cloud" }] }),
  component: BillingPage,
});

const STATUS_BADGE: Record<string, { v: any; label: string }> = {
  active: { v: "success", label: "Active" },
  trialing: { v: "info", label: "Trial" },
  past_due: { v: "warning", label: "Past Due" },
  cancelled: { v: "destructive", label: "Cancelled" },
  inactive: { v: "outline", label: "Inactive" },
};

/** Role-aware billing: one route, different content per role. */
function BillingPage() {
  const accessFn = useServerFn(getMyAccess);
  const { data: access, isLoading } = useQuery({ queryKey: ["my-access"], queryFn: () => accessFn() });

  if (isLoading || !access) return <PageShell><Skeleton className="h-72" /></PageShell>;
  if (access.isSolo) return <SoloBilling access={access} />;
  if (access.isOwner) return <OwnerBilling />;
  return <MemberBilling access={access} />;
}

// ── Member view (manager / agent / staff) ────────────────────────────────────

function MemberBilling({ access }: { access: any }) {
  const statusFn = useServerFn(getNovaProStatus);
  const { data: nova } = useQuery({ queryKey: ["nova-pro", "status"], queryFn: () => statusFn() });
  const badge = STATUS_BADGE[access.orgStatus] ?? STATUS_BADGE.inactive;
  // Staff need the owner's permission before Nova Pro is even shown.
  const novaHidden = access.role === "staff" && !access.permissions?.staff_nova_pro_enabled;

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand title="Your Account" />
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-muted-foreground">You're a member of</div>
              <div className="font-display font-semibold text-lg" style={{ fontFamily: "var(--font-display)" }}>{access.orgName ?? "your agency"}</div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Your seat is covered by your agency — you don't pay for platform access.
              </p>
            </div>
            <Badge variant={badge.v}>Agency Plan · {badge.label}</Badge>
          </div>
        </Panel>

        {!novaHidden && nova && (
          <Panel title="Nova AI Pro" action={<Badge variant={(STATUS_BADGE as any)[nova.status === "grace_period" ? "past_due" : nova.status]?.v ?? "outline"}>{nova.status === "grace_period" ? "Grace Period" : nova.status === "active" ? "Active" : "Inactive"}</Badge>}>
            {nova.status === "active" || nova.status === "grace_period" ? (
              <div className="text-sm space-y-1.5">
                <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span>{nova.source === "agency" ? "Agency-assigned seat" : "Personal subscription"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Business number</span><span className="tnum">{nova.phone ?? "provisioning"}</span></div>
                <Button asChild size="sm" variant="outline" className="mt-2"><Link to="/settings/nova-pro">Usage & subscription →</Link></Button>
              </div>
            ) : (
              <div className="text-sm space-y-3">
                <p className="text-muted-foreground">
                  Dedicated business number, automated retention alerts, and advanced client tools. {money(49)}/month · cancel anytime.
                </p>
                <Button asChild size="sm"><Link to="/settings/nova-pro">Upgrade to Nova Pro →</Link></Button>
              </div>
            )}
          </Panel>
        )}
      </div>
    </PageShell>
  );
}

// ── Solo agent view ──────────────────────────────────────────────────────────

function SoloBilling({ access }: { access: any }) {
  const statusFn = useServerFn(getNovaProStatus);
  const checkoutFn = useServerFn(createCheckoutSession);
  const portalFn = useServerFn(createPortalSession);
  const { data: nova } = useQuery({ queryKey: ["nova-pro", "status"], queryFn: () => statusFn() });
  const badge = STATUS_BADGE[access.orgStatus] ?? STATUS_BADGE.inactive;

  const upgrade = useMutation({
    mutationFn: () => checkoutFn({ data: { product: "agency_plan" } }),
    onSuccess: (r: any) => { if (r?.url) window.location.assign(r.url); },
    onError: (e: any) => toast.error(e?.message ?? "Upgrade failed"),
  });
  const portal = useMutation({
    mutationFn: () => portalFn({ data: { scope: "personal" } }),
    onSuccess: (r: any) => { if (r?.url) window.location.assign(r.url); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't open portal"),
  });

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand title="Billing & Plan" actions={<Badge variant={badge.v}>Solo Agent Plan · {badge.label}</Badge>} />
        <Panel title="Solo Agent Plan">
          <div className="text-sm space-y-1.5">
            <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="tnum font-semibold">{money(79)}/month</span></div>
            {["Full CRM & pipeline", "Book of business", "Commission tracker", "Nova AI Pro (included)"].map((f) => (
              <div key={f} className="flex items-center gap-2 text-muted-foreground"><Check className="h-3.5 w-3.5 text-success" /> {f}</div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={() => portal.mutate()} disabled={portal.isPending}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Manage Subscription
            </Button>
          </div>
        </Panel>

        {nova && (
          <Panel title="Nova AI Pro" action={<Badge variant="gold">Included in your plan</Badge>}>
            <div className="text-sm space-y-1.5 mb-3">
              <div className="flex justify-between"><span className="text-muted-foreground">Business number</span><span className="tnum">{nova.phone ?? "provisioning"}</span></div>
            </div>
            <Button asChild size="sm" variant="outline"><Link to="/settings/nova-pro">Usage meters →</Link></Button>
          </Panel>
        )}

        <Panel title="Ready to grow your team?">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-gold-glow grid place-items-center text-gold-bright shrink-0"><TrendingUp className="h-5 w-5" /></div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">
                Upgrade to the Agency Plan to unlock team management, recruiting pipeline, leaderboard, and multi-agent analytics.
                Your clients, policies, and commissions stay exactly as they are.
              </p>
              <p className="text-sm font-semibold mt-1.5 tnum">Agency Plan — {money(199)}/month (includes 15 agents)</p>
              <Button className="mt-3" onClick={() => upgrade.mutate()} disabled={upgrade.isPending}>
                Upgrade to Agency Plan →
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}

// ── Agency owner view ────────────────────────────────────────────────────────

function OwnerBilling() {
  const overviewFn = useServerFn(getBillingOverview);
  const checkoutFn = useServerFn(createCheckoutSession);
  const portalFn = useServerFn(createPortalSession);

  const { data, isLoading, error } = useQuery({
    queryKey: ["billing", "overview"],
    queryFn: () => overviewFn(),
    retry: false,
  });

  const go = useMutation({
    mutationFn: (p: { product: any; quantity?: number }) => checkoutFn({ data: p }),
    onSuccess: (r: any) => { if (r?.url) window.location.assign(r.url); },
    onError: (e: any) => toast.error(e?.message ?? "Checkout failed"),
  });
  const portal = useMutation({
    mutationFn: () => portalFn({ data: { scope: "org" } }),
    onSuccess: (r: any) => { if (r?.url) window.location.assign(r.url); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't open billing portal"),
  });

  if (isLoading) return <PageShell><Skeleton className="h-72" /></PageShell>;
  if (error) {
    return (
      <PageShell>
        <div className="max-w-xl mx-auto">
          <Panel>
            <div className="py-10 text-center space-y-2">
              <div className="font-display font-semibold" style={{ fontFamily: "var(--font-display)" }}>Agency billing</div>
              <p className="text-sm text-muted-foreground">{(error as any)?.message ?? "Billing is available to agency owners."}</p>
            </div>
          </Panel>
        </div>
      </PageShell>
    );
  }

  const d = data!;
  const badge = STATUS_BADGE[d.org.subscription_status] ?? STATUS_BADGE.inactive;

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand
          title="Billing"
          subtitle={`${d.org.name} · ${d.org.plan_type === "white_label" ? "White-Label" : d.org.plan_type === "solo" ? "Solo" : "Agency"} Plan`}
          actions={
            <>
              <Badge variant={badge.v}>{badge.label}</Badge>
              {d.configured && d.org.subscription_status !== "inactive" && (
                <Button variant="outline" size="sm" onClick={() => portal.mutate()} disabled={portal.isPending}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Manage Billing
                </Button>
              )}
            </>
          }
        />

        {!d.configured && (
          <div className="rounded-[var(--radius)] border border-warning/30 bg-warning/10 p-3 text-sm text-muted-foreground">
            Stripe isn't connected yet — checkout and the customer portal activate once the Stripe keys are added to the environment.
            Everything below reflects live workspace data.
          </div>
        )}

        {/* Plan + totals */}
        <div className="grid sm:grid-cols-4 gap-[var(--gap)]">
          <Panel><StatTile label="Active Agents" value={String(d.seats.active)} delta={`${d.seats.included} included`} /></Panel>
          <Panel><StatTile label="Seat Overage" value={String(d.seats.overage)} delta={d.seats.overage > 0 ? `+${money(d.seats.overageCost)}/mo` : "no overage"} deltaUp={d.seats.overage === 0} /></Panel>
          <Panel><StatTile label="Nova Seats" value={String(d.org.nova_seats_purchased)} delta={`${d.nova.assignedSeats} assigned`} /></Panel>
          <Panel><StatTile label="Est. Monthly Total" value={money(d.estimatedMonthlyTotal)} tone="gold" delta="after partner credit" /></Panel>
        </div>

        {/* Line items */}
        <Panel title="Monthly Breakdown">
          <div className="text-sm divide-y divide-border-soft">
            <Row label={`Agency Plan (includes ${d.seats.included} agents)`} value={money(d.pricing.agencyBase)} />
            {d.seats.overage > 0 && (
              <Row label={`${d.seats.overage} additional agents × ${money(d.pricing.seatOverage)}`} value={money(d.seats.overageCost)} />
            )}
            {d.org.nova_seats_purchased > 0 && (
              <Row label={`${d.org.nova_seats_purchased} Nova Pro seats × ${money(d.pricing.novaPro)}`} value={money(d.org.nova_seats_purchased * d.pricing.novaPro)} />
            )}
            {d.org.plan_type === "white_label" && (
              <Row label="White-Label" value={money(d.pricing.whiteLabelMonthly)} />
            )}
            {d.nova.monthlyCommission > 0 && (
              <Row label={`Nova Partner credit (${d.nova.commissionEligible} × ${money(d.pricing.novaPro * d.nova.rate)})`} value={`−${money(d.nova.monthlyCommission)}`} accent="success" />
            )}
            <div className="flex justify-between py-2.5 font-semibold">
              <span>Estimated total</span>
              <span className="tnum font-display" style={{ fontFamily: "var(--font-display)" }}>{money(d.estimatedMonthlyTotal)}/mo</span>
            </div>
          </div>
          {d.configured && d.org.subscription_status === "inactive" && (
            <Button className="mt-3" onClick={() => go.mutate({ product: "agency_plan" })} disabled={go.isPending}>
              <CreditCard className="h-4 w-4 mr-1.5" /> Activate Agency Plan — {money(d.pricing.agencyBase)}/mo
            </Button>
          )}
        </Panel>

        {/* Nova Partner Revenue Program */}
        <Panel
          title="Nova Partner Revenue Program"
          action={<span className="text-xs text-muted-foreground tnum">{Math.round(d.nova.rate * 100)}% of active Nova subscriptions</span>}
        >
          <div className="grid sm:grid-cols-3 gap-[var(--gap)]">
            <StatTile label="Nova Subscribers" value={String(d.nova.commissionEligible)} delta="active & paid, excl. you" />
            <StatTile label="Monthly Credit" value={money(d.nova.monthlyCommission)} tone="gold" delta="applied to your invoice" />
            <StatTile label="Earned YTD" value={money(d.nova.ytd)} />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            You earn {money(d.pricing.novaPro * d.nova.rate)}/month for every agent in your agency with an active Nova Pro subscription — paid as a credit on your Agent Cloud invoice.
          </p>
        </Panel>

        {/* Seat breakdown */}
        <SeatBreakdownPanel />

        {/* Owner's personal Nova Pro — same $49 as everyone */}
        <OwnerNovaCard />

        {/* Nova seat management */}
        <NovaSeatsPanel configured={d.configured} onPurchase={(qty) => go.mutate({ product: "nova_seats", quantity: qty })} purchasing={go.isPending} />

        {/* White-label upsell */}
        {d.org.plan_type !== "white_label" && (
          <Panel title="White-Label">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gold-glow grid place-items-center text-gold-bright shrink-0"><Crown className="h-5 w-5" /></div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">
                  Your brand everywhere: custom logo and colors, your own subdomain, branded emails and login, white-label support.
                  <span className="tnum"> {money(999)}</span> one-time setup + <span className="tnum">{money(499)}/mo</span>. Requires an active Agency Plan.
                </p>
                <Button
                  className="mt-3" variant="outline"
                  onClick={() => go.mutate({ product: "white_label" })}
                  disabled={!d.configured || d.org.subscription_status !== "active" || go.isPending}
                >
                  Upgrade to White-Label
                </Button>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}

function SeatBreakdownPanel() {
  const [open, setOpen] = useState(false);
  const fn = useServerFn(getSeatBreakdown);
  const { data } = useQuery({ queryKey: ["billing", "seat-breakdown"], queryFn: () => fn(), enabled: open });
  return (
    <Panel
      title="Seat Breakdown"
      action={<Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "View seat breakdown"}</Button>}
    >
      <p className="text-xs text-muted-foreground">
        Every member with workspace access consumes a seat. You (the owner) never consume one; invited and imported members don't either.
      </p>
      {open && (
        <div className="mt-3 divide-y divide-border-soft">
          {(data?.rows ?? []).map((m: any) => (
            <div key={m.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="font-medium truncate">{m.first_name} {m.last_name}</span>
              <Badge variant="outline" className="text-[10px] capitalize">{m.role}</Badge>
              <span className="text-xs text-muted-foreground capitalize">{m.status ?? "pending"}</span>
              <span className="ml-auto">
                {m.billable
                  ? <Badge variant="gold" className="text-[10px]">Billable</Badge>
                  : <Badge variant="outline" className="text-[10px]">Free</Badge>}
              </span>
              <span className="text-xs text-text-dim tnum shrink-0">{new Date(m.created_at).toLocaleDateString()}</span>
            </div>
          ))}
          {open && (data?.rows?.length ?? 0) === 0 && (
            <div className="py-4 text-center text-sm text-muted-foreground">No members yet — invite your team from the Team page.</div>
          )}
        </div>
      )}
    </Panel>
  );
}

function OwnerNovaCard() {
  const statusFn = useServerFn(getNovaProStatus);
  const { data: nova } = useQuery({ queryKey: ["nova-pro", "status"], queryFn: () => statusFn() });
  if (!nova) return null;
  const on = nova.status === "active" || nova.status === "grace_period";
  return (
    <Panel title="Your Nova Pro" action={on ? <Badge variant="success">Active</Badge> : <span className="text-xs text-muted-foreground tnum">{money(49)}/month</span>}>
      {on ? (
        <div className="text-sm space-y-1.5">
          <div className="flex justify-between"><span className="text-muted-foreground">Business number</span><span className="tnum">{nova.phone ?? "provisioning"}</span></div>
          <Button asChild size="sm" variant="outline" className="mt-2"><Link to="/settings/nova-pro">Usage & subscription →</Link></Button>
        </div>
      ) : (
        <div className="text-sm space-y-3">
          <p className="text-muted-foreground">Same price as everyone on your team — your subscription counts toward adoption, but you don't earn partner credit on it.</p>
          <Button asChild size="sm"><Link to="/settings/nova-pro">Subscribe to Nova Pro — {money(49)}/month</Link></Button>
        </div>
      )}
    </Panel>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: "success" }) {
  return (
    <div className="flex justify-between py-2.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tnum ${accent === "success" ? "text-success font-medium" : ""}`}>{value}</span>
    </div>
  );
}

function NovaSeatsPanel({ configured, onPurchase, purchasing }: { configured: boolean; onPurchase: (qty: number) => void; purchasing: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listNovaSeatAgents);
  const assignFn = useServerFn(assignNovaSeat);
  const unassignFn = useServerFn(unassignNovaSeat);
  const [qty, setQty] = useState(5);

  const { data, isLoading } = useQuery({ queryKey: ["billing", "nova-seats"], queryFn: () => listFn() });

  const assign = useMutation({
    mutationFn: (agent_id: string) => assignFn({ data: { agent_id } }),
    onSuccess: () => { toast.success("Nova seat assigned"); qc.invalidateQueries({ queryKey: ["billing"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't assign seat"),
  });
  const unassign = useMutation({
    mutationFn: (agent_id: string) => unassignFn({ data: { agent_id } }),
    onSuccess: () => { toast.success("Seat removed — agent has a 48-hour grace period"); qc.invalidateQueries({ queryKey: ["billing"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't remove seat"),
  });

  return (
    <Panel
      title="Nova Pro Seats"
      action={
        <div className="flex items-center gap-2">
          <Input
            type="number" min={1} max={500} value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            className="w-20 h-8 tnum"
          />
          <Button size="sm" onClick={() => onPurchase(qty)} disabled={!configured || purchasing}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Buy Seats
          </Button>
        </div>
      }
    >
      <p className="text-xs text-muted-foreground mb-3">
        Assign purchased seats to agents — they get full Nova Pro without entering a card. Personal subscriptions always take precedence over an assigned seat.
      </p>
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : (data?.agents?.length ?? 0) === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">No agents in your organization yet. Invite agents from the Team page first.</div>
      ) : (
        <div className="divide-y divide-border-soft">
          {data!.agents.map((a: any) => {
            const active = ["active", "grace_period", "past_due"].includes(a.nova_pro_status);
            return (
              <div key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Sparkles className={`h-4 w-4 shrink-0 ${active ? "text-gold-bright" : "text-text-dim"}`} />
                <span className="font-medium truncate">{a.first_name} {a.last_name}</span>
                <span className="text-xs text-muted-foreground truncate">{a.email}</span>
                <span className="ml-auto shrink-0">
                  {active ? (
                    <Badge variant={a.nova_pro_source === "personal" ? "info" : "gold"} className="text-[10px]">
                      {a.nova_pro_source === "personal" ? "Personal sub" : a.nova_pro_status === "grace_period" ? "Grace period" : "Agency seat"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">No Nova Pro</Badge>
                  )}
                </span>
                {a.nova_pro_source === "agency" && a.nova_pro_status === "active" ? (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive shrink-0" onClick={() => unassign.mutate(a.id)} disabled={unassign.isPending}>
                    <Minus className="h-3 w-3 mr-1" /> Remove
                  </Button>
                ) : !active ? (
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => assign.mutate(a.id)} disabled={assign.isPending}>
                    Assign Seat
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
