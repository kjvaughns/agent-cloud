import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ExternalLink, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useServerFn } from "@/hooks/use-server-fn";
import {
  deleteOrgCarrierMethod, listAvailableCarriers, listOrgCarriers,
  saveOrgCarrier, saveOrgCarrierMethod,
} from "@/lib/contracting-ops.functions";
import {
  CONTRACT_TYPES, CONTRACT_TYPE_LABELS, CONTRACTING_METHODS, METHOD_LABELS,
  type ContractType, type ContractingMethod,
} from "@/lib/contracting-ops/types";
import { EmptyState } from "@/components/contracting/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LevelsPanel } from "@/components/contracting/levels-panel";
import { ManageGridsPage } from "@/routes/_authenticated/contracting.comp-grids-manage";
import { cn } from "@/lib/utils";

const TABS = ["carriers", "levels", "grids"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_authenticated/contracting-ops/carriers")({
  component: CarriersPage,
  head: () => ({ meta: [{ title: "Carriers | Agent Cloud" }] }),
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(s.tab as Tab) ? { tab: s.tab as Tab } : {},
});

/**
 * One page for carriers and what they pay.
 *
 * "Compensation" was a separate sidebar entry holding the levels and grids
 * for the carriers set up here — so adding a carrier and telling the app what
 * it pays were two destinations, and neither name said which held what.
 * Setting a carrier up and building its grid is one job.
 */
function CarriersPage() {
  const { tab } = Route.useSearch();
  const [active, setActive] = useState<Tab>(tab ?? "carriers");

  return (
    <Tabs value={active} onValueChange={(v) => setActive(v as Tab)} className="space-y-4">
      <TabsList>
        <TabsTrigger value="carriers">Carriers</TabsTrigger>
        <TabsTrigger value="levels">Levels</TabsTrigger>
        <TabsTrigger value="grids">Comp grids</TabsTrigger>
      </TabsList>
      <TabsContent value="carriers"><CarrierDirectoryPage onBuildGrid={() => setActive("grids")} /></TabsContent>
      <TabsContent value="levels"><LevelsPanel /></TabsContent>
      <TabsContent value="grids"><ManageGridsPage embedded /></TabsContent>
    </Tabs>
  );
}

