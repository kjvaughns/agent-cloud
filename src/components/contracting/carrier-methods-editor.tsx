import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@/hooks/use-server-fn";
import { deleteOrgCarrierMethod, saveOrgCarrierMethod } from "@/lib/contracting-ops.functions";
import {
  CONTRACT_TYPES, CONTRACT_TYPE_LABELS, CONTRACTING_METHODS, METHOD_LABELS,
  type ContractType, type ContractingMethod,
} from "@/lib/contracting-ops/types";
import { cn } from "@/lib/utils";

// Its own module rather than a private function of the carrier dialog: the Add
// Carrier wizard asks the same question at step six, and a second copy of a
// form that writes org_carrier_methods is how two screens end up disagreeing
// about which method is the default.
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
export function MethodsEditor({ carrier }: { carrier: any }) {
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
