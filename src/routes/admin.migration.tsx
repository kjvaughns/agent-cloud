import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { adminBatchInvite } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle, Circle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/admin/migration")({
  component: AdminMigration,
  head: () => ({ meta: [{ title: "Team Migration — Agent Cloud Admin" }] }),
});

const STEPS = [
  "Connect AgentLink",
  "Review Imported Agents",
  "Configure Commission Templates",
  "Send Invites",
  "Track Onboarding",
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
            i < current ? "bg-emerald-500/15 text-emerald-600" :
            i === current ? "bg-primary text-primary-foreground" :
            "bg-muted text-muted-foreground"
          )}>
            {i < current ? <CheckCircle className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{i + 1}</span>
          </div>
          {i < STEPS.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mx-1" />}
        </div>
      ))}
    </div>
  );
}

type ImportedAgent = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  policies_count?: number;
  selected: boolean;
};

function AdminMigration() {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [importing, setImporting] = useState(false);
  const [agents, setAgents] = useState<ImportedAgent[]>([]);
  const [tierA, setTierA] = useState("115");
  const [tierB, setTierB] = useState("110");
  const [tierC, setTierC] = useState("105");
  const [sending, setSending] = useState(false);
  const [inviteResults, setInviteResults] = useState<any[]>([]);

  async function importAgents() {
    if (!apiKey.trim()) { toast.error("Enter your AgentLink API key first"); return; }
    setImporting(true);
    try {
      const res = await fetch("https://agentlink.insuracloud.ai/api/v1/team-analytics", {
        headers: { "x-api-key": apiKey.trim(), "Accept": "application/json" },
      });
      if (res.status === 401) throw new Error("Invalid API key. Generate one at AgentLink → Profile → Integrations.");
      if (!res.ok) throw new Error(`AgentLink returned ${res.status}`);
      const data = await res.json();
      const rawAgents = Array.isArray(data) ? data : (data.agents ?? data.team ?? data.data ?? []);
      const mapped: ImportedAgent[] = rawAgents
        .filter((a: any) => a.email || a.emailAddress)
        .map((a: any) => ({
          first_name:    a.first_name ?? a.firstName ?? a.name?.split(" ")[0] ?? "",
          last_name:     a.last_name  ?? a.lastName  ?? a.name?.split(" ").slice(1).join(" ") ?? "",
          email:         a.email ?? a.emailAddress ?? "",
          phone:         a.phone ?? a.phone_number ?? null,
          policies_count: a.policies_count ?? a.totalPolicies ?? 0,
          selected:      true,
        }));
      if (mapped.length === 0) throw new Error("No agents found in AgentLink team roster");
      setAgents(mapped);
      setStep(1);
      toast.success(`Found ${mapped.length} agents in your AgentLink team`);
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function sendInvites() {
    const selectedAgents = agents.filter((a) => a.selected);
    if (selectedAgents.length === 0) { toast.error("Select at least one agent"); return; }
    setSending(true);
    try {
      const res = await adminBatchInvite({
        data: {
          agents: selectedAgents.map(({ first_name, last_name, email }) => ({ first_name, last_name, email })),
          tier_assignments: {},
        },
      });
      setInviteResults(res.results);
      setStep(4);
      toast.success(`${res.results.filter((r) => r.ok).length} invites sent`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setSending(false);
  }

  return (
    <PageShell>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team Migration Wizard</h1>
        <p className="text-sm text-muted-foreground mt-1">Import your existing team from AgentLink and onboard them to Agent Cloud</p>
      </div>

      <div className="overflow-x-auto pb-2">
        <StepIndicator current={step} />
      </div>

      {/* Step 0: Connect AgentLink */}
      {step === 0 && (
        <Card className="max-w-lg">
          <CardHeader><CardTitle className="text-base">Step 1 — Connect AgentLink</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter your AgentLink API key to import your full book of business and team hierarchy.</p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">AgentLink API Key</label>
              <Input
                type="password"
                placeholder="al_live_..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <Button onClick={importAgents} disabled={importing || !apiKey.trim()}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Import Agency Book
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Review agents */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{agents.length} agents found. Select who to invite.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAgents((a) => a.map((x) => ({ ...x, selected: !a.every((y) => y.selected) })))}
            >
              {agents.every((a) => a.selected) ? "Deselect All" : "Select All"}
            </Button>
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 w-10" />
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Policies</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agents.map((a, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={a.selected}
                        onCheckedChange={(v) => setAgents((prev) => prev.map((x, j) => j === i ? { ...x, selected: !!v } : x))}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">{a.first_name} {a.last_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.email}</td>
                    <td className="px-4 py-3 text-right">{a.policies_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
            <Button onClick={() => setStep(2)}>Continue</Button>
          </div>
        </div>
      )}

      {/* Step 2: Commission templates */}
      {step === 2 && (
        <Card className="max-w-lg">
          <CardHeader><CardTitle className="text-base">Step 3 — Commission Tiers</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Configure commission tier defaults. Agents will be assigned a tier when invited.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: "Tier A (%)", value: tierA, set: setTierA },
                { label: "Tier B (%)", value: tierB, set: setTierB },
                { label: "Tier C (%)", value: tierC, set: setTierC },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                  <Input type="number" value={value} onChange={(e) => set(e.target.value)} />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)}>Continue</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Send invites */}
      {step === 3 && (
        <div className="space-y-4 max-w-lg">
          <Card>
            <CardHeader><CardTitle className="text-base">Step 4 — Send Invites</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {agents.filter((a) => a.selected).length} agents selected to receive invites.
                Each will get a 30-day invite link via email.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={sendInvites} disabled={sending}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Send {agents.filter((a) => a.selected).length} Invites
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 4: Tracking */}
      {step === 4 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Step 5 — Onboarding Tracker</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border border-border rounded-lg overflow-x-auto">
                <table className="w-full text-sm min-w-[400px]">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Agent</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {inviteResults.map((r, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3">{r.email}</td>
                        <td className="px-4 py-3">
                          <Badge className={r.ok ? "bg-yellow-500/15 text-yellow-600" : "bg-red-500/15 text-red-600"}>
                            {r.ok ? "Invited" : "Failed"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.ok && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => toast.info("Reminder sent (demo)")}
                            >
                              Send Reminder
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
    </PageShell>
  );
}
