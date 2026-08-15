import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ManageGridsPage } from "@/components/contracting/manage-grids";
import {
  CARRIER_STATUSES, STATUS_LABEL, summarise, removalExplanation, removalMode,
  type CarrierStatus, type CarrierState,
} from "@/lib/carriers/status";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
// The advance vocabulary from the resolver, not a second copy of it.
import { ADVANCE_OPTIONS, ADVANCE_LABELS, type AdvanceOption } from "@/lib/compensation/resolve";
import { advanceOptionsUpTo, advanceWithinCarrierMax } from "@/lib/carriers/wizard";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useServerFn } from "@/hooks/use-server-fn";
import {
  listAvailableCarriers, listOrgCarriers, saveOrgCarrier,
  getCarrierUsage, removeOrgCarrier, restoreOrgCarrier,
} from "@/lib/contracting-ops.functions";
import {
  METHOD_LABELS, type ContractingMethod,
} from "@/lib/contracting-ops/types";
import { MethodsEditor } from "@/components/contracting/carrier-methods-editor";
import { CarrierWizard } from "@/components/contracting/carrier-wizard";
import { EmptyState } from "@/components/contracting/shared";
import { PRODUCT_TYPES } from "@/lib/products";
import { cn } from "@/lib/utils";

/**
 * The agency's carrier setup: which carriers it works with, how each takes
 * submissions, and the contact details staff need when preparing one.
 * Mounted by Settings ▸ Carriers; extracted from the old Carrier Setup tabs
 * page so the route and the component can live in different trees.
 */
/**
 * What this carrier still needs, in one pill.
 *
 * A working carrier shows a plain "Active" and nothing else. The problems only
 * render when there are problems: a row of reassuring badges teaches an owner
 * to stop reading them, which is exactly when the one that matters appears.
 */
function StatusPill({ state }: { state?: CarrierState }) {
  if (!state) return null;
  const tone =
    state.status === "active" ? "bg-success/15 text-success"
      : state.status === "ready_to_activate" ? "bg-primary/15 text-primary"
      : state.status === "archived" || state.status === "inactive" ? "bg-muted text-text-dim"
      : "bg-warning/15 text-warning";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", tone)}>
      {state.label}
    </span>
  );
}

/**
 * Delete or archive, decided by what is attached rather than by the owner.
 *
 * The counts are read before the dialog opens: somebody about to lose a
 * carrier's commission history is entitled to know that before they click, not
 * after. The server re-reads them and decides again, so a stale screen cannot
 * turn an archive into a delete.
 */
