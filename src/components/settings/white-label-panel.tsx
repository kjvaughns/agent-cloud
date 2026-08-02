import { Link } from "@tanstack/react-router";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Crown, Check, Loader2, Palette, Globe, Mail, LogIn } from "lucide-react";
import { toast } from "sonner";
import { money } from "@/lib/format";
import { PRICING } from "@/lib/billing/pricing";
import {
  getWhiteLabelStatus, applyForWhiteLabel, withdrawWhiteLabelApplication,
} from "@/lib/white-label.functions";


const TIMELINES = ["As soon as possible", "Within a month", "This quarter", "Just exploring"];
const AGENT_COUNTS = ["1–10", "11–25", "26–50", "51–150", "150+"];

const INCLUDED = [
  { icon: Palette, title: "Your branding", body: "Your logo and brand colour across the whole platform." },
  { icon: Globe, title: "Your domain", body: "Your team signs in at your address, not ours." },
  { icon: LogIn, title: "Branded login", body: "Your mark on the sign-in and signup screens." },
  { icon: Mail, title: "Branded email", body: "Agency mail carries your identity, not Agent Cloud's." },
];

const STATUS_COPY: Record<string, { label: string; variant: any; body: string }> = {
  submitted: { label: "Submitted", variant: "info", body: "We've got it. Someone will reach out to confirm your domain and branding." },
  in_review: { label: "In review", variant: "info", body: "We're checking domain availability and preparing your setup." },
  approved: { label: "Approved", variant: "success", body: "Approved — we'll be in touch to schedule the switchover and take payment." },
  live: { label: "Live", variant: "success", body: "Your white-label workspace is live." },
  declined: { label: "Declined", variant: "destructive", body: "We weren't able to proceed with this application." },
  withdrawn: { label: "Withdrawn", variant: "secondary", body: "You withdrew this application. You can apply again any time." },
};

