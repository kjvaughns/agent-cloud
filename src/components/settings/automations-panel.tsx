import { requireSession } from "@/lib/require-session";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { supabase } from "@/integrations/supabase/client";
import {
  listAutomationJobs,
  listJobRuns,
  runAutomationJobNow,
} from "@/lib/automation-jobs.functions";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";


function statusTone(status: string) {
  if (status === "ok") return "bg-success/15 text-success border-success/30";
  if (status === "partial") return "bg-warning/15 text-warning border-warning/30";
  if (status === "failed") return "bg-destructive/15 text-destructive border-destructive/30";
  return "bg-muted text-muted-foreground border-border";
}

function duration(a: string, b: string | null) {
  if (!b) return "—";
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function AutomationsPage() {
  const qc = useQueryClient();
  const runNow = useServerFn(runAutomationJobNow);
  const [busy, setBusy] = useState<string | null>(null);

  const jobsQ = useQuery({ queryKey: ["automation-jobs"], queryFn: () => listAutomationJobs() });
  const runsQ = useQuery({ queryKey: ["automation-job-runs"], queryFn: () => listJobRuns() });

  const runs = runsQ.data?.runs ?? [];
  const jobs = jobsQ.data?.jobs ?? [];

  async function handleRun(key: string) {
    setBusy(key);
    try {
      const res: any = await runNow({ data: { jobKey: key } });
      if (res?.status === "failed") {
        toast.error(res.error ?? "The job failed. See the run log below.");
      } else {
        toast.success(
          `Ran — ${res.counts.considered} considered, ${res.counts.acted} acted on, ${res.counts.skipped} skipped.`,
        );
      }
      await qc.invalidateQueries({ queryKey: ["automation-job-runs"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not run that job");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
        <p className="text-sm text-muted-foreground">
          Scheduled jobs run hourly. Every run is recorded here — if it isn't listed, it didn't happen.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {jobs.map((j) => {
          const last = runs.find((r) => r.job_key === j.key);
          return (
            <Card key={j.key}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{j.label}</h3>
                    <p className="text-sm text-muted-foreground">{j.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === j.key}
                    onClick={() => handleRun(j.key)}
                  >
                    {busy === j.key ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    <span className="ml-2">Run now</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {last
                    ? `Last run ${new Date(last.started_at).toLocaleString()} — ${last.status}`
                    : "Never run"}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-5 py-4">
            <h3 className="font-semibold">Run log</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => runsQ.refetch()}
              disabled={runsQ.isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${runsQ.isFetching ? "animate-spin" : ""}`} />
              <span className="ml-2">Refresh</span>
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">Job</th>
                  <th className="px-3 py-2 font-medium">Started</th>
                  <th className="px-3 py-2 font-medium">Trigger</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Considered</th>
                  <th className="px-3 py-2 font-medium text-right">Acted</th>
                  <th className="px-3 py-2 font-medium text-right">Skipped</th>
                  <th className="px-3 py-2 font-medium text-right">Errors</th>
                  <th className="px-3 py-2 font-medium text-right">Took</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-muted-foreground">
                      No runs recorded yet.
                    </td>
                  </tr>
                )}
                {runs.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-5 py-2 font-medium">{r.job_key}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(r.started_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.trigger}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={statusTone(r.status)}>
                        {r.status}
                      </Badge>
                      {r.error && (
                        <span className="ml-2 text-xs text-destructive">{r.error}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{r.considered}</td>
                    <td className="px-3 py-2 text-right">{r.acted}</td>
                    <td className="px-3 py-2 text-right">{r.skipped}</td>
                    <td className="px-3 py-2 text-right">{r.errored}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {duration(r.started_at, r.finished_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