function RemoveCarrierDialog({
  carrier, onClose, onDone,
}: { carrier: any; onClose: () => void; onDone: () => void }) {
  const usageFn = useServerFn(getCarrierUsage);
  const removeFn = useServerFn(removeOrgCarrier);

  const { data: usage, isLoading } = useQuery({
    queryKey: ["carrier-usage", carrier.id],
    queryFn: () => usageFn({ data: { id: carrier.id } }),
  });

  const remove = useMutation({
    mutationFn: () => removeFn({ data: { id: carrier.id } }),
    onSuccess: (r: any) => {
      toast.success(r?.mode === "deleted" || r?.mode === "delete"
        ? `${carrier.name} deleted`
        : `${carrier.name} archived. Its history is intact.`);
      onDone();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove the carrier"),
  });

  const mode = usage ? removalMode(usage) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "delete" ? "Delete" : "Archive"} {carrier.name}?</DialogTitle>
        </DialogHeader>

        {isLoading || !usage ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : (
          <p className="text-sm text-muted-foreground">
            {removalExplanation(carrier.name, usage)}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            variant={mode === "delete" ? "destructive" : "default"}
            disabled={isLoading || remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? "Working…" : mode === "delete" ? "Delete permanently" : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One carrier, with everything the spec asks a row to show.
 *
 * A row rather than a card because the ten facts are the point: an owner
 * scanning fifteen carriers for the one that is missing an advance option
 * needs them in the same column each time, and a grid of cards puts every fact
 * in a different place on every card.
 */
function CarrierRow({
  carrier: c, first, canManage, onEdit, onRemove, onRestore, onEditGrid, onFinish, onToggle, toggling,
}: {
  carrier: any; first: boolean; canManage: boolean;
  onEdit: () => void; onRemove: () => void; onRestore: () => void; onEditGrid: () => void;
  onFinish: () => void; onToggle: (on: boolean) => void; toggling: boolean;
}) {
  const state = c.state as CarrierState | undefined;
  const isActive = state?.status === "active";
  const isArchived = state?.status === "archived";
  // Off and allowed on, or already on. Anything else has setup outstanding and
  // the switch says why instead of silently doing nothing.
  const mayToggle = isActive || Boolean(state?.canActivate);

  const methods = (c.org_carrier_methods ?? []) as any[];
  const advance = c.default_advance_option
    ? ADVANCE_LABELS[c.default_advance_option as AdvanceOption] ?? c.default_advance_option
    : null;

  return (
    <div className={cn("bg-surface-1 px-4 py-3", !first && "border-t border-border-soft")}>
      <div className="flex flex-wrap items-start gap-3">
        {c.logo_url ? (
          <img src={c.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-bold text-foreground">{c.name}</h3>
            <StatusPill state={state} />
            {c.is_private && <span className="text-[10px] text-text-dim">Private</span>}
          </div>

          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            <button
              type="button"
              onClick={onEditGrid}
              className="min-w-0 text-left transition-opacity hover:opacity-70"
            >
              <dt className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground">Products</dt>
              <dd className={cn("truncate text-xs font-medium underline decoration-dotted underline-offset-2",
                c.grid_row_count > 0 ? "text-foreground" : "text-warning")}>
                {c.grid_row_count > 0 ? `${c.product_count ?? 0} · edit grid` : "Add grid"}
              </dd>
            </button>
            <Fact label="Levels" value={String(c.comp_level_count ?? 0)} />
            <Fact label="Advance" value={advance ?? "Not set"} warn={!advance} />
            <Fact
              label="Contracting"
              value={methods.length
                ? methods.map((m) => METHOD_LABELS[m.method as ContractingMethod] ?? m.method).join(", ")
                : "Not set"}
              warn={methods.length === 0}
            />
            <Fact label="Open requests" value={String(c.open_requests ?? 0)} />
          </dl>

          {(state?.problems ?? []).length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {state!.problems.slice(0, 2).map((p) => (
                <li key={p} className="text-[11px] leading-snug text-warning">{p}</li>
              ))}
            </ul>
          )}
        </div>

        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            {isArchived ? (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRestore}>
                Restore
              </Button>
            ) : (
              <>
                {/* The way back into the guided flow. A carrier that cannot be
                    switched on has a named next step, and this opens the step
                    rather than leaving an owner to guess which field it was. */}
                {!isActive && !state?.canActivate && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onFinish}>
                    Finish setup
                  </Button>
                )}
                {/* Off until the setup can pay a deal. A switch that flips and
                    then does nothing is worse than one that explains itself. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={isActive}
                  aria-label={`${isActive ? "Switch off" : "Switch on"} ${c.name}`}
                  disabled={toggling}
                  onClick={() => {
                    if (!mayToggle) {
                      toast.error(
                        state?.problems[0]
                          ?? `${c.name} is not set up enough to switch on yet.`,
                      );
                      return;
                    }
                    onToggle(!isActive);
                  }}
                  className={cn(
                    "relative h-5 w-9 rounded-full transition-colors",
                    isActive ? "bg-success" : mayToggle ? "bg-surface-3" : "bg-surface-3 opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-card transition-transform",
                      isActive ? "translate-x-[1.125rem]" : "translate-x-0.5",
                    )}
                  />
                </button>
                <button
                  onClick={onEdit}
                  aria-label={`Edit ${c.name}`}
                  className="rounded p-1 text-text-dim transition-colors hover:text-foreground"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={onRemove}
                  aria-label={`Remove ${c.name}`}
                  className="rounded p-1 text-text-dim transition-colors hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className={cn("truncate text-xs font-medium", warn ? "text-warning" : "text-foreground")}>
        {value}
      </dd>
    </div>
  );
}

export function CarrierDirectoryPage({ onConfigureLevels }: { onConfigureLevels: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrgCarriers);
  const availableFn = useServerFn(listAvailableCarriers);
  const saveFn = useServerFn(saveOrgCarrier);

  // The guided flow. `"new"` before a carrier exists, then the saved id so the
  // dialog reads the live row and resumes on the first thing still missing.
  const [wizardId, setWizardId] = useState<string | null>(null);
  // Ids, not the carrier objects.
  //
  // These used to hold the row itself, captured when the button was clicked —
  // a snapshot frozen at that instant. Everything inside the dialog then read
  // that snapshot forever. Adding a submission method wrote the row, refetched
  // the list, and the panel underneath still said "None set", because it was
  // rendering the object from before the write. The save was real; the screen
  // was reporting a stale copy of the world.
  //
  // Holding the id and looking the carrier up in the query data means a
  // refetch flows straight into the open dialog. The form's own fields keep
  // their local state — seeded once per carrier — so a background refetch
  // still cannot overwrite something half-typed.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [gridForId, setGridForId] = useState<string | null>(null);
  const restoreFn = useServerFn(restoreOrgCarrier);
  // Active is the only status agents can see, so this switch is what makes a
  // carrier real to them. `carrierState.canActivate` decides whether it may be
  // turned on; the row explains the refusal rather than disabling silently.
  const toggle = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      saveFn({ data: { id, status: on ? "active" : "paused" } }),
    onSuccess: (_r, v) => {
      toast.success(v.on
        ? "Carrier is live. Agents can select it now."
        : "Carrier switched off. It stays saved and keeps its history.");
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not change the carrier"),
  });

  const restore = useMutation({
    mutationFn: (id: string) => restoreFn({ data: { id } }),
    onSuccess: () => {
      // Back as paused, not active: an owner reviews the setup and switches it
      // on, rather than having agents see it again the instant it is un-filed.
      toast.success("Carrier restored. Switch it on when its setup is ready.");
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not restore the carrier"),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "carriers"],
    queryFn: () => listFn(),
  });
  const { data: available } = useQuery({
    queryKey: ["contracting-ops", "carriers", "available"],
    queryFn: () => availableFn(),
    enabled: wizardId === "new",
  });

  const save = useMutation({
    mutationFn: (payload: any) => saveFn({ data: payload }),
    onSuccess: () => {
      toast.success("Carrier saved");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the carrier"),
  });

  const allCarriers = (data?.carriers ?? []) as any[];
  const canManage = data?.access?.canManageCarriers;

  // Resolved against the current query data on every render, so a save that
  // refetches is visible to whatever is open. A carrier that disappears while
  // a dialog is open — removed in another tab — resolves to null and the
  // dialog closes rather than editing something that is no longer there.
  const byId = (id: string | null) => (id ? allCarriers.find((c) => c.id === id) ?? null : null);
  const editing = byId(editingId);
  const removing = byId(removingId);
  const gridFor = byId(gridForId);

  // Search and filter. Both narrow the same list rather than replacing it, so
  // the counts above always describe the agency and not the current view — an
  // owner filtering to Draft should still see how many are live.
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | CarrierStatus>("all");

  const counts = summarise(allCarriers.map((c) => c.state as CarrierState).filter(Boolean));
  const q = query.trim().toLowerCase();
  const carriers = allCarriers.filter((c) => {
    if (q && !String(c.name ?? "").toLowerCase().includes(q)) return false;
    if (filter !== "all" && c.state?.status !== filter) return false;
    return true;
  });

  // Archived carriers are filed away, so they are out of the default view and
  // reachable through the filter. Hiding them with no way back would make a
  // restore impossible from the only screen that offers one.
  const visible = filter === "all"
    ? carriers.filter((c) => c.state?.status !== "archived")
    : carriers;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            Every carrier your agency writes with, and what each still needs.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{counts.active}</span> active
            {counts.needsSetup > 0 && (
              <>
                {" · "}
                <span className="font-medium text-warning">{counts.needsSetup}</span> need setup
              </>
            )}
          </p>
        </div>
        {canManage && (
          <Button size="sm" data-tour="carrier-add" onClick={() => setWizardId("new")}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add carrier
          </Button>
        )}
      </div>

      {allCarriers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search carriers"
            aria-label="Search carriers"
            className="h-8 min-w-[10rem] flex-1 rounded-md border border-border bg-surface-1 px-2.5 text-sm text-foreground placeholder:text-text-dim"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | CarrierStatus)}
            aria-label="Filter by status"
            className="h-8 rounded-md border border-border bg-surface-1 px-2 text-xs text-foreground"
          >
            <option value="all">All statuses</option>
            {CARRIER_STATUSES.map((st) => (
              <option key={st} value={st}>{STATUS_LABEL[st]}</option>
            ))}
          </select>
        </div>
      )}

      {/* The grid belongs to a carrier, so it opens from that carrier. It used
          to sit open underneath the whole list, which meant the tab showed
          every carrier and every rate at once and neither was findable. */}
      {gridFor && (
        <Dialog open onOpenChange={(o) => !o && setGridForId(null)}>
          <DialogContent className="max-h-[90vh] w-[96vw] max-w-6xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{gridFor.name} — compensation grid</DialogTitle>
              <DialogDescription>
                What this carrier pays, by level, product and age band. Every payout
                forecast reads these numbers.
              </DialogDescription>
            </DialogHeader>
            <ManageGridsPage embedded initialCarrierId={gridFor.carrier_id ?? undefined} />
          </DialogContent>
        </Dialog>
      )}

      {removing && (
        <RemoveCarrierDialog
          carrier={removing}
          onClose={() => setRemovingId(null)}
          onDone={() => qc.invalidateQueries({ queryKey: ["contracting-ops"] })}
        />
      )}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : allCarriers.length === 0 ? (
        <EmptyState
          title="No carriers yet"
          body="Add your first carrier to begin organizing contracting workflows. You can pick one from the shared catalog or add a carrier only your agency uses."
          action={canManage
            ? <Button size="sm" onClick={() => setWizardId("new")}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add your first carrier</Button>
            : undefined}
        />
      ) : (
        <div data-tour="carrier-list" className="overflow-hidden rounded-xl border border-border">
          {visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No carriers match that search or filter.
            </p>
          ) : (
            visible.map((c, i) => (
              <CarrierRow
                key={c.id}
                carrier={c}
                first={i === 0}
                canManage={Boolean(canManage)}
                onEdit={() => setEditingId(c.id)}
                onRemove={() => setRemovingId(c.id)}
                onEditGrid={() => setGridForId(c.id)}
                onFinish={() => setWizardId(c.id)}
                onRestore={() => restore.mutate(c.id)}
                onToggle={(on) => toggle.mutate({ id: c.id, on })}
                toggling={toggle.isPending}
              />
            ))
          )}
        </div>
      )}

      {/* Add and finish-setup both go through the seven-step flow; the gear
          stays a single form, because changing one field on a live carrier
          should not walk somebody through activation again. */}
      {wizardId && (
        <CarrierWizard
          open
          carrier={wizardId === "new" ? null : byId(wizardId)}
          available={(available?.carriers ?? []) as any[]}
          onCreated={(id) => setWizardId(id)}
          onClose={() => setWizardId(null)}
          onConfigureLevels={onConfigureLevels}
        />
      )}

      <CarrierDialog
        open={Boolean(editing)}
        carrier={editing}
        available={(available?.carriers ?? []) as any[]}
        pending={save.isPending}
        onClose={() => setEditingId(null)}
        onSave={(payload) => save.mutate(payload)}
      />
    </div>
  );
}

/**
 * One dialog for add and edit. The fields an agency actually needs on day one
 * are here; the long tail (age limits, release rules, custom statuses) lives
 * on the carrier's own settings page rather than in a wall of inputs that
 * makes adding a carrier feel like a tax return.
 */
function CarrierDialog({
  open, carrier, available, pending, onClose, onSave,
}: {
  open: boolean;
  carrier: any | null;
  available: any[];
  pending: boolean;
  onClose: () => void;
  onSave: (payload: any) => void;
}) {
  const editingExisting = Boolean(carrier);
  const [carrierId, setCarrierId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [advance, setAdvance] = useState<AdvanceOption | null>(null);
  // The ceiling the carrier itself permits. Separate from the agency default
  // because they are different facts, and the server refuses a default that
  // exceeds it — so the form has to be able to raise it.
  const [maxAdvance, setMaxAdvance] = useState<AdvanceOption | null>(null);
  const [publish, setPublish] = useState({
    visible_to_agents: true,
    available_for_post_deal: true,
  });
  // Array rather than a form field: this is a set, and the save schema has
  // always accepted it — the dialog simply never offered a way to change it,
  // so every carrier kept whatever product_types it was created with (none).
  const [productTypes, setProductTypes] = useState<string[]>([]);

  // Reset when the dialog opens on a different carrier.
  const key = carrier?.id ?? (open ? "new" : "closed");
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setCarrierId("");
    setNewName("");
    setForm({
      contracting_email: carrier?.contracting_email ?? "",
      support_email: carrier?.support_email ?? "",
      turnaround_days: carrier?.turnaround_days ? String(carrier.turnaround_days) : "",
      internal_instructions: carrier?.internal_instructions ?? "",
    });
    setProductTypes(carrier?.product_types ?? []);
    // `?? null` on the advance, `!== false` on the booleans: absent means
    // "never chosen" for one and "on, as it always has been" for the others.
    setAdvance((carrier?.default_advance_option as AdvanceOption | null) ?? null);
    setMaxAdvance((carrier?.max_advance_option as AdvanceOption | null)
      ?? (carrier?.default_advance_option as AdvanceOption | null) ?? null);
    setPublish({
      visible_to_agents: carrier?.visible_to_agents !== false,
      available_for_post_deal: carrier?.available_for_post_deal !== false,
    });
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // The shared list, plus anything already on this carrier that is not in it.
  // A product type set by an import or by hand must not vanish because the
  // canonical list does not happen to name it.
  const productOptions = Array.from(new Set([...PRODUCT_TYPES, ...productTypes]));

  // The grid's own product names, shipped with the carrier. Non-empty means
  // the grid is the source and the checkbox list below is not offered.
  const gridProducts = (carrier?.grid_products ?? []) as string[];

  const submit = () => {
    // Empty strings must become null, not "", or the url/email validators
    // reject a field the user deliberately left blank.
    const clean = (v: string) => (v.trim() === "" ? null : v.trim());
    onSave({
      id: carrier?.id,
      carrier_id: editingExisting ? undefined : (carrierId || undefined),
      new_carrier_name: editingExisting ? undefined : (newName.trim() || undefined),
      status: carrier?.status ?? "active",
      // The URL fields are gone from this dialog on purpose — gateways live in
      // Submission methods below, one row per method, rather than as loose
      // columns here. Omitting them (not nulling them) leaves any legacy
      // values in place until the backfill migration moves them over.
      contracting_email: clean(form.contracting_email ?? ""),
      support_email: clean(form.support_email ?? ""),
      turnaround_days: form.turnaround_days ? Number(form.turnaround_days) : null,
      internal_instructions: clean(form.internal_instructions ?? ""),
      product_types: productTypes,
      writing_number_scope: carrier?.writing_number_scope ?? "national",
      just_in_time_appointments: carrier?.just_in_time_appointments ?? false,
      transfers_allowed: carrier?.transfers_allowed ?? true,
      release_required: carrier?.release_required ?? false,
      // The five the resolver reads. They were stripped by the schema until
      // now, so an advance option could not be chosen and a carrier could not
      // be published — while the resolver refused to guess either, leaving
      // every contract marked "Comp not set up" with no control that could
      // clear it.
      max_advance_option: maxAdvance,
      default_advance_option: advance,
      visible_to_agents: publish.visible_to_agents,
      available_for_post_deal: publish.available_for_post_deal,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingExisting ? `Edit ${carrier?.name}` : "Add a carrier"}</DialogTitle>
          <DialogDescription>
            {editingExisting
              ? "Contracting details your staff need when preparing a submission."
              : "Pick a carrier from the shared catalog, or add one only your agency uses."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!editingExisting && (
            <>
              <div>
                <Label htmlFor="carrier-pick">Carrier</Label>
                <select
                  id="carrier-pick"
                  value={carrierId}
                  onChange={(e) => { setCarrierId(e.target.value); if (e.target.value) setNewName(""); }}
                  className={cn(
                    "mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                  )}
                >
                  <option value="">Select a carrier…</option>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="carrier-new">Or add a carrier we don't list</Label>
                <Input
                  id="carrier-new"
                  value={newName}
                  onChange={(e) => { setNewName(e.target.value); if (e.target.value) setCarrierId(""); }}
                  placeholder="Carrier name"
                  className="mt-1"
                />
                <p className="mt-1 text-[11px] text-text-dim">
                  Added carriers are private to your agency.
                </p>
              </div>
            </>
          )}

          {/* SureLC and portal URLs used to be two loose fields here, beside a
              Submission methods editor holding the same facts — two stores for
              one answer, and the packet had to guess which one to trust.
              Methods are the one store now; these fields are contact info. */}
          {([
            ["contracting_email", "Contracting email", "contracting@carrier.com"],
            ["support_email", "Support email", "support@carrier.com"],
            ["turnaround_days", "Typical turnaround (days)", "7"],
          ] as const).map(([k, label, placeholder]) => (
            <div key={k}>
              <Label htmlFor={k}>{label}</Label>
              <Input
                id={k}
                value={form[k] ?? ""}
                onChange={(e) => set(k, e.target.value)}
                placeholder={placeholder}
                inputMode={k === "turnaround_days" ? "numeric" : undefined}
                className="mt-1"
              />
            </div>
          ))}

          <div>
            <Label htmlFor="max-advance-option">The most this carrier advances</Label>
            <select
              id="max-advance-option"
              value={maxAdvance ?? ""}
              onChange={(e) => {
                const v = (e.target.value || null) as AdvanceOption | null;
                setMaxAdvance(v);
                if (advance && !advanceWithinCarrierMax(advance, v)) setAdvance(null);
              }}
              className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="">Not chosen yet</option>
              {ADVANCE_OPTIONS.map((o) => (
                <option key={o} value={o}>{ADVANCE_LABELS[o]}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-text-dim">
              A fact about the carrier. Your own default sits inside it, and staff can assign an
              individual agent less — never more.
            </p>
          </div>

          <div>
            <Label htmlFor="advance-option">Your agency's default advance</Label>
            <select
              id="advance-option"
              value={advance ?? ""}
              onChange={(e) => setAdvance((e.target.value || null) as AdvanceOption | null)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
            >
              {/* "Not chosen" is a real option and the default, because
                  guessing an agency's advance terms is the silent default the
                  compensation rewrite exists to remove. */}
              <option value="">Not chosen yet</option>
              {advanceOptionsUpTo(maxAdvance).map((o) => (
                <option key={o} value={o}>{ADVANCE_LABELS[o as AdvanceOption]}</option>
              ))}
            </select>
            {!advance && (
              <p className="mt-1 text-[11px] text-warning">
                Until this is chosen, a deal on this carrier cannot work out what to advance.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Published to agents</Label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={publish.visible_to_agents}
                onCheckedChange={(v) => setPublish((p) => ({ ...p, visible_to_agents: v }))}
              />
              <span className="text-muted-foreground">Agents can see this carrier</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={publish.available_for_post_deal}
                onCheckedChange={(v) => setPublish((p) => ({ ...p, available_for_post_deal: v }))}
              />
              <span className="text-muted-foreground">Agents can post deals against it</span>
            </label>
          </div>

          {/* Products, asked for only when nothing else knows them.
             *
             * The comp grid is a list of this carrier's products with a rate
             * against each, so a gridded carrier has already said what it
             * writes — and Post a Deal reads the grid, falling back to
             * `product_types` only when there is no grid at all. Asking an
             * owner to tick the same products a second time was asking for a
             * fact we hold, into a field that then changed nothing.
             *
             * So: show the grid's own names when there is a grid, and offer
             * the checkboxes only when there is not. */}
          {gridProducts.length > 0 ? (
            <div>
              <Label>Products this carrier writes</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {gridProducts.map((t: string) => (
                  <span
                    key={t}
                    className="rounded-full border border-primary/50 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-text-dim">
                From {carrier?.name ?? "this carrier"}'s comp grid, which is where the
                rates live too. Edit the grid to change this list — there is nothing to
                set here.
              </p>
            </div>
          ) : (
            <div>
              <Label>Products this carrier writes</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {productOptions.map((t) => {
                  const on = productTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setProductTypes((cur) =>
                        cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t])}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        on ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground",
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-text-dim">
                {productTypes.length === 0
                  ? "Nothing selected, so Post a Deal offers the full product list for this carrier."
                  : `Post a Deal will offer only these ${productTypes.length} for ${carrier?.name ?? "this carrier"}.`}
                {" "}Upload a comp grid and its products replace this list.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="internal_instructions">Instructions for your staff</Label>
            <textarea
              id="internal_instructions"
              value={form.internal_instructions ?? ""}
              onChange={(e) => set("internal_instructions", e.target.value)}
              rows={3}
              placeholder="Anything the person submitting this needs to know."
              className={cn(
                "mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
              )}
            />
          </div>

          {/* Only once the carrier exists — a submission method hangs off an
              org_carrier_id, and there is not one to hang off until it is
              saved. Adding a carrier then reopening it is one extra click, and
              the alternative is holding unsaved methods in memory and writing
              them after the insert, which fails halfway in a way nobody sees. */}
          {editingExisting && <MethodsEditor carrier={carrier} />}
          {!editingExisting && (
            <p className="text-[11px] text-text-dim">
              Where submissions actually go — SureLC, a carrier portal, an invitation link — is
              configured under Submission methods, which appears once the carrier is saved.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={pending || (!editingExisting && !carrierId && !newName.trim())}
          >
            {pending ? "Saving…" : editingExisting ? "Save changes" : "Add carrier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
