import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Link2, Download, CheckCircle2, Eye, EyeOff,
  Loader2, Unlink, Zap, AlertCircle, Send,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  getAgentLinkKeyStatus,
  saveAgentLinkKey,
  removeAgentLinkKey,
  testAgentLinkConnection,
  basicImportFromAgentLink,
  submitFullImportRequest,
} from "@/lib/agentlink.functions";

type Phase =
  | "loading"
  | "no_key"
  | "has_key"
  | "basic_running"
  | "basic_done"
  | "full_form"
  | "full_sent"
  | "error";

export function AgentLinkImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();

  const [phase, setPhase] = useState<Phase>("loading");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState("");

  const [fullUser, setFullUser] = useState("");
  const [fullPass, setFullPass] = useState("");
  const [fullNotes, setFullNotes] = useState("");
  const [showFullPass, setShowFullPass] = useState(false);
  const [fullFormBack, setFullFormBack] = useState<Phase>("no_key");

  const statusFn = useServerFn(getAgentLinkKeyStatus);
  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["agentlink-status"],
    queryFn: () => statusFn(),
    enabled: open,
    staleTime: 0,
  });

  useEffect(() => {
    if (phase !== "loading" || statusLoading || !status) return;
    setPhase((status as any).connected ? "has_key" : "no_key");
  }, [phase, statusLoading, status]);

  useEffect(() => {
    if (open) {
      setPhase("loading");
      return;
    }
    const t = setTimeout(() => {
      setPhase("loading");
      setApiKeyInput("");
      setImportResult(null);
      setImportError("");
      setFullUser("");
      setFullPass("");
      setFullNotes("");
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

  const saveFn = useServerFn(saveAgentLinkKey);
  const removeFn = useServerFn(removeAgentLinkKey);
  const testFn = useServerFn(testAgentLinkConnection);
  const importFn = useServerFn(basicImportFromAgentLink);
  const fullFn = useServerFn(submitFullImportRequest);

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: { api_key: apiKeyInput.trim() } }),
    onSuccess: () => { refetchStatus(); setPhase("has_key"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save key"),
  });

  const removeMut = useMutation({
    mutationFn: () => removeFn({ data: {} }),
    onSuccess: () => { refetchStatus(); setPhase("no_key"); setApiKeyInput(""); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove key"),
  });

  const testMut = useMutation({
    mutationFn: () => testFn({ data: {} }),
    onSuccess: (res: any) => {
      if (res.ok) toast.success(`Connected! Found ${res.count} contacts.`);
      else toast.error(res.error ?? "Test failed");
    },
    onError: (e: any) => toast.error(e?.message),
  });

  const importMut = useMutation({
    mutationFn: () => importFn({ data: {} }),
    onMutate: () => setPhase("basic_running"),
    onSuccess: (res: any) => {
      setImportResult(res);
      setPhase("basic_done");
      qc.invalidateQueries({ queryKey: ["pipeline", "list"] });
      qc.invalidateQueries({ queryKey: ["bob", "list"] });
      qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    },
    onError: (e: any) => {
      setImportError(e?.message ?? "Import failed");
      setPhase("error");
    },
  });

  const fullMut = useMutation({
    mutationFn: () =>
      fullFn({
        data: {
          agentlink_username: fullUser.trim(),
          agentlink_password: fullPass,
          notes: fullNotes.trim() || undefined,
        },
      }),
    onSuccess: () => setPhase("full_sent"),
    onError: (e: any) => toast.error(e?.message ?? "Failed to submit request"),
  });

  const closeable = phase !== "basic_running";

  return (
    <Dialog open={open} onOpenChange={closeable ? onOpenChange : () => {}}>
      <DialogContent className="max-w-lg">

        {/* ── LOADING ───────────────────────────────────────────── */}
        {phase === "loading" && (
          <div className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Checking connection…</p>
          </div>
        )}

        {/* ── NO KEY ────────────────────────────────────────────── */}
        {phase === "no_key" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" /> Connect AgentLink
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Import your full book of business from AgentLink.
              </p>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-lg border p-4 space-y-3">
                <div className="text-sm font-medium">Option A — Connect with API Key</div>
                <p className="text-xs text-muted-foreground">
                  Generate your key in AgentLink → Profile → Integrations → API Access
                </p>
                <div className="space-y-1">
                  <Label>API Key</Label>
                  <div className="relative">
                    <Input
                      type={showKey ? "text" : "password"}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="Paste your x-api-key here"
                      className="pr-10"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && apiKeyInput.trim().length >= 10) saveMut.mutate();
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => saveMut.mutate()}
                  disabled={apiKeyInput.trim().length < 10 || saveMut.isPending}
                >
                  {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Connect
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 border-t" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 border-t" />
              </div>

              <button
                type="button"
                className="w-full text-left rounded-lg border p-4 hover:border-muted-foreground/40 transition-colors"
                onClick={() => { setFullFormBack("no_key"); setPhase("full_form"); }}
              >
                <div className="text-sm font-medium">Option B — Request Full Import →</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Don't have an API key? Submit your credentials and our team will run the import for you.
                </div>
              </button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            </DialogFooter>
          </>
        )}

        {/* ── HAS KEY ───────────────────────────────────────────── */}
        {phase === "has_key" && (
          <>
            <DialogHeader>
              <DialogTitle>AgentLink Import</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Connected</div>
                  <div className="text-xs text-emerald-700 dark:text-emerald-400">
                    Key: ••••••{(status as any)?.masked_suffix}
                    {(status as any)?.last_synced && ` · Last synced: ${(status as any).last_synced}`}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => testMut.mutate()}
                    disabled={testMut.isPending}
                  >
                    {testMut.isPending
                      ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      : <Zap className="h-3 w-3 mr-1" />}
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 text-destructive hover:text-destructive"
                    onClick={() => removeMut.mutate()}
                    disabled={removeMut.isPending}
                  >
                    {removeMut.isPending
                      ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      : <Unlink className="h-3 w-3 mr-1" />}
                    Remove
                  </Button>
                </div>
              </div>

              <button
                type="button"
                className="w-full text-left rounded-lg border p-4 hover:border-primary/60 transition-colors"
                onClick={() => importMut.mutate()}
                disabled={importMut.isPending}
              >
                <div className="flex items-start gap-3">
                  <Download className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                  <div>
                    <div className="text-sm font-medium">Run Basic Import</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Fetch all contacts from AgentLink API and add new ones to your pipeline.
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                className="w-full text-left rounded-lg border p-4 hover:border-muted-foreground/40 transition-colors"
                onClick={() => { setFullFormBack("has_key"); setPhase("full_form"); }}
              >
                <div className="flex items-start gap-3">
                  <Send className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-sm font-medium">Request Full Import</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Our team logs in on your behalf for a more complete data import.
                    </div>
                  </div>
                </div>
              </button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        )}

        {/* ── BASIC RUNNING ─────────────────────────────────────── */}
        {phase === "basic_running" && (
          <div className="py-12 flex flex-col items-center gap-5 text-center">
            <Download className="h-10 w-10 text-primary animate-bounce" />
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "70%" }} />
            </div>
            <div>
              <p className="font-semibold">Importing your book…</p>
              <p className="text-sm text-muted-foreground mt-1 animate-pulse">
                Fetching contacts from AgentLink…
              </p>
            </div>
          </div>
        )}

        {/* ── BASIC DONE ────────────────────────────────────────── */}
        {phase === "basic_done" && importResult && (
          <>
            <div className="py-4 text-center">
              <CheckCircle2 className="h-11 w-11 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold">Import Complete</h3>
            </div>
            <div className="grid grid-cols-3 gap-3 pb-2">
              {[
                { label: "Imported", value: importResult.imported ?? 0, color: "text-emerald-600" },
                { label: "Duplicates", value: importResult.duplicates ?? 0, color: "text-amber-600" },
                { label: "Skipped", value: importResult.skipped ?? 0, color: "text-muted-foreground" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-xl border bg-muted/30 p-3 text-center">
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => { setImportResult(null); setPhase("has_key"); }}
              >
                Import Again
              </Button>
              <Button onClick={() => onOpenChange(false)}>View Pipeline</Button>
            </DialogFooter>
          </>
        )}

        {/* ── FULL FORM ─────────────────────────────────────────── */}
        {phase === "full_form" && (
          <>
            <DialogHeader>
              <DialogTitle>Request Full Import</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                Your credentials are encrypted in transit and stored only until your import is complete.
                Our team will never use them for any other purpose.
              </div>
              <div className="space-y-1">
                <Label>AgentLink Username (email)</Label>
                <Input
                  type="email"
                  value={fullUser}
                  onChange={(e) => setFullUser(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label>AgentLink Password</Label>
                <div className="relative">
                  <Input
                    type={showFullPass ? "text" : "password"}
                    value={fullPass}
                    onChange={(e) => setFullPass(e.target.value)}
                    placeholder="Your AgentLink password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFullPass((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showFullPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label>
                  Notes{" "}
                  <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                </Label>
                <Textarea
                  value={fullNotes}
                  onChange={(e) => setFullNotes(e.target.value)}
                  placeholder="Any special instructions for the import team…"
                  rows={3}
                  maxLength={500}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPhase(fullFormBack)}>Back</Button>
              <Button
                onClick={() => fullMut.mutate()}
                disabled={!fullUser.trim() || !fullPass || fullMut.isPending}
              >
                {fullMut.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  : <Send className="h-4 w-4 mr-2" />}
                Submit Request
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── FULL SENT ─────────────────────────────────────────── */}
        {phase === "full_sent" && (
          <>
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 className="h-11 w-11 text-emerald-500 mx-auto" />
              <div>
                <h3 className="text-lg font-bold">Request Submitted!</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  Your admin has been notified. We'll complete your full AgentLink import within 1–2 business days.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}

        {/* ── ERROR ─────────────────────────────────────────────── */}
        {phase === "error" && (
          <>
            <DialogHeader>
              <DialogTitle>Import Failed</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="break-words">{importError}</p>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => { setFullFormBack("error"); setPhase("full_form"); }}
              >
                Request Full Import
              </Button>
              <Button onClick={() => { setPhase("has_key"); setImportError(""); }}>Try Again</Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
