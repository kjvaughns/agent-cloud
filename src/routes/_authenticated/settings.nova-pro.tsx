import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Phone, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getNovaProStatus, createCheckoutSession, createPortalSession } from "@/lib/billing.functions";
import { useMyAccess } from "@/hooks/use-my-access";

export const Route = createFileRoute("/_authenticated/settings/nova-pro")({
  head: () => ({ meta: [{ title: "Nova Pro — Agent Cloud" }] }),
  component: NovaProPage,
});

const STATUS_BADGE: Record<string, { v: any; label: string }> = {
  active: { v: "success", label: "Active" },
  grace_period: { v: "warning", label: "Grace Period" },
  past_due: { v: "warning", label: "Past Due" },
  inactive: { v: "outline", label: "Inactive" },
};

function UsageMeter({ label, used, included, overage }: { label: string; used: number; included: number; overage: number }) {
  const pct = Math.min(100, Math.round((used / included) * 100));
  const color = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary";
  return (
    <div className="py-2.5 border-b border-border-soft last:border-0">
      <div className="flex justify-between text-sm mb-1.5">
        <span>{label}</span>
        <span className={cn("tnum text-xs", pct >= 100 ? "text-destructive font-semibold" : pct >= 80 ? "text-warning" : "text-muted-foreground")}>
          {used.toLocaleString()} / {included.toLocaleString()}{pct >= 100 ? ` · overage ${money(overage)}/ea` : ""}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function NovaProPage() {
  const statusFn = useServerFn(getNovaProStatus);
  const checkoutFn = useServerFn(createCheckoutSession);
  const portalFn = useServerFn(createPortalSession);
  const { access } = useMyAccess();

  const { data: d, isLoading } = useQuery({ queryKey: ["nova-pro", "status"], queryFn: () => statusFn() });

  const subscribe = useMutation({
    mutationFn: () => checkoutFn({ data: { product: "nova_pro_personal" } }),
    onSuccess: (r: any) => { if (r?.url) window.location.assign(r.url); },
    onError: (e: any) => toast.error(e?.message ?? "Checkout failed"),
  });
  const portal = useMutation({
    mutationFn: () => portalFn({ data: { scope: "personal" } }),
    onSuccess: (r: any) => { if (r?.url) window.location.assign(r.url); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't open portal"),
  });

  if (isLoading || !d) return <PageShell><Skeleton className="h-72" /></PageShell>;

  // Staff can only see Nova Pro when their agency owner has enabled it for them.
  if (access && access.role === "staff" && !access.isOwner && !access.permissions?.staff_nova_pro_enabled) {
    return (
      <PageShell>
        <div className="max-w-xl mx-auto">
          <Panel>
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nova Pro isn't enabled for your account. Ask your agency owner if you need access.
            </div>
          </Panel>
        </div>
      </PageShell>
    );
  }

  const badge = STATUS_BADGE[d.status] ?? STATUS_BADGE.inactive;
  const isOn = d.status === "active" || d.status === "grace_period";

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand
          title="Nova AI Pro"
          subtitle="Your personal AI operator — dedicated number, retention alerts, automations, and advanced Nova."
          actions={<Badge variant={badge.v}>{badge.label}</Badge>}
        />

        {d.status === "grace_period" && (
          <div className="rounded-[var(--radius)] border border-warning/40 bg-warning/10 p-3.5 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold">Your Nova Pro access ends {d.graceUntil ? new Date(d.graceUntil).toLocaleString() : "soon"}.</div>
              <p className="text-muted-foreground mt-0.5">
                Subscribe personally to keep your phone number and automations with no interruption.
              </p>
              <Button size="sm" className="mt-2" onClick={() => subscribe.mutate()} disabled={!d.configured || subscribe.isPending}>
                Subscribe Personally — {money(d.price)}/mo
              </Button>
            </div>
          </div>
        )}

        {isOn ? (
          <>
            <div className="grid sm:grid-cols-2 gap-[var(--gap)]">
              <Panel title="Source">
                <div className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-gold-bright" />
                  {d.source === "agency" ? "Agency-assigned seat" : d.source === "solo" ? "Solo Agent Plan" : "Personal subscription"}
                </div>
                {d.source === "personal" && d.configured && (
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => portal.mutate()} disabled={portal.isPending}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Manage Subscription
                  </Button>
                )}
              </Panel>
              <Panel title="Business Number">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-primary" />
                  {d.phone ? (
                    <span className="tnum font-medium">{d.phone}</span>
                  ) : (
                    <span className="text-muted-foreground">Provisioning — assigned when the phone provider connection goes live</span>
                  )}
                </div>
              </Panel>
            </div>

            <Panel title="Monthly Usage" action={d.usage.resetAt ? <span className="text-xs text-muted-foreground tnum">resets monthly · since {new Date(d.usage.resetAt).toLocaleDateString()}</span> : undefined}>
              <UsageMeter label={d.limits.outbound_minutes.label} used={d.usage.calls_minutes} included={d.limits.outbound_minutes.included} overage={d.limits.outbound_minutes.overage} />
              <UsageMeter label={d.limits.sms.label} used={d.usage.sms} included={d.limits.sms.included} overage={d.limits.sms.overage} />
              <UsageMeter label={d.limits.ai_queries.label} used={d.usage.ai_queries} included={d.limits.ai_queries.included} overage={d.limits.ai_queries.overage} />
              <UsageMeter label={d.limits.automations.label} used={d.usage.automations} included={d.limits.automations.included} overage={d.limits.automations.overage} />
              <p className="text-xs text-muted-foreground pt-3">
                We'll alert you at 80% and 100% of each allowance. Overages are added to your next billing cycle.
              </p>
            </Panel>
          </>
        ) : (
          <Panel>
            <div className="py-8 text-center space-y-4">
              <div className="mx-auto h-14 w-14 rounded-full bg-gold-glow grid place-items-center text-gold-bright">
                <Sparkles className="h-7 w-7" />
              </div>
              <div className="font-display font-bold text-xl" style={{ fontFamily: "var(--font-display)" }}>
                Upgrade to Nova Pro — {money(d.price)}/mo
              </div>
              <ul className="text-sm text-muted-foreground space-y-1.5 max-w-sm mx-auto text-left">
                <li>• Dedicated business phone number</li>
                <li>• Daily at-risk policy alerts for your book</li>
                <li>• Client follow-up automations (birthdays, renewals, callbacks)</li>
                <li>• Advanced Nova queries — drafts, summaries, commission breakdowns</li>
                <li>• Personal performance dashboard</li>
              </ul>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Includes 300 outbound + 300 inbound minutes, 500 messages, 500 Nova queries, and 200 automation runs per month. Your subscription follows you between agencies.
              </p>
              <Button onClick={() => subscribe.mutate()} disabled={!d.configured || subscribe.isPending}>
                {d.configured ? `Upgrade — ${money(d.price)}/mo` : "Billing not configured yet"}
              </Button>
            </div>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}
