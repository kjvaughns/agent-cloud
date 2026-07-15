import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import {
  Upload, CheckCircle2, AlertTriangle, Loader2,
  Users2, FileText, StickyNote, UserCheck, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseAgentLinkXLS } from "@/lib/agentlink-xls-parser";
import type { ParsedExport } from "@/lib/agentlink-xls-parser";
import { adminListAllAgents, adminImportAgentLinkXLS } from "@/lib/admin.functions";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/admin/csv-import")({
  head: () => ({ meta: [{ title: "AgentLink Import — Admin" }] }),
  component: AdminAgentLinkImport,
});

type Phase = "upload" | "preview" | "options" | "importing" | "done" | "error";

// ── Inline utility components ──────────────────────────────────────────────────

function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors",
                i < current
                  ? "bg-primary border-primary text-primary-foreground"
                  : i === current
                  ? "border-primary text-primary bg-background"
                  : "border-muted text-muted-foreground bg-background"
              )}
            >
              {i < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn("text-[10px] mt-1 whitespace-nowrap", i === current ? "text-primary font-medium" : "text-muted-foreground")}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn("h-0.5 w-8 sm:w-12 mx-1 mb-4 rounded transition-colors", i < current ? "bg-primary" : "bg-muted")} />
          )}
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm font-medium mt-0.5">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handle = (f: File | undefined) => {
    if (!f) return;
    if (!f.name.match(/\.(xls|xlsx)$/i)) {
      toast.error("Please upload an .xlsx or .xls file");
      return;
    }
    onFile(f);
  };

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/20"
      )}
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
      <p className="text-base font-medium">Click to upload or drag & drop</p>
      <p className="text-sm text-muted-foreground mt-1">AgentLink .xlsx export · 5-sheet format</p>
      <p className="text-xs text-muted-foreground mt-3">
        Sheets: Summary · Team Roster · Book of Business · All Clients · Client Notes
      </p>
    </div>
  );
}

