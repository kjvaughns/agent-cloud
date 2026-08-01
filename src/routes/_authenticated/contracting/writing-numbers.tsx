import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { listMyContracts } from "@/lib/contracting.functions";
import { ScopeToggle } from "@/components/scope-toggle";
import { useScope } from "@/hooks/use-scope";
import { SCOPES, type Scope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/contracting/writing-numbers")({
  validateSearch: (s: Record<string, unknown>): { scope?: Scope } => ({
    scope: SCOPES.includes(s.scope as Scope) ? (s.scope as Scope) : undefined,
  }),
  component: MyWritingNumbersPage,
  head: () => ({
    meta: [
      { title: "Writing Numbers — Agent Cloud" },
      { name: "description", content: "Your carrier writing numbers, in one list." },
    ],
  }),
});

/**
 * The number a carrier knows you by.
 *
 * There was already a writing-numbers page, but it is agency machinery — the
 * whole roster, gated to owners and back-office staff. An agent looking up
 * their own number before a call had nowhere to go and no way to know the
 * number existed. This is the same field, for the person it belongs to.
 *
 * Read-only on purpose: a writing number is issued by the carrier, so there is
 * nothing here anybody should be typing.
 */
function MyWritingNumbersPage() {
  const fn = useServerFn(listMyContracts);
  const { scope, ready } = useScope();
  const { data, isLoading } = useQuery({
    enabled: ready,
    queryKey: ["contracting", "myContracts", scope],
    queryFn: () => fn({ data: { scope } }),
  });

  const rows = (data?.rows ?? []).filter((r: any) => r.writing_number);
  const waiting = (data?.rows ?? []).filter((r: any) => !r.writing_number).length;

  return (
    <PageShell>
      <div className="flex flex-col gap-[var(--gap)]">
        <HeroBand
          title="Writing Numbers"
          subtitle="What each carrier calls you. Issued by them, so this page only shows."
          actions={<ScopeToggle />}
        />

        {isLoading ? (
          <Panel><Skeleton className="h-40 w-full" /></Panel>
        ) : rows.length === 0 ? (
          <Panel>
            <p className="text-sm text-muted-foreground">
              {waiting > 0
                ? `No writing numbers yet — ${waiting} ${waiting === 1 ? "contract is" : "contracts are"} still working through.`
                : "No carrier contracts yet. Once one is approved, its writing number appears here."}
            </p>
          </Panel>
        ) : (
          <Panel pad={false} className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Carrier</th>
                    {scope !== "mine" && <th className="px-4 py-2.5 font-medium">Agent</th>}
                    <th className="px-4 py-2.5 font-medium">Writing number</th>
                    <th className="px-4 py-2.5 font-medium">Level</th>
                    <th className="px-4 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id} className="border-b border-border-soft last:border-0">
                      <td className="px-4 py-2.5 font-medium">{r.carriers?.name ?? "—"}</td>
                      {scope !== "mine" && (
                        <td className="px-4 py-2.5 text-muted-foreground">{r.agent_name ?? "—"}</td>
                      )}
                      <td className="tnum px-4 py-2.5 font-mono">{r.writing_number}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.commission_level ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        {r.carriers?.agent_portal_url && (
                          <a
                            href={r.carriers.agent_portal_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                          >
                            Carrier portal <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {waiting > 0 && rows.length > 0 && (
          <p className="text-[11px] text-text-dim">
            {waiting} {waiting === 1 ? "contract has" : "contracts have"} no number yet — they are still working through.
          </p>
        )}
      </div>
    </PageShell>
  );
}
