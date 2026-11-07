/**
 * Agency Launchpad: a progress ring and the remaining steps, each opening the
 * hub that finishes it. Hidden once everything is done (reopenable).
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, HelpCircle, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useServerFn } from "@/hooks/use-server-fn";
import { getAgencySetupProgress } from "@/lib/settings/setup.functions";
import { getSetupState, saveSetupStep } from "@/lib/self-serve.functions";
import { CarrierHowTo } from "@/components/contracting/carrier-how-to";
import { toast } from "sonner";

const DISMISS_KEY = "agentcloud.setup.dismissed";

function Ring({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90" aria-hidden>
      <circle cx="32" cy="32" r={r} className="fill-none stroke-surface-2" strokeWidth="6" />
      <circle cx="32" cy="32" r={r} className="fill-none stroke-primary transition-all duration-700" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
    </svg>
  );
}

export function AgencySetupProgress({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings", "agency-setup-progress"], queryFn: () => getAgencySetupProgress() });
  const getState = useServerFn(getSetupState);
  const save = useServerFn(saveSetupStep);
  const { data: setup } = useQuery({ queryKey: ["setup-state"], queryFn: () => getState(), staleTime: 60_000 });
  const [dismissed, setDismissed] = useState(false);
  const [howTo, setHowTo] = useState(false);
  useEffect(() => { try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); } catch {} }, []);

  if (!data?.available) return null;
  const items = data.items;
  const done = items.filter((i) => i.done).length;
  const ready = done === items.length;
  const pct = Math.round((done / items.length) * 100);
  const needsSetup = Boolean(setup?.needsSetup);

  async function finish() {
    try {
      await save({ data: { step: 10, finish: true } });
      await qc.invalidateQueries({ queryKey: ["setup-state"] });
      toast.success("Your agency is live.");
    } catch (e: any) { toast.error(e?.message ?? "Couldn't save"); }
  }

  if (dismissed && ready && !needsSetup) {
    return (
      <button type="button" onClick={() => { setDismissed(false); try { localStorage.removeItem(DISMISS_KEY); } catch {} }} className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
        Show launchpad
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <div className="relative">
          <Ring pct={pct} />
          <span className="tnum absolute inset-0 grid place-items-center text-sm font-semibold">{done}/{items.length}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-primary"><Rocket className="h-3.5 w-3.5" /> Launchpad</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">{ready ? "Your agency is ready" : "A few steps to launch"}</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="How to add a carrier" onClick={() => setHowTo(true)}><HelpCircle className="h-4 w-4" /></Button>
          {ready && !needsSetup && (
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Hide launchpad" onClick={() => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, "1"); } catch {} }}><X className="h-4 w-4" /></Button>
          )}
        </div>
      </div>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button" disabled={item.done} onClick={() => onOpenTab(item.tab)}
              className={cn("group flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                item.done ? "border-transparent bg-surface-2/60" : "border-border hover:border-primary/50 hover:bg-primary/5")}
            >
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full", item.done ? "bg-success/15 text-success" : "border border-primary/40 text-primary")}>
                {item.done ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium", item.done && "text-muted-foreground line-through")}>{item.label}</span>
                {!item.done && <span className="block truncate text-xs text-muted-foreground">{item.missing}</span>}
              </span>
              {!item.done && <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />}
            </button>
          </li>
        ))}
      </ul>

      {needsSetup && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">Done for now? You can finish the rest anytime.</p>
          <Button variant="ink" className="rounded-full" onClick={finish}>Launch my agency</Button>
        </div>
      )}

      <CarrierHowTo open={howTo} onOpenChange={setHowTo} onGoToCarriers={() => { setHowTo(false); onOpenTab("carriers"); }} />
    </section>
  );
}
