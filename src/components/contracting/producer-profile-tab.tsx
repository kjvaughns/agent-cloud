import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { getContractingProfile, saveContractingProfile } from "@/lib/contracting-producer.functions";
import { cn } from "@/lib/utils";

/**
 * The contracting section of a producer profile.
 *
 * Everything here exists because a carrier asks for it and `profiles` has no
 * column for it: the legal name as it appears on a licence, and the address and
 * employment histories carriers want five to ten years of.
 */

type Entry = Record<string, string>;

function HistoryRows({
  entries, fields, onChange, addLabel, help,
}: {
  entries: Entry[];
  fields: { key: string; label: string; className?: string; type?: string }[];
  onChange: (next: Entry[]) => void;
  addLabel: string;
  help: string;
}) {
  const update = (i: number, key: string, value: string) =>
    onChange(entries.map((e, idx) => idx === i ? { ...e, [key]: value } : e));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{help}</p>
      {entries.map((entry, i) => (
        <div key={i} className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              {i === 0 ? "Most recent" : `Previous ${i}`}
            </span>
            <button
              onClick={() => onChange(entries.filter((_, idx) => idx !== i))}
              aria-label="Remove entry"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className={f.className}>
                <Label htmlFor={`${addLabel}-${i}-${f.key}`} className="text-xs">{f.label}</Label>
                <Input
                  id={`${addLabel}-${i}-${f.key}`}
                  type={f.type ?? "text"}
                  value={entry[f.key] ?? ""}
                  onChange={(e) => update(i, f.key, e.target.value)}
                  className="mt-1"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...entries, {}])}>
        <Plus className="mr-1.5 h-3.5 w-3.5" /> {addLabel}
      </Button>
    </div>
  );
}

export function ContractingProfileTab({ agentId }: { agentId?: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getContractingProfile);
  const saveFn = useServerFn(saveContractingProfile);

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-profile", agentId ?? "me"],
    queryFn: () => getFn({ data: agentId ? { agent_id: agentId } : {} }),
  });

  const [draft, setDraft] = useState<any | null>(null);

  const save = useMutation({
    mutationFn: (p: any) => saveFn({ data: p }),
    onSuccess: (r: any) => {
      toast.success(`Saved — contracting profile ${r.completeness}% complete`);
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["contracting-profile"] });
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });

  if (isLoading) return <Skeleton className="h-96 rounded-xl" />;

  const producer = data?.producer;
  const profile = data?.profile;

  // The draft falls back to the saved record, and the saved record falls back
  // to the display name — so an agent who has never opened this tab sees their
  // name already filled in rather than an empty form.
  const value = (k: string, fallback = "") =>
    (draft?.[k] ?? producer?.[k] ?? fallback) as string;

  const addresses: Entry[] = draft?.address_history ?? producer?.address_history ?? [];
  const employment: Entry[] = draft?.employment_history ?? producer?.employment_history ?? [];

  const set = (k: string, v: any) =>
    setDraft((d: any) => ({
      ...(d ?? {
        legal_first_name: producer?.legal_first_name ?? profile?.first_name ?? "",
        legal_middle_name: producer?.legal_middle_name ?? "",
        legal_last_name: producer?.legal_last_name ?? profile?.last_name ?? "",
        preferred_name: producer?.preferred_name ?? "",
        suffix: producer?.suffix ?? "",
        resident_state: producer?.resident_state ?? profile?.state ?? "",
        resident_license_number: producer?.resident_license_number ?? "",
        address_history: producer?.address_history ?? [],
        employment_history: producer?.employment_history ?? [],
        contracting_notes: producer?.contracting_notes ?? "",
      }),
      [k]: v,
    }));

  const completeness = data?.completeness ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contracting readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">
              How much of what carriers ask for is on file
            </span>
            <span className="tnum text-lg font-bold text-foreground">{completeness}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", completeness === 100 ? "bg-success" : "bg-primary")}
              style={{ width: `${completeness}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            This measures the fields a carrier contracting packet needs — not every field on your
            profile.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Legal name</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Carriers contract the name exactly as it appears on your licence, which is often not the
            name you go by.
          </p>
          {([
            ["legal_first_name", "Legal first name"],
            ["legal_middle_name", "Middle name"],
            ["legal_last_name", "Legal last name"],
            ["suffix", "Suffix"],
            ["preferred_name", "Preferred name"],
          ] as const).map(([k, label]) => (
            <div key={k}>
              <Label htmlFor={`cp-${k}`}>{label}</Label>
              <Input
                id={`cp-${k}`}
                value={value(k, k === "legal_first_name" ? (profile?.first_name ?? "")
                            : k === "legal_last_name" ? (profile?.last_name ?? "") : "")}
                onChange={(e) => set(k, e.target.value)}
                className="mt-1"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resident licence</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="cp-state">Resident state</Label>
            <Input
              id="cp-state" maxLength={2}
              value={value("resident_state", profile?.state ?? "")}
              onChange={(e) => set("resident_state", e.target.value.toUpperCase())}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cp-lic">Resident licence number</Label>
            <Input
              id="cp-lic"
              value={value("resident_license_number")}
              onChange={(e) => set("resident_license_number", e.target.value)}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Address history</CardTitle>
        </CardHeader>
        <CardContent>
          <HistoryRows
            entries={addresses}
            onChange={(next) => set("address_history", next)}
            addLabel="Add an address"
            help="Most carriers want five years, some ten. Start with where you live now and work backwards."
            fields={[
              { key: "from", label: "From", type: "month" },
              { key: "to", label: "To", type: "month" },
              { key: "line1", label: "Street", className: "sm:col-span-2" },
              { key: "city", label: "City" },
              { key: "state", label: "State" },
              { key: "zip", label: "ZIP" },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Employment history</CardTitle>
        </CardHeader>
        <CardContent>
          <HistoryRows
            entries={employment}
            onChange={(next) => set("employment_history", next)}
            addLabel="Add an employer"
            help="Include insurance and non-insurance roles. Gaps are normal — carriers ask about them rather than reject them."
            fields={[
              { key: "from", label: "From", type: "month" },
              { key: "to", label: "To", type: "month" },
              { key: "employer", label: "Employer" },
              { key: "title", label: "Title" },
              { key: "address", label: "Employer address", className: "sm:col-span-2" },
              { key: "supervisor", label: "Supervisor" },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Notes for contracting</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            value={value("contracting_notes")}
            onChange={(e) => set("contracting_notes", e.target.value)}
            placeholder="Anything the person submitting your contracts should know — a name change, a prior appointment, a gap to explain."
          />
        </CardContent>
      </Card>

      {draft && (
        <div className="sticky bottom-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-card p-3 shadow-lg">
          <span className="text-sm text-muted-foreground">Unsaved changes.</span>
          <span className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>Discard</Button>
            <Button
              size="sm"
              disabled={save.isPending}
              onClick={() => save.mutate({
                ...(agentId ? { agent_id: agentId } : {}),
                legal_first_name: draft.legal_first_name || null,
                legal_middle_name: draft.legal_middle_name || null,
                legal_last_name: draft.legal_last_name || null,
                preferred_name: draft.preferred_name || null,
                suffix: draft.suffix || null,
                resident_state: draft.resident_state || null,
                resident_license_number: draft.resident_license_number || null,
                address_history: draft.address_history ?? [],
                employment_history: draft.employment_history ?? [],
                contracting_notes: draft.contracting_notes || null,
              })}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
