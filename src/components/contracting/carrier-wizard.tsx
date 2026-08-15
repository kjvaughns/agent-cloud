import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Building2, Check, Circle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useServerFn } from "@/hooks/use-server-fn";
import { saveOrgCarrier } from "@/lib/contracting-ops.functions";
import { ManageGridsPage } from "@/components/contracting/manage-grids";
import { MethodsEditor } from "@/components/contracting/carrier-methods-editor";
import {
  WIZARD_STEPS, STEP_TITLE, STEP_PURPOSE, OPTIONAL_STEPS,
  wizardState, nextStep, wizardProgress, canOpenStep, toCarrierFacts,
  advanceOptionsUpTo, advanceWithinCarrierMax,
  type WizardStep, type WizardProgress,
} from "@/lib/carriers/wizard";
import { carrierState } from "@/lib/carriers/status";
import { ADVANCE_OPTIONS, ADVANCE_LABELS, type AdvanceOption } from "@/lib/compensation/resolve";
import { PRODUCT_TYPES } from "@/lib/products";
import { cn } from "@/lib/utils";

/**
 * Adding a carrier, as the seven steps the brief asks for.
 *
 * ── Why this replaced a form ──
 *
 * Carrier setup was one dialog. An owner three steps in who left to find the
 * carrier's contracting email came back to an empty form, and there was nothing
 * anywhere that could tell them what was still outstanding — so carriers ended
 * up half-configured, and the thing that noticed was a deal that could not be
 * priced weeks later.
 *
 * ── Nothing is held in memory ──
 *
 * Every step writes through `saveOrgCarrier` before the next one opens, and
 * progress is read back off the saved row rather than from anything this
 * component remembers. Closing the dialog mid-flow is therefore not a loss:
 * reopening the carrier lands on the first thing still missing. The one piece
 * of local state is the fields being typed, so a background refetch cannot
 * overwrite half a sentence.
 *
 * ── It does not decide whether the carrier is ready ──
 *
 * `carrierState` does, and the last step shows its answer verbatim. Two
 * opinions on "is this carrier ready" is what that module exists to prevent.
 */
