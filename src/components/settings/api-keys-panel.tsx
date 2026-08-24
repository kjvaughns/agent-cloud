/**
 * Issuing a key so somebody outside the agency can read its numbers.
 *
 * The screen exists for one sentence an owner said: "my upline wants our
 * team's sales numbers on his website". So it leads with the thing they have
 * to hand over — the key — and with the one fact about it that cannot be
 * undone, which is that it is shown once.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Loader2, Plus, ShieldOff } from "lucide-react";

import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { listApiKeys, createApiKey, revokeApiKey } from "@/lib/api-keys.functions";
import { SCOPE_LABEL, type ApiScope } from "@/lib/api/keys";

function when(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function ApiKeysPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listApiKeys);
  const { data, isLoading } = useQuery({ queryKey: ["api-keys"], queryFn: () => listFn() });

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(["production:read"]);
  const [issued, setIssued] = useState<string | null>(null);

  const createFn = useServerFn(createApiKey);
  const create = useMutation({
    mutationFn: () => createFn({ data: { name: name.trim(), scopes } }),
    onSuccess: (res: any) => {
      // Held in component state rather than refetched, because this is the
      // only moment the key exists anywhere outside the database's hash of it.
      setIssued(res.key);
      setName("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create the key"),
  });

  const revokeFn = useServerFn(revokeApiKey);
  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Key revoked — it stops working immediately");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not revoke the key"),
  });

  if (isLoading) return <Panel title="API access"><p className="text-sm text-muted-foreground">Loading…</p></Panel>;

  if (!data?.isOwner) {
    return (
      <Panel title="API access">
        <p className="text-sm text-muted-foreground">
          Your agency owner manages API keys. They can issue one under
          Settings ▸ Agency ▸ Integrations.
        </p>
      </Panel>
    );
  }

  const keys = data.keys ?? [];

  return (
    <Panel title="API access">
      <p className="text-sm text-muted-foreground">
        Issue a read-only key so somebody outside your agency — an upline, or your own
        site — can pull your production figures. They do not need an Agent Cloud login;
        the key is the access.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        A key reads <span className="text-foreground">numbers only</span>: premium, policy
        counts and placed premium. Client names, policy numbers and face amounts are never
        available through the API, under any key.
      </p>

      {/* ── The key, once ── */}
      {issued && (
        <div className="mt-4 rounded-[var(--radius)] border border-warning/40 bg-warning/5 p-4">
          <p className="text-sm font-medium text-foreground">Copy this key now</p>
          <p className="mt-1 text-xs text-muted-foreground">
            It is stored only as a hash, so this is the one time it can be shown. If it is
            lost, revoke it and issue another.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-surface-2 px-3 py-2 text-xs">{issued}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(issued).then(
                  () => toast.success("Copied"),
                  () => toast.error("Could not copy — select the key and copy it by hand"),
                );
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs" onClick={() => setIssued(null)}>
            I have saved it
          </Button>
        </div>
      )}

      {/* ── Issue ── */}
      <div className="mt-4 rounded-[var(--radius)] border border-border bg-surface-2 p-4">
        <Label className="text-xs">What is this key for?</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Marcus's website"
          className="mt-1.5"
          maxLength={80}
        />
        <div className="mt-3 space-y-2">
          {(data.scopes ?? []).map((s) => (
            <label key={s} className="flex items-start gap-2 text-xs">
              <Checkbox
                checked={scopes.includes(s as ApiScope)}
                // production:read is what every key needs to be useful at all,
                // so it is fixed rather than offered as a way to make a key
                // that can read nothing.
                disabled={s === "production:read"}
                onCheckedChange={(c) =>
                  setScopes((prev) =>
                    c ? [...new Set([...prev, s as ApiScope])] : prev.filter((x) => x !== s),
                  )
                }
              />
              <span className="text-muted-foreground leading-relaxed">
                {SCOPE_LABEL[s as ApiScope] ?? s}
              </span>
            </label>
          ))}
        </div>
        <Button
          size="sm"
          className="mt-3 gap-1.5"
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Create key
        </Button>
      </div>

      {/* ── What has been handed out ── */}
      {keys.length > 0 && (
        <div className="mt-4 space-y-2">
          {keys.map((k: any) => (
            <div
              key={k.id}
              className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{k.name}</span>
                  {k.revoked_at ? (
                    <Badge variant="outline" className="text-muted-foreground">Revoked</Badge>
                  ) : (
                    <Badge variant="outline" className="border-success/40 text-success">Active</Badge>
                  )}
                </div>
                <code className="text-[11px] text-muted-foreground">{k.masked}</code>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Created {when(k.created_at)} · last used {when(k.last_used_at)}
                  {k.calls.ok + k.calls.refused > 0 && (
                    <> · {k.calls.ok} calls in 30 days
                      {k.calls.refused > 0 && (
                        <span className="text-warning"> · {k.calls.refused} refused</span>
                      )}
                    </>
                  )}
                </p>
              </div>
              {!k.revoked_at && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(k.id)}
                >
                  <ShieldOff className="h-3.5 w-3.5" /> Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── How to call it ── */}
      <div className="mt-4 rounded-[var(--radius)] border border-border bg-surface-2 p-4">
        <p className="text-xs font-medium text-foreground">Using it</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Every call sends the key as <code>Authorization: Bearer …</code>. Leave the dates
          off and each endpoint uses a sensible default window.
        </p>

        {EXAMPLES.map((ex) => {
          const snippet = `curl -H "Authorization: Bearer ${issued ?? "YOUR_KEY"}" \\\n  "${origin()}${ex.path}"`;
          return (
            <div key={ex.path} className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-foreground">{ex.title}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-2 text-[11px]"
                  onClick={() => copy(snippet)}
                >
                  <Copy className="h-3 w-3" /> Copy
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{ex.detail}</p>
              <pre className="mt-1.5 overflow-x-auto rounded bg-background p-3 text-[11px] leading-relaxed">{snippet}</pre>
            </div>
          );
        })}
      </div>

      {/* ── Prove it works before handing it over ── */}
      <div className="mt-4 rounded-[var(--radius)] border border-border p-4">
        <p className="text-xs font-medium text-foreground">Test a key</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Paste a key to check it is accepted and see exactly what it can read. Nothing is
          stored — the check runs from this browser.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            value={probe}
            onChange={(e) => setProbe(e.target.value)}
            placeholder="ac_live_…"
            className="max-w-xs font-mono text-xs"
          />
          <Button size="sm" variant="outline" disabled={!probe.trim() || testing} onClick={runTest}>
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Test"}
          </Button>
        </div>
        {result && (
          <pre
            className={`mt-2 overflow-x-auto rounded bg-surface-2 p-3 text-[11px] leading-relaxed ${
              result.ok ? "text-success" : "text-warning"
            }`}
          >{result.text}</pre>
        )}
      </div>

    </Panel>
  );
}