function CarrierDirectoryPage({ onBuildGrid }: { onBuildGrid: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrgCarriers);
  const availableFn = useServerFn(listAvailableCarriers);
  const saveFn = useServerFn(saveOrgCarrier);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "carriers"],
    queryFn: () => listFn(),
  });
  const { data: available } = useQuery({
    queryKey: ["contracting-ops", "carriers", "available"],
    queryFn: () => availableFn(),
    enabled: adding,
  });

  const save = useMutation({
    mutationFn: (payload: any) => saveFn({ data: payload }),
    onSuccess: () => {
      toast.success("Carrier saved");
      setAdding(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the carrier"),
  });

  const carriers = (data?.carriers ?? []) as any[];
  const canManage = data?.access?.canManageCarriers;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Every carrier your agency contracts with, and how each one takes submissions.
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add carrier
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : carriers.length === 0 ? (
        <EmptyState
          title="No carriers yet"
          body="Add your first carrier to begin organizing contracting workflows. You can pick one from the shared catalog or add a carrier only your agency uses."
          action={canManage
            ? <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add your first carrier</Button>
            : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {carriers.map((c) => (
            <Panel key={c.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-foreground">{c.name}</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {c.status === "active" ? "Active" : c.status.replace(/_/g, " ")}
                    {c.is_private && " · Private to your agency"}
                  </p>
                </div>
                {canManage && (
                  <button
                    onClick={() => setEditing(c)}
                    aria-label={`Edit ${c.name}`}
                    className="rounded p-1 text-text-dim transition-colors hover:text-foreground"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(c.org_carrier_methods ?? []).length === 0 ? (
                  canManage ? (
                    <button
                      onClick={() => setEditing(c)}
                      className="rounded-full border border-dashed border-warning/40 px-2 py-0.5 text-[10px] text-warning transition-colors hover:border-warning"
                    >
                      Set a submission method
                    </button>
                  ) : (
                    // Naming the problem without a way to solve it, to somebody
                    // who cannot solve it, is just a complaint. Say who can.
                    <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-text-dim">
                      No submission method set — ask an admin
                    </span>
                  )
                ) : (
                  (c.org_carrier_methods ?? []).map((m: any) => (
                    <span
                      key={m.id}
                      className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      {METHOD_LABELS[m.method as ContractingMethod] ?? m.method}
                    </span>
                  ))
                )}
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border-soft pt-3">
                {[
                  ["Requirements", c.requirement_count],
                  ["Comp levels", c.comp_level_count],
                  ["Open", c.open_requests],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
                    <dd className="tnum mt-0.5 text-sm font-bold text-foreground">{String(value)}</dd>
                  </div>
                ))}
              </dl>

              {(c.contracting_portal_url || c.surelc_url) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.surelc_url && (
                    <a href={c.surelc_url} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> SureLC
                    </a>
                  )}
                  {c.contracting_portal_url && (
                    <a href={c.contracting_portal_url} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> Portal
                    </a>
                  )}
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}

      <CarrierDialog
        open={adding || Boolean(editing)}
        carrier={editing}
        available={(available?.carriers ?? []) as any[]}
        pending={save.isPending}
        onClose={() => { setAdding(false); setEditing(null); }}
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

  // Reset when the dialog opens on a different carrier.
  const key = carrier?.id ?? (open ? "new" : "closed");
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setCarrierId("");
    setNewName("");
    setForm({
      contracting_portal_url: carrier?.contracting_portal_url ?? "",
      surelc_url: carrier?.surelc_url ?? "",
      contracting_email: carrier?.contracting_email ?? "",
      support_email: carrier?.support_email ?? "",
      turnaround_days: carrier?.turnaround_days ? String(carrier.turnaround_days) : "",
      internal_instructions: carrier?.internal_instructions ?? "",
    });
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    // Empty strings must become null, not "", or the url/email validators
    // reject a field the user deliberately left blank.
    const clean = (v: string) => (v.trim() === "" ? null : v.trim());
    onSave({
      id: carrier?.id,
      carrier_id: editingExisting ? undefined : (carrierId || undefined),
      new_carrier_name: editingExisting ? undefined : (newName.trim() || undefined),
      status: carrier?.status ?? "active",
      contracting_portal_url: clean(form.contracting_portal_url ?? ""),
      surelc_url: clean(form.surelc_url ?? ""),
      contracting_email: clean(form.contracting_email ?? ""),
      support_email: clean(form.support_email ?? ""),
      turnaround_days: form.turnaround_days ? Number(form.turnaround_days) : null,
      internal_instructions: clean(form.internal_instructions ?? ""),
      product_types: carrier?.product_types ?? [],
      writing_number_scope: carrier?.writing_number_scope ?? "national",
      just_in_time_appointments: carrier?.just_in_time_appointments ?? false,
      transfers_allowed: carrier?.transfers_allowed ?? true,
      release_required: carrier?.release_required ?? false,
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

          {([
            ["surelc_url", "SureLC link", "https://…"],
            ["contracting_portal_url", "Carrier portal", "https://…"],
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

/**
 * How this carrier takes submissions.
 *
 * The card outside this dialog has been reporting "No submission method set"
 * since `org_carrier_methods` was created, and there was no way to set one —
 * the table had a vocabulary, a write policy and a one-default index, and the
 * application only ever read from it. This is the missing half.
 *
 * More than one is normal, which is why this is a list rather than a field:
 * SureLC for a new contract, email for a hierarchy change. `applies_to` says
 * which kinds of work a method covers, and leaving it empty means all of them.
 */
function MethodsEditor({ carrier }: { carrier: any }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveOrgCarrierMethod);
  const deleteFn = useServerFn(deleteOrgCarrierMethod);
  const [draft, setDraft] = useState<any | null>(null);

  const methods = ((carrier?.org_carrier_methods ?? []) as any[])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const invalidate = () => qc.invalidateQueries({ queryKey: ["contracting-ops", "carriers"] });

  const save = useMutation({
    mutationFn: (p: any) => saveFn({ data: p }),
    onSuccess: () => { toast.success("Submission method saved"); setDraft(null); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the submission method"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Submission method removed"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove the submission method"),
  });

  const blank = {
    org_carrier_id: carrier.id,
    method: "surelc" as ContractingMethod,
    applies_to: [] as string[],
    target_url: "",
    target_email: "",
    instructions: "",
    is_default: methods.length === 0,
    sort_order: methods.length,
  };

  const setDraftField = (k: string, v: any) => setDraft((d: any) => ({ ...d, [k]: v }));

  const toggleApplies = (t: string) =>
    setDraft((d: any) => ({
      ...d,
      applies_to: d.applies_to.includes(t)
        ? d.applies_to.filter((x: string) => x !== t)
        : [...d.applies_to, t],
    }));

  return (
    <section className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Submission methods
        </h3>
        {!draft && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDraft(blank)}>
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        )}
      </div>

      {methods.length === 0 && !draft && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          None set. Staff preparing a submission fall back to the portal or contracting email above,
          which may not be how this carrier wants to receive paperwork.
        </p>
      )}

      {methods.length > 0 && (
        <ul className="mt-2 divide-y divide-border-soft rounded-md border border-border">
          {methods.map((m) => (
            <li key={m.id} className="flex items-center gap-2 px-2.5 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">
                  {METHOD_LABELS[m.method as ContractingMethod] ?? m.method}
                  {m.is_default && <span className="ml-1.5 text-[10px] font-normal text-primary">Default</span>}
                </span>
                <span className="block truncate text-[10px] text-text-dim">
                  {m.target_url || m.target_email || "No destination recorded"}
                  {" · "}
                  {(m.applies_to ?? []).length === 0
                    ? "All work"
                    : (m.applies_to as string[])
                        .map((t) => CONTRACT_TYPE_LABELS[t as ContractType] ?? t).join(", ")}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setDraft({ ...m, target_url: m.target_url ?? "", target_email: m.target_email ?? "", instructions: m.instructions ?? "", applies_to: m.applies_to ?? [] })}
                className="shrink-0 rounded p-1 text-text-dim transition-colors hover:text-foreground"
                aria-label={`Edit ${METHOD_LABELS[m.method as ContractingMethod] ?? m.method}`}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove.mutate(m.id)}
                disabled={remove.isPending}
                className="shrink-0 rounded p-1 text-text-dim transition-colors hover:text-destructive"
                aria-label={`Remove ${METHOD_LABELS[m.method as ContractingMethod] ?? m.method}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <div className="mt-3 space-y-2 rounded-md border border-primary/30 bg-primary/[0.03] p-2.5">
          <div>
            <Label htmlFor="method-kind">Method</Label>
            <select
              id="method-kind"
              value={draft.method}
              onChange={(e) => setDraftField("method", e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              {CONTRACTING_METHODS.map((m) => (
                <option key={m} value={m}>{METHOD_LABELS[m]}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="method-url">Link</Label>
              <Input id="method-url" value={draft.target_url}
                     onChange={(e) => setDraftField("target_url", e.target.value)}
                     placeholder="https://…" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="method-email">Email</Label>
              <Input id="method-email" value={draft.target_email}
                     onChange={(e) => setDraftField("target_email", e.target.value)}
                     placeholder="contracting@carrier.com" className="mt-1" />
            </div>
          </div>

          <div>
            <Label>Applies to</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {CONTRACT_TYPES.map((t) => {
                const on = draft.applies_to.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleApplies(t)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                      on ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground",
                    )}
                  >
                    {CONTRACT_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-text-dim">
              {draft.applies_to.length === 0 ? "Nothing selected means every kind of work." : ""}
            </p>
          </div>

          <div>
            <Label htmlFor="method-instructions">Instructions</Label>
            <textarea
              id="method-instructions"
              value={draft.instructions}
              onChange={(e) => setDraftField("instructions", e.target.value)}
              rows={2}
              placeholder="What the person submitting through this needs to know."
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={Boolean(draft.is_default)}
              onChange={(e) => setDraftField("is_default", e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--gold)]"
            />
            Use this by default. Replaces whichever method is default now.
          </label>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              disabled={save.isPending}
              onClick={() => save.mutate({
                id: draft.id,
                org_carrier_id: carrier.id,
                method: draft.method,
                applies_to: draft.applies_to,
                // Same reason as the carrier form: "" fails the url and email
                // validators for a field somebody deliberately left blank.
                target_url: draft.target_url.trim() || null,
                target_email: draft.target_email.trim() || null,
                instructions: draft.instructions.trim() || null,
                is_default: Boolean(draft.is_default),
                sort_order: draft.sort_order ?? methods.length,
              })}
            >
              {save.isPending ? "Saving…" : draft.id ? "Save method" : "Add method"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
}
