import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useServerFn } from "@/hooks/use-server-fn";
import { getProducerFile } from "@/lib/producer-file.functions";
import { BACKGROUND_QUESTIONS } from "@/lib/producer/background-questions";
import { Panel } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const fmt = (d?: string | null) => (d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString() : "—");

/** Everything an owner or contracting staff needs to contract this agent. */
export function ProducerFileView({ agentId }: { agentId: string }) {
  const fn = useServerFn(getProducerFile);
  const { data, isLoading, error } = useQuery({ queryKey: ["producer-file", agentId], queryFn: () => fn({ data: { agentId } }) });
  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (error || !data) return <Panel title="Not available"><p className="text-sm text-muted-foreground">You don't have access to this agent's file.</p></Panel>;
  const p: any = data.profile ?? {};
  const doc = (t: string) => data.documents.find((d: any) => d.doc_type === t) as any;
  const eo = doc("eo_certificate"); const aml = doc("aml_certificate");
  const answered = data.background.length;
  const yes = data.background.filter((b: any) => b.answer);

  return (
    <div className="space-y-4">
      <Panel title="Personal information">
        <Grid rows={[
          ["Name", `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—"],
          ["NPN", p.npn_number], ["Date of birth", fmt(p.date_of_birth)], ["Gender", p.gender],
          ["Email", p.email], ["Phone", p.phone],
          ["Address", [p.street_address, p.city, [p.state, p.zip_code].filter(Boolean).join(" ")].filter(Boolean).join(", ")],
          ["Driver's license exp.", fmt(p.drivers_license_expiry)],
        ]} />
      </Panel>
      <Panel title="Documents">
        <div className="grid gap-3 sm:grid-cols-2">
          <DocCard title="E&O insurance" d={eo} rows={eo && [["Policy #", eo.policy_number], ["Carrier", eo.carrier_name], ["Limit", eo.coverage_amount], ["Start", fmt(eo.start_date)], ["Expires", fmt(eo.expiration_date)]]} />
          <DocCard title="AML certificate" d={aml} rows={aml && [["Start", fmt(aml.start_date)], ["Expires", fmt(aml.expiration_date)]]} />
          {data.documents.filter((d: any) => !["eo_certificate", "aml_certificate"].includes(d.doc_type)).map((d: any) => (
            <DocCard key={d.id} title={d.doc_type.replace(/_/g, " ")} d={d} rows={[["Expires", fmt(d.expiration_date)]]} />
          ))}
        </div>
      </Panel>
      <Panel title={`Background questions · ${answered} / ${BACKGROUND_QUESTIONS.length}`}>
        {answered === 0 ? <p className="text-sm text-muted-foreground">Not answered yet.</p> : yes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Answered "No" to every question.</p>
        ) : (
          <ul className="space-y-2">
            {yes.map((b: any) => (
              <li key={b.question_number} className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                <p className="font-medium text-foreground">{b.question_number}. {BACKGROUND_QUESTIONS[b.question_number - 1]?.text}</p>
                <p className="mt-1 text-muted-foreground">Yes — {b.explanation || "no explanation given"}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Signed agreement">
        {data.agreement ? <Grid rows={[["Signed by", data.agreement.signature_name], ["Date", fmt(data.agreement.signed_date)], ["Version", data.agreement.agreement_version]]} />
          : <p className="text-sm text-muted-foreground">Not signed yet.</p>}
      </Panel>
    </div>
  );
}

function Grid({ rows }: { rows: [string, any][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-border-soft py-1.5">
          <dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium text-foreground">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
function DocCard({ title, d, rows }: { title: string; d: any; rows: any }) {
  return (
    <div className="rounded-xl border border-border-soft bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold capitalize text-foreground">{title}</span>
        {d?.url ? <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">View <ExternalLink className="h-3 w-3" /></a>
          : <Badge variant="outline" className="text-[10px]">{d ? "No file" : "Missing"}</Badge>}
      </div>
      {rows && <Grid rows={rows} />}
    </div>
  );
}