export function CarrierWizard({
  open, carrier, available, onCreated, onClose, onConfigureLevels,
}: {
  open: boolean;
  /** The saved row, once there is one. Null on the very first step. */
  carrier: any | null;
  available: any[];
  onCreated: (id: string) => void;
  onClose: () => void;
  onConfigureLevels: () => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveOrgCarrier);

  const [step, setStep] = useState<WizardStep>("carrier");
  const [pickedId, setPickedId] = useState("");
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");

  const [details, setDetails] = useState<Record<string, string>>({});
  const [productTypes, setProductTypes] = useState<string[]>([]);
  const [maxAdvance, setMaxAdvance] = useState<AdvanceOption | "">("");
  const [defaultAdvance, setDefaultAdvance] = useState<AdvanceOption | "">("");

  // Seed the editable fields once per carrier, so a refetch flows into the
  // read-only parts of the dialog without touching what is being typed.
  const seedKey = carrier?.id ?? (open ? "new" : "closed");
  const [lastSeed, setLastSeed] = useState<string>(seedKey);
  if (seedKey !== lastSeed) {
    setLastSeed(seedKey);
    setDetails({
      contracting_email: carrier?.contracting_email ?? "",
      support_email: carrier?.support_email ?? "",
      turnaround_days: carrier?.turnaround_days ? String(carrier.turnaround_days) : "",
      internal_instructions: carrier?.internal_instructions ?? "",
    });
    setProductTypes(carrier?.product_types ?? []);
    setMaxAdvance((carrier?.max_advance_option as AdvanceOption) ?? "");
    setDefaultAdvance((carrier?.default_advance_option as AdvanceOption) ?? "");
  }

  const gridProducts = (carrier?.grid_products ?? []) as string[];
  const levelOptions = (carrier?.level_options ?? []) as any[];

  // Read off the saved record, never remembered. This is what makes closing the
  // dialog halfway harmless.
  const progress: WizardProgress = {
    carrierChosen: Boolean(carrier?.id),
    detailsEntered: Boolean(
      carrier?.contracting_email || carrier?.support_email ||
      carrier?.internal_instructions || (carrier?.product_types ?? []).length > 0 ||
      gridProducts.length > 0,
    ),
    gridRowCount: carrier?.grid_row_count ?? 0,
    levelCount: levelOptions.length,
    maxAdvance: (carrier?.max_advance_option ?? carrier?.default_advance_option) ?? null,
    hasContractingMethod: ((carrier?.org_carrier_methods ?? []) as any[]).length > 0,
    activated: carrier?.state?.status === "active",
  };
  const steps = wizardState(progress);
  const bar = wizardProgress(progress);

  const save = useMutation({
    mutationFn: (payload: any) => saveFn({ data: payload }),
    onSuccess: async (r: any, payload: any) => {
      await qc.invalidateQueries({ queryKey: ["contracting-ops"] });
      if (!payload.id && r?.id) {
        onCreated(r.id);
        toast.success("Carrier saved as a draft. Agents cannot see it until you activate it.");
      } else {
        toast.success("Saved");
      }
      const to = (payload.__then ?? null) as WizardStep | null;
      if (to) setStep(to);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the carrier"),
  });

  const clean = (v: string) => (v.trim() === "" ? null : v.trim());
  const advance = (to: WizardStep | null) => { if (to) setStep(to); else onClose(); };
  const after = (s: WizardStep): WizardStep | null => {
    const i = WIZARD_STEPS.indexOf(s);
    return i >= 0 && i < WIZARD_STEPS.length - 1 ? WIZARD_STEPS[i + 1] : null;
  };
  const before = (s: WizardStep): WizardStep | null => {
    const i = WIZARD_STEPS.indexOf(s);
    return i > 0 ? WIZARD_STEPS[i - 1] : null;
  };

  const state = carrier
    ? carrierState(toCarrierFacts(progress, {
        orgCarrierId: carrier.id,
        carrierName: carrier.name ?? "This carrier",
        configuration: carrier.state
          ? { configured: carrier.state.status !== "needs_grid_review", reasons: carrier.state.problems ?? [] }
          : { configured: true, reasons: [] },
        positionsOnFallback: [],
      }))
    : null;

  const library = available.filter((c) =>
    !search.trim() || String(c.name ?? "").toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-hidden p-0">
        <div className="grid md:grid-cols-[210px_1fr]">
          {/* The rail is the point of the flow: it says what is left, and it is
              clickable, because an owner with the advance terms to hand and not
              the grid should be able to enter them first. */}
          <aside className="hidden border-r border-border bg-surface-1 p-4 md:block">
            <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Step {WIZARD_STEPS.indexOf(step) + 1} of {WIZARD_STEPS.length}
            </p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${bar.pct}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {bar.done} of {bar.total} required steps done
            </p>
            <ol className="mt-4 space-y-1">
              {steps.map((s) => {
                const openable = canOpenStep(s.id, progress);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={!openable}
                      onClick={() => setStep(s.id)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                        s.id === step ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-2",
                        !openable && "opacity-40",
                      )}
                    >
                      {s.status === "done"
                        ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                        : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{s.title}</span>
                        {OPTIONAL_STEPS.includes(s.id) && s.status !== "done" && (
                          <span className="block text-[10px]">Optional</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>

          <div className="flex max-h-[92vh] min-w-0 flex-col">
            <DialogHeader className="border-b border-border px-5 py-4">
              <DialogTitle>{STEP_TITLE[step]}</DialogTitle>
              <DialogDescription>{STEP_PURPOSE[step]}</DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {step === "carrier" && (
                carrier ? (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{carrier.name}</span> is saved.
                    Carry on with its settings — the carrier itself cannot be swapped, but you can
                    remove it and add another.
                  </p>
                ) : (
                  <>
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search the carrier library"
                    />
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                      {library.length === 0 ? (
                        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                          Nothing in the library matches. Add it below instead.
                        </p>
                      ) : library.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setPickedId(c.id); setNewName(""); }}
                          className={cn(
                            "flex w-full items-center gap-3 border-b border-border-soft px-3 py-2 text-left last:border-0 transition-colors",
                            pickedId === c.id ? "bg-primary/10" : "hover:bg-surface-2",
                          )}
                        >
                          {c.logo_url
                            ? <img src={c.logo_url} alt="" className="h-7 w-7 rounded object-contain" />
                            : <span className="grid h-7 w-7 place-items-center rounded bg-primary/10 text-primary"><Building2 className="h-3.5 w-3.5" /></span>}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                            {(c.website || c.phone) && (
                              <span className="block truncate text-[11px] text-text-dim">{c.website ?? c.phone}</span>
                            )}
                          </span>
                          {pickedId === c.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </button>
                      ))}
                    </div>
                    <div>
                      <Label htmlFor="wizard-new-carrier">Or a carrier the library does not have</Label>
                      <Input
                        id="wizard-new-carrier"
                        value={newName}
                        onChange={(e) => { setNewName(e.target.value); if (e.target.value) setPickedId(""); }}
                        placeholder="Carrier name"
                        className="mt-1"
                      />
                      <p className="mt-1 text-[11px] text-text-dim">
                        Added for your agency only — it will not appear in anyone else's carrier list.
                      </p>
                    </div>
                  </>
                )
              )}

              {step === "details" && (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="w-contracting-email">Contracting email</Label>
                      <Input id="w-contracting-email" value={details.contracting_email ?? ""}
                             onChange={(e) => setDetails((d) => ({ ...d, contracting_email: e.target.value }))}
                             placeholder="contracting@carrier.com" className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="w-support-email">Support email</Label>
                      <Input id="w-support-email" value={details.support_email ?? ""}
                             onChange={(e) => setDetails((d) => ({ ...d, support_email: e.target.value }))}
                             className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="w-turnaround">Typical turnaround (days)</Label>
                      <Input id="w-turnaround" type="number" value={details.turnaround_days ?? ""}
                             onChange={(e) => setDetails((d) => ({ ...d, turnaround_days: e.target.value }))}
                             className="mt-1" />
                    </div>
                  </div>

                  {gridProducts.length > 0 ? (
                    <div>
                      <Label>Products this carrier writes</Label>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {gridProducts.map((t) => (
                          <span key={t} className="rounded-full border border-primary/50 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">{t}</span>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[11px] text-text-dim">
                        From the comp grid, which is where the rates live too. Edit the grid to change this list.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Label>Products this carrier writes</Label>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {Array.from(new Set([...PRODUCT_TYPES, ...productTypes])).map((t) => {
                          const on = productTypes.includes(t);
                          return (
                            <button key={t} type="button"
                              onClick={() => setProductTypes((cur) => cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t])}
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                                on ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground",
                              )}>
                              {t}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-[11px] text-text-dim">
                        Nothing selected means Post a Deal offers the full product list. Upload a comp
                        grid and its products replace this.
                      </p>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="w-instructions">Instructions for your staff</Label>
                    <textarea
                      id="w-instructions"
                      value={details.internal_instructions ?? ""}
                      onChange={(e) => setDetails((d) => ({ ...d, internal_instructions: e.target.value }))}
                      rows={3}
                      placeholder="Anything the person submitting this needs to know."
                      className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}

              {step === "grid" && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Upload the grid as a PDF, spreadsheet, or photographs of each page. Every rate is
                    reviewed before it is saved — nothing extracted is used until you confirm it. You
                    can skip this and add it later; until then, agents are paid their position
                    percentage on this carrier.
                  </p>
                  {carrier && <ManageGridsPage embedded initialCarrierId={carrier.carrier_id ?? undefined} />}
                </>
              )}

              {step === "levels" && (
                <div className="space-y-3">
                  {levelOptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No contract levels are recorded for {carrier?.name ?? "this carrier"} yet.
                      Uploading the comp grid names them for you, since a grid is written in the
                      carrier's own level vocabulary. Without them, every position pays its own
                      percentage here — which works, but not product or age specific rates.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {levelOptions.length} level{levelOptions.length === 1 ? "" : "s"} known for
                        this carrier. Map your positions onto them in Levels and Positions.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {levelOptions.map((l: any) => (
                          <span key={l.id} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-foreground">
                            {l.name ?? l.level_name}
                            {l.pct != null && <span className="ml-1 text-muted-foreground tnum">{l.pct}%</span>}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  <Button size="sm" variant="outline" onClick={onConfigureLevels}>
                    Open Levels and Positions
                  </Button>
                </div>
              )}

              {step === "advance" && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="w-max-advance">The most this carrier advances</Label>
                    <select
                      id="w-max-advance"
                      value={maxAdvance}
                      onChange={(e) => {
                        const v = e.target.value as AdvanceOption | "";
                        setMaxAdvance(v);
                        // A default above the new ceiling is no longer a choice
                        // the agency can make, so it clears rather than being
                        // saved and refused.
                        if (defaultAdvance && !advanceWithinCarrierMax(defaultAdvance, v || null)) {
                          setDefaultAdvance("");
                        }
                      }}
                      className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                    >
                      <option value="">Not chosen yet</option>
                      {ADVANCE_OPTIONS.map((o) => (
                        <option key={o} value={o}>{ADVANCE_LABELS[o]}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-text-dim">
                      A fact about the carrier, not a choice. Nothing is assumed on your behalf, and
                      a deal cannot say what it pays until this is set.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="w-default-advance">Your agency's default</Label>
                    <select
                      id="w-default-advance"
                      value={defaultAdvance}
                      disabled={!maxAdvance}
                      onChange={(e) => setDefaultAdvance(e.target.value as AdvanceOption | "")}
                      className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
                    >
                      <option value="">Not chosen yet</option>
                      {advanceOptionsUpTo(maxAdvance || null).map((o) => (
                        <option key={o} value={o}>{ADVANCE_LABELS[o as AdvanceOption]}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-text-dim">
                      {maxAdvance
                        ? "Capped at what the carrier allows. Staff can assign an individual agent less, never more."
                        : "Set the carrier maximum first — an agency default has nothing to sit inside until then."}
                    </p>
                  </div>
                </div>
              )}

              {step === "method" && (carrier
                ? <MethodsEditor carrier={carrier} />
                : <p className="text-sm text-muted-foreground">Choose a carrier first.</p>)}

              {step === "review" && state && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium text-foreground">{carrier?.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{state.label}</p>
                  </div>
                  {state.problems.length > 0 && (
                    <ul className="space-y-1.5">
                      {state.problems.map((p) => (
                        <li key={p} className="rounded-md border border-warning/40 bg-warning/[0.06] px-3 py-2 text-xs text-warning">
                          {p}
                        </li>
                      ))}
                    </ul>
                  )}
                  {progress.activated ? (
                    <p className="text-sm text-success">
                      Live. Agents can select {carrier?.name} on deals and contract requests.
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      disabled={!state.canActivate || save.isPending}
                      onClick={() => save.mutate({ id: carrier.id, status: "active", enabled: true })}
                    >
                      {save.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Activate {carrier?.name}
                    </Button>
                  )}
                </div>
              )}
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
              <Button
                size="sm"
                variant="ghost"
                disabled={!before(step)}
                onClick={() => advance(before(step))}
              >
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
              </Button>

              <div className="flex items-center gap-2">
                {OPTIONAL_STEPS.includes(step) && (
                  <Button size="sm" variant="ghost" onClick={() => advance(after(step))}>
                    Skip for now
                  </Button>
                )}
                {step === "review" ? (
                  <Button size="sm" variant="outline" onClick={onClose}>Done</Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={save.isPending || (step === "carrier" && !carrier && !pickedId && !newName.trim())}
                    onClick={() => {
                      const to = after(step);
                      if (step === "carrier" && !carrier) {
                        save.mutate({
                          carrier_id: pickedId || undefined,
                          new_carrier_name: pickedId ? undefined : newName.trim(),
                          // Saved switched off: a carrier appears to agents when
                          // its owner says so on the last step, not because it
                          // was created.
                          status: "paused",
                          enabled: false,
                          __then: to,
                        });
                        return;
                      }
                      if (step === "details" && carrier) {
                        save.mutate({
                          id: carrier.id,
                          contracting_email: clean(details.contracting_email ?? ""),
                          support_email: clean(details.support_email ?? ""),
                          turnaround_days: details.turnaround_days ? Number(details.turnaround_days) : null,
                          internal_instructions: clean(details.internal_instructions ?? ""),
                          product_types: productTypes,
                          __then: to,
                        });
                        return;
                      }
                      if (step === "advance" && carrier) {
                        save.mutate({
                          id: carrier.id,
                          max_advance_option: maxAdvance || null,
                          default_advance_option: defaultAdvance || null,
                          __then: to,
                        });
                        return;
                      }
                      advance(to);
                    }}
                  >
                    {save.isPending
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      : null}
                    {step === "carrier" && !carrier ? "Save and continue" : "Continue"}
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </footer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The step to open a saved carrier on: the first thing still missing. */
export function resumeStep(progress: WizardProgress): WizardStep {
  return nextStep(progress) ?? "review";
}
