import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@/hooks/use-server-fn";
import { activateAgencySuite, getSetupState, saveSetupStep } from "@/lib/self-serve.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({ meta: [{ title: "Set up your workspace — Agent Cloud" }, { name: "description", content: "Finish setting up your Agent Cloud workspace." }] }),
  component: SetupWizard,
});

function SetupWizard() {
  const qc = useQueryClient();
  const getState = useServerFn(getSetupState);
  const save = useServerFn(saveSetupStep);
  const activate = useServerFn(activateAgencySuite);
  const { data, isLoading } = useQuery({ queryKey: ["setup-state"], queryFn: () => getState() });
  const [i, setI] = useState(0);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState("");
  const [color, setColor] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [suite, setSuite] = useState<Awaited<ReturnType<typeof activate>> | null>(null);

  useEffect(() => {
    if (!data?.org) return;
    setName(data.org.name ?? "");
    setLogo(data.org.logo_url ?? "");
    setColor(data.org.accent_color ?? "");
    setSlug(data.org.slug ?? "");
    setSuite(data.suite ?? null);
    setI(Math.min(data.org.onboarding_step ?? 0, (data.steps?.length ?? 1) - 1));
  }, [data]);

  if (isLoading) return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!data?.org) {
    return <div className="mx-auto max-w-lg py-16 text-center text-muted-foreground">Setup is run by your workspace owner. <Link to="/dashboard" className="underline">Go to dashboard</Link></div>;
  }
  const steps = data.steps!;
  const step = steps[i];
  const last = i === steps.length - 1;

  async function next(extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await save({ data: { step: i + 1, finish: last, ...extra } });
      if (last) {
        await qc.invalidateQueries({ queryKey: ["setup-state"] });
        toast.success("You're all set up.");
        window.location.assign("/dashboard");
      } else setI(i + 1);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Set up your workspace</h1>
      <p className="mt-1 text-sm text-muted-foreground">A few quick steps. Your progress is saved, so you can come back anytime.</p>
      <ol className="mt-6 flex gap-2">
        {steps.map((s, n) => (
          <li key={s.key} className={cn("flex-1 rounded-full h-1.5", n <= i ? "bg-primary" : "bg-muted")} aria-label={s.title} />
        ))}
      </ol>
      <div className="mt-6 rounded-[var(--radius)] border border-border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Step {i + 1} of {steps.length}</p>
        <h2 className="mt-1 text-xl font-semibold">{step.title}</h2>

        {step.key === "agency" && (
          <div className="mt-4 space-y-4">
            <div className="space-y-2"><Label htmlFor="s-name">Agency name</Label><Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="s-logo">Logo web address (optional)</Label><Input id="s-logo" placeholder="https://…" value={logo} onChange={(e) => setLogo(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="s-color">Brand color (optional)</Label><Input id="s-color" placeholder="#B48C3E" value={color} onChange={(e) => setColor(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="s-slug">Portal address</Label><Input id="s-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} /><p className="text-xs text-muted-foreground">Letters, numbers and dashes. Used in your agent invite links.</p></div>
          </div>
        )}

        {step.key === "carriers" && (
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p>Bring in your book so your dashboard has real numbers from day one.</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><Link to="/settings/carriers">Pick carriers</Link></Button>
              <Button asChild variant="outline"><Link to="/import">Upload a spreadsheet</Link></Button>
              <Button asChild variant="outline"><Link to="/carrier-sync">Upload a carrier statement</Link></Button>
            </div>
            <p className="text-xs">Come back here when you're done, or skip and do it later.</p>
          </div>
        )}

        {step.key === "team" && (
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p>Invite your agents and set their comp level and upline. They get an email link to join.</p>
            <Button asChild variant="outline"><Link to="/team">Invite agents</Link></Button>
          </div>
        )}

        {step.key === "suite" && (
          <div className="mt-4 space-y-3 text-sm">
            <p className="text-muted-foreground">Turn on Licensing, Bankdocs, Release Center and your own Academy — all included in your plan.</p>
            {suite ? (
              <ul className="space-y-2">
                <CopyRow label="Licensing partner code" value={suite.partnerCode} />
                <CopyRow label="Recruit link" value={suite.recruitLink} />
                <CopyRow label="Your Academy" value={suite.academy} />
                <CopyRow label="Bankdocs" value={suite.bankdocs} />
                <CopyRow label="Release Center" value={suite.releaseCenter} />
              </ul>
            ) : (
              <Button variant="ink" disabled={busy} onClick={async () => { setBusy(true); try { setSuite(await activate()); } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); } }}>
                Turn on Agency Suite
              </Button>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" disabled={i === 0 || busy} onClick={() => setI(i - 1)}>Back</Button>
          <Button
            variant="ink"
            disabled={busy}
            onClick={() => next(step.key === "agency" ? { name: name || undefined, logo_url: logo || null, accent_color: color || null, slug: slug || undefined } : {})}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : last ? "Finish" : step.key === "agency" ? "Save & continue" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <div className="min-w-0"><div className="text-xs text-muted-foreground">{label}</div><div className="truncate font-medium">{value}</div></div>
      <Button size="sm" variant="ghost" aria-label={`Copy ${label}`} onClick={() => { navigator.clipboard.writeText(value); setDone(true); }}>
        {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </li>
  );
}
