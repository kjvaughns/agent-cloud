import { requireSession } from "@/lib/require-session";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listEmailSends,
  listEmailTemplateNames,
  previewEmailTemplate,
} from "@/lib/email-log.functions";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Eye } from "lucide-react";
import { toast } from "sonner";


const RANGES = [
  { label: "24h", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

function tone(status: string) {
  if (status === "sent") return "bg-success/15 text-success border-success/30";
  if (status === "suppressed") return "bg-warning/15 text-warning border-warning/30";
  if (status === "pending") return "bg-muted text-muted-foreground border-border";
  return "bg-destructive/15 text-destructive border-destructive/30";
}

export function EmailsPage() {
  const [days, setDays] = useState(7);
  const [template, setTemplate] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

  const fetchSends = useServerFn(listEmailSends);
  const doPreview = useServerFn(previewEmailTemplate);

  const logQ = useQuery({
    queryKey: ["email-sends", days, template, status],
    queryFn: () =>
      fetchSends({ data: { days, template: template || null, status: status || null } }),
  });
  const tplQ = useQuery({
    queryKey: ["email-template-names"],
    queryFn: () => listEmailTemplateNames(),
  });

  const stats = logQ.data?.stats;
  const rows = logQ.data?.rows ?? [];

  async function showPreview(name: string) {
    try {
      const res: any = await doPreview({ data: { name } });
      setPreview({ subject: res.subject, html: res.html });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not render that template");
    }
  }

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Email activity</h1>
        <p className="text-sm text-muted-foreground">
          Every email your agency sent, deduplicated to its latest status.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Button
            key={r.days}
            size="sm"
            variant={days === r.days ? "default" : "outline"}
            onClick={() => setDays(r.days)}
          >
            {r.label}
          </Button>
        ))}
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        >
          <option value="">All templates</option>
          {(logQ.data?.templates ?? []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="sent">Sent</option>
          <option value="dlq">Failed</option>
          <option value="suppressed">Suppressed</option>
          <option value="pending">Pending</option>
        </select>
        <Button size="sm" variant="ghost" onClick={() => logQ.refetch()} disabled={logQ.isFetching}>
          <RefreshCw className={`h-4 w-4 ${logQ.isFetching ? "animate-spin" : ""}`} />
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: stats?.total ?? 0 },
          { label: "Sent", value: stats?.sent ?? 0 },
          { label: "Failed", value: stats?.failed ?? 0 },
          { label: "Suppressed", value: stats?.suppressed ?? 0 },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs uppercase text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">Template</th>
                  <th className="px-3 py-2 font-medium">Recipient</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                      No emails in this range.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-5 py-2 font-medium">{r.template_name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.recipient_email ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={tone(r.status)}>
                        {r.status}
                      </Badge>
                      {r.error_message && (
                        <span className="ml-2 text-xs text-destructive">{r.error_message}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="p-5">
          <h3 className="mb-3 font-semibold">Template previews</h3>
          <div className="flex flex-wrap gap-2">
            {(tplQ.data?.templates ?? []).map((t) => (
              <Button key={t.name} size="sm" variant="outline" onClick={() => showPreview(t.name)}>
                <Eye className="h-3.5 w-3.5" />
                <span className="ml-2">{t.displayName}</span>
              </Button>
            ))}
          </div>
          {preview && (
            <div className="mt-5">
              <p className="mb-2 text-sm text-muted-foreground">
                Subject: <span className="font-medium text-foreground">{preview.subject}</span>
              </p>
              <iframe
                title="Email preview"
                srcDoc={preview.html}
                className="h-[600px] w-full rounded-md border bg-white"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
