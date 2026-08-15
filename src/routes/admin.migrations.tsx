import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@/hooks/use-server-fn";
import { adminListMigrations } from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Database } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";

export const Route = createFileRoute("/admin/migrations")({
  component: AdminMigrations,
  head: () => ({ meta: [{ title: "Database Migrations — Agent Cloud Admin" }] }),
});

type Row = { version: string; name: string };

/** Migration versions are `YYYYMMDDHHMMSS` in UTC. */
function parseVersion(version: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/.exec(version);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  return Number.isNaN(date.getTime()) ? null : date;
}

function AdminMigrations() {
  const listFn = useServerFn(adminListMigrations);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    listFn({ data: {} } as any)
      .then((r: Row[]) => setRows(r))
      .catch((e: any) => setError(e?.message ?? "Could not load migrations"));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(needle) || r.version.includes(needle),
    );
  }, [rows, q]);

  return (
    <PageShell>
      <div className="space-y-[var(--gap)]">
        <HeroBand
          title="Database Migrations"
          subtitle="Every schema change applied to this project, newest first."
        />

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Database className="h-4 w-4" />
              {rows ? (
                <span className="tnum">{rows.length} applied</span>
              ) : (
                <span>Loading…</span>
              )}
            </div>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or timestamp"
              className="h-9 w-full sm:w-72"
            />
          </div>
        </Panel>

        <Panel>
          {error ? (
            <p className="py-8 text-center text-sm text-destructive">{error}</p>
          ) : !rows ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No matching migrations</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-soft text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Applied (UTC)</th>
                    <th className="py-2 pr-4 font-medium">Version</th>
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const at = parseVersion(r.version);
                    return (
                      <tr key={r.version + i} className="border-b border-border-soft last:border-0">
                        <td className="py-2 pr-4 whitespace-nowrap tnum">
                          {at ? at.toISOString().slice(0, 16).replace("T", " ") : "—"}
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap tnum text-muted-foreground">
                          {r.version}
                        </td>
                        <td className="py-2 pr-4">
                          {r.name ? (
                            <span className="font-medium">{r.name}</span>
                          ) : (
                            <Badge variant="outline" className="text-xs">unnamed</Badge>
                          )}
                        </td>
                        <td className="py-2 whitespace-nowrap text-muted-foreground tnum">
                          {at ? formatDistanceToNow(at, { addSuffix: true }) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