export function WhiteLabelPage() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getWhiteLabelStatus);
  const applyFn = useServerFn(applyForWhiteLabel);
  const withdrawFn = useServerFn(withdrawWhiteLabelApplication);

  const { data, isLoading } = useQuery({ queryKey: ["white-label"], queryFn: () => statusFn() });

  const [form, setForm] = useState({
    brand_name: "", tagline: "", desired_domain: "",
    accent_color: "#CBA35A", agent_count: "", timeline: "", notes: "",
  });
  const [error, setError] = useState<string | null>(null);

  // Seed from the agency they already have, so this is mostly confirmation.
  useEffect(() => {
    const org = (data as any)?.org;
    if (!org) return;
    setForm((f) => ({
      ...f,
      brand_name: f.brand_name || org.name || "",
      tagline: f.tagline || org.tagline || "",
      accent_color: f.accent_color === "#CBA35A" ? (org.accent_color || "#CBA35A") : f.accent_color,
    }));
  }, [data]);

  const apply = useMutation({
    mutationFn: () =>
      applyFn({
        data: {
          brand_name: form.brand_name.trim(),
          tagline: form.tagline.trim() || null,
          desired_domain: form.desired_domain.trim() || null,
          accent_color: form.accent_color || null,
          agent_count: form.agent_count || null,
          timeline: form.timeline || null,
          notes: form.notes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Application submitted");
      setError(null);
      qc.invalidateQueries({ queryKey: ["white-label"] });
    },
    // Kept on the page rather than only in a toast — the form is still filled
    // in and the reason usually tells you what to fix.
    onError: (e: any) => setError(e?.message ?? "Couldn't submit your application"),
  });

  const withdraw = useMutation({
    mutationFn: (id: string) => withdrawFn({ data: { id } }),
    onSuccess: () => { toast.success("Application withdrawn"); qc.invalidateQueries({ queryKey: ["white-label"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't withdraw"),
  });

  if (isLoading) {
    return <PageShell><Skeleton className="h-96" /></PageShell>;
  }

  const d = data as any;
  const app = d?.application;
  const openApp = app && ["submitted", "in_review", "approved"].includes(app.status);

  return (
    <PageShell>
      <div className="mx-auto flex max-w-3xl flex-col gap-[var(--gap)]">
        <HeroBand
          title="White Label"
          subtitle="Run Agent Cloud as your own platform"
          actions={
            <span className="text-right">
              <span className="tnum block text-lg font-bold">{money(PRICING.whiteLabelMonthly)}<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
              <span className="tnum block text-[11px] text-muted-foreground">+ {money(PRICING.whiteLabelSetup)} setup</span>
            </span>
          }
        />

        <Panel>
          <div className="grid gap-4 sm:grid-cols-2">
            {INCLUDED.map((i) => (
              <div key={i.title} className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <i.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{i.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{i.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Your agents, clients and carrier relationships stay yours throughout — White Label
            changes what the platform looks like, not who owns what is in it.
          </p>
        </Panel>

        {/* Existing application */}
        {app && (
          <Panel
            title="Your application"
            action={<Badge variant={STATUS_COPY[app.status]?.variant}>{STATUS_COPY[app.status]?.label}</Badge>}
          >
            <p className="text-sm text-muted-foreground">{STATUS_COPY[app.status]?.body}</p>
            <dl className="mt-4 space-y-1.5 text-sm">
              <Row label="Brand name" value={app.brand_name} />
              {app.desired_domain && <Row label="Domain" value={app.desired_domain} />}
              {app.timeline && <Row label="Timeline" value={app.timeline} />}
              <Row label="Submitted" value={new Date(app.created_at).toLocaleDateString()} />
            </dl>
            {app.review_notes && (
              <p className="mt-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
                {app.review_notes}
              </p>
            )}
            {openApp && app.status !== "approved" && (
              <Button
                variant="outline" size="sm" className="mt-4"
                onClick={() => withdraw.mutate(app.id)}
                disabled={withdraw.isPending}
              >
                Withdraw application
              </Button>
            )}
          </Panel>
        )}

        {/* Not eligible */}
        {!d?.eligible && !openApp && (
          <Panel>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gold-glow text-gold-bright">
                <Crown className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                {d?.reason === "already_live" && (
                  <>
                    <p className="text-sm font-medium">Your agency is already on White Label.</p>
                    <Button asChild variant="outline" size="sm" className="mt-3">
                      <Link to="/settings/agency">Manage your branding →</Link>
                    </Button>
                  </>
                )}
                {d?.reason === "not_owner" && (
                  <p className="text-sm text-muted-foreground">
                    Only the agency owner can apply for White Label.
                  </p>
                )}
                {d?.reason === "solo_plan" && (
                  <>
                    <p className="text-sm font-medium">White Label sits on top of the Agency Plan.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Upgrade to the Agency Plan first, then apply.
                    </p>
                    <Button asChild size="sm" className="mt-3">
                      <Link to="/settings">View plans →</Link>
                    </Button>
                  </>
                )}
                {d?.reason === "inactive_subscription" && (
                  <>
                    <p className="text-sm font-medium">Your Agency Plan needs to be active first.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Activate your subscription and this page will open up.
                    </p>
                    <Button asChild size="sm" className="mt-3">
                      <Link to="/settings">Go to billing →</Link>
                    </Button>
                  </>
                )}
                {d?.reason === "no_org" && (
                  <p className="text-sm text-muted-foreground">
                    No agency is attached to your account yet.
                  </p>
                )}
              </div>
            </div>
          </Panel>
        )}

        {/* Application form */}
        {d?.eligible && !openApp && (
          <Panel title="Apply">
            <p className="mb-4 text-sm text-muted-foreground">
              We'll confirm your domain is available and walk you through the DNS records before
              anything is charged.
            </p>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Brand name" required>
                  <Input
                    value={form.brand_name}
                    onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
                    placeholder="Your agency's name"
                  />
                </Field>
                <Field label="Tagline">
                  <Input
                    value={form.tagline}
                    onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                    maxLength={80}
                    placeholder="Optional"
                  />
                </Field>
              </div>

              <Field label="Domain you want to use">
                <Input
                  value={form.desired_domain}
                  onChange={(e) => setForm({ ...form, desired_domain: e.target.value.toLowerCase() })}
                  placeholder="app.youragency.com"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A subdomain you control. You'll add a DNS record; we'll tell you exactly which.
                </p>
              </Field>

              <Field label="Brand colour">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="color"
                    value={form.accent_color}
                    onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                    className="h-10 w-16 cursor-pointer rounded-md border p-1"
                  />
                  <Input
                    value={form.accent_color}
                    onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                    className="w-28 font-mono text-sm"
                    maxLength={7}
                  />
                </div>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="How many agents?">
                  <Select value={form.agent_count} onValueChange={(v) => setForm({ ...form, agent_count: v })}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {AGENT_COUNTS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="When do you want to launch?">
                  <Select value={form.timeline} onValueChange={(v) => setForm({ ...form, timeline: v })}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {TIMELINES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Anything else we should know?">
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="min-h-[80px]"
                  placeholder="Existing brand guidelines, a launch date, anything unusual about your setup."
                />
              </Field>

              {error && (
                <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button
                onClick={() => apply.mutate()}
                disabled={form.brand_name.trim().length < 2 || apply.isPending}
              >
                {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1 h-4 w-4" /> Submit application</>}
              </Button>

              <p className="text-[11px] text-muted-foreground">
                Submitting does not charge you. {money(PRICING.whiteLabelSetup)} setup and{" "}
                {money(PRICING.whiteLabelMonthly)}/month begin once your domain is confirmed and you approve.
              </p>
            </div>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-xs">{label}{required && <span className="text-destructive"> *</span>}</Label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium">{value}</dd>
    </div>
  );
}
