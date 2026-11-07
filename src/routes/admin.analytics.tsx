import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@/hooks/use-server-fn";
import { getFunnelReport } from "@/lib/self-serve.functions";

export const Route = createFileRoute("/admin/analytics")({
  component: AdminAnalytics,
  head: () => ({ meta: [{ title: "Signup funnel — Agent Cloud Admin" }] }),
});

const STAGES: [string, string][] = [
  ["signup", "Created account"], ["checkout_opened", "Opened payment"], ["paid", "Paid"],
  ["setup_step_1", "Agency details"], ["setup_step_2", "Carriers & book"], ["suite_activated", "Turned on Agency Suite"],
  ["setup_completed", "Finished setup"],
];

function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const fn = useServerFn(getFunnelReport);
  const { data, isLoading, error } = useQuery({ queryKey: ["funnel", days], queryFn: () => fn({ data: { days } }) });
  const top = Math.max(1, data?.signup ?? 0);
  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Signup funnel</h1>
        <select className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time range">
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Where self-serve signups drop off. Counts are people, not clicks.</p>
      {error && <p className="mt-4 text-sm text-destructive">{(error as Error).message}</p>}
      {isLoading ? <p className="mt-6 text-sm text-muted-foreground">Loading…</p> : (
        <ul className="mt-6 space-y-3">
          {STAGES.map(([k, label]) => {
            const n = data?.[k] ?? 0;
            return (
              <li key={k}>
                <div className="flex justify-between text-sm"><span>{label}</span><span className="font-semibold">{n}</span></div>
                <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(n / top) * 100}%` }} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
