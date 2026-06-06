import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, Unlink, Zap, Send, Users2,
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

type Phase = "loading" | "no_key" | "has_key" | "basic_running" | "basic_done" | "full_form" | "full_sent" | "error";

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

  // Full import form fields
  const [fullUser, setFullUser] = useState("");
  const [fullPass, setFullPass] = useState("");
  const [fullNotes, setFullNotes] = useState("");
  const [showFullPass, setShowFullPass] = useState(false);

  // Status query — fires when dialog opens
  const statusFn = useServerFn(getAgentLinkKeyStatus);
  const {
    data: status,
    isLoading: statusLoading,
    isError: statusError,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["agentlink-status"],
    queryFn: () => statusFn(),
    enabled: open,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (phase !== "loading" || statusLoading) return;
    if (statusError || !status) { setPhase("no_key"); return; }
    setPhase((status as any).connected ? "has_key" : "no_key");
  }, [phase, statusLoading, statusError, status]);

  // Reset when dialog opens/closes
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
  const fullImportFn = useServerFn(submitFullImportRequest);

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
      qc.invalidateQueries({ queryKey: ["contracting", "myContracts"] });
    },
    onError: (e: any) => {
      setImportError(e?.message ?? "Import failed");
      setPhase("error");
    },
  });

  const fullImportMut = useMutation({
    mutationFn: () => fullImportFn({ data: {
      agentlink_username: fullUser.trim(),
      agentlink_password: fullPass,
      notes: fullNotes.trim() || undefined,
    }}),
    onSuccess: () => setPhase("full_sent"),
    onError: (e: any) => toast.error(e?.message ?? "Failed to submit request"),
  });

  const closeable = phase !== "basic_running";

  return (
    <Dialog open={open} onOpenChange={closeable ? onOpenChange : () => {}}>
      <DialogContent className="max-w-lg">

        {/* ── LOADING ──────────────────────────────────────────────── */}
        {phase === "loading" && (
          <div className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Checking connection…</p>
          </div>
        )}

        {/* ── NO KEY ───────────────────────────────────────────────── */}
        {phase === "no_key" && (
          <>
            <DialogHeader>
              <DialogTitle>Connect AgentLink</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Paste your AgentLink API key to import your book of business.
              </p>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                Generate your key in AgentLink → Profile → Integrations → API Access
              </div>
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
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                onClick={() => setPhase("full_form")}
              >
                Don't have an API key? Request a full import instead →
              </button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={() => saveMut.mutate()}
                disabled={apiKeyInput.trim().length < 10 || saveMut.isPending}
              >
                {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Connect
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── HAS KEY ──────────────────────────────────────────────── */}
        {phase === "has_key" && (
          <>
            <DialogHeader>
              <DialogTitle>AgentLink Connected</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Connected</div>
                  <div className="text-xs text-emerald-700 dark:text-emerald-400">
                    Key: ••••••{(status as any)?.masked_suffix}
                    {(status as any)?.last_synced && ` · Last synced: ${(status as any).last_synced}`}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testMut.mutate()}
                  disabled={testMut.isPending}
                >
                  {testMut.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    : <Zap className="h-3.5 w-3.5 mr-1" />}
                  Test Connection
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeMut.mutate()}
                  disabled={removeMut.isPending}
                >
                  {removeMut.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    : <Unlink className="h-3.5 w-3.5 mr-1" />}
                  Disconnect
                </Button>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1">
                <div className="font-medium text-foreground text-sm">Quick Import</div>
                <p>Imports new contacts by phone number. Existing contacts are skipped automatically. Carriers are auto-detected from policies.</p>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" className="text-xs" onClick={() => setPhase("full_form")}>
                Request Full Import
              </Button>
              <Button onClick={() => importMut.mutate()} disabled={importMut.isPending}>
                <Users2 className="h-4 w-4 mr-2" />
                Quick Import
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── BASIC RUNNING ────────────────────────────────────────── */}
        {phase === "basic_running" && (
          <div className="py-12 flex flex-col items-center gap-5 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div>
              <p className="font-semibold">Importing your book…</p>
              <p className="text-sm text-muted-foreground mt-1">
                This may take a minute. Please don't close this window.
              </p>
            </div>
          </div>
        )}

        {/* ── BASIC DONE ───────────────────────────────────────────── */}
        {phase === "basic_done" && importResult && (
          <>
            <DialogHeader>
              <DialogTitle>Import Complete</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Imported", value: importResult.imported, cls: "text-emerald-700 dark:text-emerald-400" },
                  { label: "Skipped", value: importResult.skipped, cls: "text-muted-foreground" },
                  { label: "Duplicates", value: importResult.duplicates, cls: "text-amber-700 dark:text-amber-400" },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="rounded-lg border bg-muted/30 p-3 text-center">
                    <div className={`text-2xl font-bold ${cls}`}>{value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              {(importResult.carriers_detected ?? 0) > 0 && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm text-left space-y-1">
                  <div className="font-semibold">
                    ✓ {importResult.carriers_detected} carrier{importResult.carriers_detected !== 1 ? "s" : ""} detected
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Go to <strong>My Contracts</strong> to add your writing numbers for each detected carrier.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}

        {/* ── FULL FORM ────────────────────────────────────────────── */}
        {phase === "full_form" && (
          <>
            <DialogHeader>
              <DialogTitle>Request Full Import</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Our team will securely log into AgentLink and import your full book of business, including complete policy history.
              </p>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>AgentLink Email</Label>
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
                <Label>Notes (optional)</Label>
                <Textarea
                  value={fullNotes}
                  onChange={(e) => setFullNotes(e.target.value)}
                  placeholder="Any special instructions for the import…"
                  rows={2}
                  className="text-sm"
                />
              </div>
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                Your credentials are stored encrypted and used only for this one-time import. They are deleted after completion.
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPhase(status && (status as any).connected ? "has_key" : "no_key")}
              >
                Back
              </Button>
              <Button
                onClick={() => fullImportMut.mutate()}
                disabled={!fullUser.trim() || !fullPass || fullImportMut.isPending}
              >
                {fullImportMut.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  : <Send className="h-4 w-4 mr-2" />}
                Submit Request
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── FULL SENT ────────────────────────────────────────────── */}
        {phase === "full_sent" && (
          <>
            <DialogHeader>
              <DialogTitle>Request Submitted</DialogTitle>
            </DialogHeader>
            <div className="py-6 flex flex-col items-center gap-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <div>
                <p className="font-semibold text-lg">We're on it!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your full import request has been submitted. Our team will complete the import and notify you when it's done, usually within 24 hours.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        )}

        {/* ── ERROR ────────────────────────────────────────────────── */}
        {phase === "error" && (
          <>
            <DialogHeader>
              <DialogTitle>Import Failed</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm text-destructive break-words min-w-0">{importError}</div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button onClick={() => setPhase("has_key")}>Try Again</Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