function PreviewPanel({
  parsed,
  onContinue,
}: {
  parsed: ParsedExport;
  onContinue: () => void;
}) {
  const canImport = parsed.allClients.length > 0 || parsed.bookOfBusiness.length > 0;

  return (
    <div className="space-y-4">
      {parsed.summary.exportDate && (
        <p className="text-xs text-muted-foreground">
          Export date: {parsed.summary.exportDate}
          {parsed.summary.source && ` · Source: ${parsed.summary.source}`}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Team Roster" value={parsed.teamRoster.length} sub="agents" />
        <StatCard label="Clients" value={parsed.allClients.length} sub="to import" />
        <StatCard label="Policies" value={parsed.bookOfBusiness.length} sub="deals" />
        <StatCard label="Notes" value={parsed.clientNotes.length} sub="entries" />
      </div>

      {parsed.errors.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 space-y-1">
          <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">Parse warnings</div>
          {parsed.errors.map((e, i) => (
            <div key={i} className="text-xs text-amber-600 dark:text-amber-500">{e}</div>
          ))}
        </div>
      )}

      <Tabs defaultValue="clients">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="clients">Clients ({parsed.allClients.length})</TabsTrigger>
          <TabsTrigger value="policies">Policies ({parsed.bookOfBusiness.length})</TabsTrigger>
          <TabsTrigger value="roster">Team ({parsed.teamRoster.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({parsed.clientNotes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="clients">
          <div className="border rounded-lg overflow-auto max-h-60">
            <table className="text-xs w-full">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  {["Name", "Phone", "DOB", "Stage", "City / State"].map((h) => (
                    <th key={h} className="text-left p-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.allClients.slice(0, 20).map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 font-medium whitespace-nowrap">{c.firstName} {c.lastName}</td>
                    <td className="p-2 text-muted-foreground">{c.phone}</td>
                    <td className="p-2 text-muted-foreground">{c.dateOfBirth}</td>
                    <td className="p-2 capitalize">{c.stage}</td>
                    <td className="p-2 text-muted-foreground">{c.city}{c.city && c.state ? ", " : ""}{c.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.allClients.length > 20 && (
              <div className="text-xs text-muted-foreground text-center py-2 border-t">
                Showing first 20 of {parsed.allClients.length} clients
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="policies">
          <div className="border rounded-lg overflow-auto max-h-60">
            <table className="text-xs w-full">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  {["Client", "Carrier", "Product", "Policy #", "Monthly", "Agent"].map((h) => (
                    <th key={h} className="text-left p-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.bookOfBusiness.slice(0, 20).map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 whitespace-nowrap">{p.clientName}</td>
                    <td className="p-2 text-muted-foreground">{p.carrier}</td>
                    <td className="p-2 text-muted-foreground">{p.product}</td>
                    <td className="p-2 font-mono">{p.policyNumber}</td>
                    <td className="p-2 text-emerald-700 dark:text-emerald-400">${p.monthlyPremium.toFixed(2)}</td>
                    <td className="p-2 text-muted-foreground">{p.agentName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.bookOfBusiness.length > 20 && (
              <div className="text-xs text-muted-foreground text-center py-2 border-t">
                Showing first 20 of {parsed.bookOfBusiness.length} policies
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="roster">
          <div className="border rounded-lg overflow-auto max-h-60">
            <table className="text-xs w-full">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  {["Agent", "Email", "Status", "Depth", "Upline", "Joined"].map((h) => (
                    <th key={h} className="text-left p-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.teamRoster.map((a, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 font-medium whitespace-nowrap">{a.name}</td>
                    <td className="p-2 text-muted-foreground">{a.email}</td>
                    <td className="p-2">
                      <span className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        a.status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"
                      )}>
                        {a.status}
                      </span>
                    </td>
                    <td className="p-2 text-muted-foreground">{a.depth}</td>
                    <td className="p-2 text-muted-foreground">{a.upline}</td>
                    <td className="p-2 text-muted-foreground">{a.dateJoined}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Info className="h-3 w-3" />
            Roster data is stored for agent signup autofill only — live profiles are not modified.
          </p>
        </TabsContent>

        <TabsContent value="notes">
          <div className="border rounded-lg overflow-auto max-h-60">
            <table className="text-xs w-full">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  {["Client", "Date", "Author", "Type", "Note (truncated)"].map((h) => (
                    <th key={h} className="text-left p-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.clientNotes.slice(0, 20).map((n, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 font-medium whitespace-nowrap">{n.clientName}</td>
                    <td className="p-2 text-muted-foreground whitespace-nowrap">{n.date}</td>
                    <td className="p-2 text-muted-foreground">{n.author}</td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-[10px]">{n.noteType}</Badge>
                    </td>
                    <td className="p-2 max-w-xs truncate text-muted-foreground">{n.content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.clientNotes.length > 20 && (
              <div className="text-xs text-muted-foreground text-center py-2 border-t">
                Showing first 20 of {parsed.clientNotes.length} notes
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Button className="w-full" onClick={onContinue} disabled={!canImport}>
        Continue to Import Options →
      </Button>
    </div>
  );
}

// ── Main page component ────────────────────────────────────────────────────────

function AdminAgentLinkImport() {
  const agentsFn = useServerFn(adminListAllAgents);
  const importFn = useServerFn(adminImportAgentLinkXLS);

  const { data: agentsData } = useQuery({
    queryKey: ["admin-all-agents"],
    queryFn: () => agentsFn(),
  });
  const agents = agentsData?.agents ?? [];

  const [phase, setPhase] = useState<Phase>("upload");
  const [parsed, setParsed] = useState<ParsedExport | null>(null);
  const [targetAgentId, setTargetAgentId] = useState("");
  const [duplicateMode, setDuplicateMode] = useState<"review" | "merge" | "skip">("merge");
  const [importRoster, setImportRoster] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [importError, setImportError] = useState("");

  const importMut = useMutation({
    mutationFn: () =>
      importFn({
        data: {
          target_agent_id: targetAgentId,
          parsed: {
            teamRoster: parsed!.teamRoster,
            bookOfBusiness: parsed!.bookOfBusiness,
            allClients: parsed!.allClients,
            clientNotes: parsed!.clientNotes,
          },
          duplicate_mode: duplicateMode,
          import_roster: importRoster,
        },
      }),
    onMutate: () => setPhase("importing"),
    onSuccess: (res: any) => {
      setResult(res);
      setPhase("done");
    },
    onError: (e: any) => {
      setImportError(e?.message ?? "Import failed");
      setPhase("error");
    },
  });

  const reset = () => {
    setPhase("upload");
    setParsed(null);
    setTargetAgentId("");
    setResult(null);
    setImportError("");
  };

  const handleFile = async (f: File) => {
    try {
      const data = await parseAgentLinkXLS(f);
      setParsed(data);
      setPhase("preview");
    } catch (e: any) {
      toast.error(`Failed to parse file: ${e.message}`);
    }
  };

  const phaseIndex = ["upload", "preview", "options", "importing", "done", "error"].indexOf(phase);
  const stepIndex = Math.min(phaseIndex, 3);

  return (
    <PageShell>
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Upload className="h-6 w-6" /> AgentLink XLS Import
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload an exported AgentLink .xlsx file to import a full agent book of business.
        </p>
      </div>

      <StepBar steps={["Upload File", "Preview", "Import Options", "Run Import"]} current={stepIndex} />

      {/* ── UPLOAD ── */}
      {phase === "upload" && <UploadZone onFile={handleFile} />}

      {/* ── PREVIEW ── */}
      {phase === "preview" && parsed && (
        <PreviewPanel parsed={parsed} onContinue={() => setPhase("options")} />
      )}

      {/* ── OPTIONS ── */}
      {phase === "options" && parsed && (
        <div className="space-y-4 max-w-xl">
          <Card>
            <CardHeader><CardTitle className="text-base">1. Target Agent</CardTitle></CardHeader>
            <CardContent>
              <Select value={targetAgentId} onValueChange={setTargetAgentId}>
                <SelectTrigger><SelectValue placeholder="Choose the agent to import into…" /></SelectTrigger>
                <SelectContent>
                  {agents.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.first_name} {a.last_name} — {a.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!targetAgentId && (
                <p className="text-xs text-muted-foreground mt-1">Required — all clients and policies will be assigned to this agent.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">2. Duplicate Handling</CardTitle></CardHeader>
            <CardContent>
              <RadioGroup value={duplicateMode} onValueChange={(v) => setDuplicateMode(v as any)} className="space-y-2">
                {[
                  { value: "merge", label: "Auto-merge", desc: "Update existing clients with new data from the export (recommended for initial import)" },
                  { value: "review", label: "Review duplicates", desc: "Flag duplicates for the agent to review manually" },
                  { value: "skip", label: "Skip duplicates", desc: "Only import brand-new contacts" },
                ].map((opt) => (
                  <div key={opt.value} className="flex items-start gap-2">
                    <RadioGroupItem value={opt.value} id={`mode-${opt.value}`} className="mt-0.5" />
                    <Label htmlFor={`mode-${opt.value}`} className="font-normal cursor-pointer">
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-muted-foreground text-xs block mt-0.5">{opt.desc}</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">3. Team Roster</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="import-roster"
                  checked={importRoster}
                  onCheckedChange={(v) => setImportRoster(!!v)}
                  className="mt-0.5"
                />
                <Label htmlFor="import-roster" className="font-normal cursor-pointer">
                  <span className="font-medium">Store roster for signup autofill</span>
                  <span className="text-muted-foreground text-xs block mt-0.5">
                    Saves {parsed.teamRoster.length} agent record{parsed.teamRoster.length !== 1 ? "s" : ""} so returning Apex agents can be recognized when they sign up. Live profiles are never modified.
                  </span>
                </Label>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setPhase("preview")}>Back</Button>
            <Button
              className="flex-1"
              disabled={!targetAgentId || importMut.isPending}
              onClick={() => importMut.mutate()}
            >
              Run Import ({parsed.allClients.length} clients · {parsed.bookOfBusiness.length} policies · {parsed.clientNotes.length} notes)
            </Button>
          </div>
        </div>
      )}

      {/* ── IMPORTING ── */}
      {phase === "importing" && (
        <div className="py-16 flex flex-col items-center gap-5 text-center max-w-sm mx-auto">
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full animate-[progress_2s_ease-in-out_infinite]"
              style={{ width: "60%" }}
            />
          </div>
          <div>
            <p className="font-semibold">Importing…</p>
            <p className="text-sm text-muted-foreground mt-1">
              Processing {parsed?.allClients.length ?? 0} clients and {parsed?.bookOfBusiness.length ?? 0} policies. Please wait.
            </p>
          </div>
        </div>
      )}

      {/* ── DONE ── */}
      {phase === "done" && result && (
        <div className="space-y-4 max-w-xl">
          <div className="text-center py-4">
            <CheckCircle2 className="h-11 w-11 text-emerald-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold">Import Complete</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Clients" value={result.clients_imported} />
            <StatCard label="Policies" value={result.policies_imported} />
            <StatCard label="Notes" value={result.notes_imported} />
            <StatCard label="Roster Stored" value={result.roster_stored} />
            <StatCard label="Duplicates" value={result.duplicates_found} />
            <StatCard label="Skipped" value={result.skipped} />
          </div>
          {result.duplicates_found > 0 && duplicateMode === "review" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              {result.duplicates_found} duplicate{result.duplicates_found !== 1 ? "s" : ""} flagged for agent review. They can resolve these from their pipeline.
            </div>
          )}
          <Button variant="outline" onClick={reset} className="w-full">Import Another File</Button>
        </div>
      )}

      {/* ── ERROR ── */}
      {phase === "error" && (
        <div className="space-y-4 max-w-xl">
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>{importError}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={reset}>Start Over</Button>
            <Button onClick={() => { setPhase("options"); setImportError(""); }}>Try Again</Button>
          </div>
        </div>
      )}
    </div>
    </PageShell>
  );
}
