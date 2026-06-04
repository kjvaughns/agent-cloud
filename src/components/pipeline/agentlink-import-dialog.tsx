import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, Unlink,
  RefreshCw, Zap, FileSearch, GitMerge, SkipForward, Users2,
  FileText, StickyNote, Send,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getAgentLinkKeyStatus,
  saveAgentLinkKey,
  removeAgentLinkKey,
  testAgentLinkKey,
  importFromAgentLink,
  resolveDuplicate,
  getPendingDuplicates,
  submitScrapeRequest,
} from "@/lib/agentlink.functions";

type Phase =
  | "check"
  | "connect"
  | "ready"
  | "options"
  | "importing"
  | "review"
  | "done"
  | "error"
  | "scrape_form"
  | "scrape_sent";

const LOADING_MSGS = [
  "Fetching contacts from AgentLink…",
  "Running duplicate detection…",
  "Importing new clients…",
  "Syncing policies…",
  "Saving notes…",
];

export function AgentLinkImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();

  const [phase, setPhase] = useState<Phase>("check");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [importMode, setImportMode] = useState<"review" | "merge" | "skip">("review");
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(LOADING_MSGS[0]);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [scrapeBackPhase, setScrapeBackPhase] = useState<Phase>("connect");

  // Scrape form
  const [scrapeUser, setScrapeUser] = useState("");
  const [scrapePass, setScrapePass] = useState("");
  const [scrapeNotes, setScrapeNotes] = useState("");
  const [showScrapePass, setShowScrapePass] = useState(false);

  // Status query — auto-fires when dialog opens
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

  // Transition from check → ready/connect once status resolves
  useEffect(() => {
    if (phase !== "check" || statusLoading || !status) return;
    setPhase((status as any).connected ? "ready" : "connect");
  }, [phase, statusLoading, status]);

  // Reset when dialog opens/closes
  useEffect(() => {
    if (open) {
      setPhase("check");
      return;
    }
    const t = setTimeout(() => {
      setPhase("check");
      setApiKeyInput("");
      setImportResult(null);
      setImportError("");
      setJobId(null);
      setResolvedIds(new Set());
      setScrapeUser("");
      setScrapePass("");
      setScrapeNotes("");
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

  // Cycle loading text while importing
  useEffect(() => {
    if (phase !== "importing") return;
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % LOADING_MSGS.length;
      setLoadingText(LOADING_MSGS[i]);
    }, 1800);
    return () => clearInterval(id);
  }, [phase]);

  // Pending duplicates query (only active in review phase)
  const pendingFn = useServerFn(getPendingDuplicates);
  const { data: pendingData, refetch: refetchPending } = useQuery({
    queryKey: ["import-pending", jobId],
    queryFn: () => pendingFn({ data: { job_id: jobId! } }),
    enabled: phase === "review" && !!jobId,
  });
  const pendingDups: any[] = pendingData?.duplicates ?? [];
  const unresolvedDups = pendingDups.filter((d) => !resolvedIds.has(d.id));

  // Server function refs
  const saveFn = useServerFn(saveAgentLinkKey);
  const removeFn = useServerFn(removeAgentLinkKey);
  const testFn = useServerFn(testAgentLinkKey);
  const importFn = useServerFn(importFromAgentLink);
  const resolveFn = useServerFn(resolveDuplicate);
  const scrapeFn = useServerFn(submitScrapeRequest);

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: { api_key: apiKeyInput.trim() } }),
    onSuccess: () => {
      refetchStatus();
      setPhase("ready");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save key"),
  });

  const removeMut = useMutation({
    mutationFn: () => removeFn({ data: {} }),
    onSuccess: () => {
      refetchStatus();
      setPhase("connect");
      setApiKeyInput("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove key"),
  });

  const testMut = useMutation({
    mutationFn: () => testFn({ data: {} }),
    onSuccess: (res: any) => {
      if (res.ok) toast.success(`Connected! Found ${res.client_count} contacts.`);
      else toast.error(res.error ?? "Test failed");
    },
    onError: (e: any) => toast.error(e?.message),
  });

  const importMut = useMutation({
    mutationFn: () =>
      importFn({
        data: {
          skip_duplicates: importMode === "skip",
          merge_duplicates: importMode === "merge",
        },
      }),
    onMutate: () => {
      setPhase("importing");
      setLoadingText(LOADING_MSGS[0]);
    },
    onSuccess: (res: any) => {
      setImportResult(res);
      setJobId(res.job_id);
      if (res.needs_review && importMode === "review") {
        setPhase("review");
      } else {
        setPhase("done");
        qc.invalidateQueries({ queryKey: ["pipeline", "list"] });
        qc.invalidateQueries({ queryKey: ["bob", "list"] });
        qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      }
    },
    onError: (e: any) => {
      setImportError(e?.message ?? "Import failed");
      setPhase("error");
    },
  });

  const resolveMut = useMutation({
    mutationFn: ({
      id,
      resolution,
    }: {
      id: string;
      resolution: "merge" | "keep_both" | "skip";
    }) => resolveFn({ data: { duplicate_id: id, resolution } }),
    onSuccess: (_, vars) => {
      setResolvedIds((prev) => new Set([...prev, vars.id]));
      refetchPending();
    },
    onError: (e: any) => toast.error(e?.message),
  });

  const scrapeMut = useMutation({
    mutationFn: () =>
      scrapeFn({
        data: {
          agentlink_username: scrapeUser.trim(),
          agentlink_password: scrapePass,
          notes: scrapeNotes.trim() || undefined,
        },
      }),
    onSuccess: () => setPhase("scrape_sent"),
    onError: (e: any) => toast.error(e?.message ?? "Failed to submit request"),
  });

  const finishReview = () => {
    setPhase("done");
    qc.invalidateQueries({ queryKey: ["pipeline", "list"] });
    qc.invalidateQueries({ queryKey: ["bob", "list"] });
    qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
  };

  const closeable = phase !== "importing";

  return (
    <Dialog open={open} onOpenChange={closeable ? onOpenChange : () => {}}>
      <DialogContent className="max-w-lg">

        {/* ── CHECK ─────────────────────────────────────────────── */}
        {phase === "check" && (
          <div className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Checking connection…</p>
          </div>
        )}

        {/* ── CONNECT ───────────────────────────────────────────── */}
        {phase === "connect" && (
          <>
            <DialogHeader>
              <DialogTitle>Connect AgentLink</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Paste your AgentLink API key to import your full book of business.
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
                onClick={() => { setScrapeBackPhase("connect"); setPhase("scrape_form"); }}
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

        {/* ── READY ─────────────────────────────────────────────── */}
        {phase === "ready" && (
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
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setPhase("options")}>
                Import Options
              </Button>
              <Button onClick={() => importMut.mutate()} disabled={importMut.isPending}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Import Now
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── OPTIONS ───────────────────────────────────────────── */}
        {phase === "options" && (
          <>
            <DialogHeader>
              <DialogTitle>Import Options</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Choose how to handle contacts that already exist in your pipeline.
              </p>
            </DialogHeader>
            <div className="py-2 space-y-3">
              {(
                [
                  {
                    value: "review" as const,
                    icon: FileSearch,
                    title: "Review Duplicates",
                    desc: "Import new contacts now, then review each potential duplicate one-by-one.",
                  },
                  {
                    value: "merge" as const,
                    icon: GitMerge,
                    title: "Auto-merge",
                    desc: "Automatically update existing records with any new information from AgentLink.",
                  },
                  {
                    value: "skip" as const,
                    icon: SkipForward,
                    title: "Skip Duplicates",
                    desc: "Only import brand-new contacts. Existing clients are left unchanged.",
                  },
                ]
              ).map(({ value, icon: Icon, title, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setImportMode(value)}
                  className={`w-full text-left rounded-lg border p-4 transition-colors ${
                    importMode === value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Icon
                      className={`h-5 w-5 mt-0.5 shrink-0 ${
                        importMode === value ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <div>
                      <div className="font-medium text-sm">{title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPhase("ready")}>Back</Button>
              <Button onClick={() => importMut.mutate()} disabled={importMut.isPending}>
                Start Import
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── IMPORTING ─────────────────────────────────────────── */}
        {phase === "importing" && (
          <div className="py-12 flex flex-col items-center gap-5 text-center">
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full animate-[progress_2s_ease-in-out_infinite]"
                style={{ width: "60%" }}
              />
            </div>
            <div>
              <p className="font-semibold">Importing your book…</p>
              <p className="text-sm text-muted-foreground mt-1">
                This may take 1–2 minutes. Please don't close this window.
              </p>
              <p className="text-xs text-muted-foreground mt-3 animate-pulse">{loadingText}</p>
            </div>
          </div>
        )}

        {/* ── REVIEW ────────────────────────────────────────────── */}
        {phase === "review" && (
          <>
            <DialogHeader>
              <DialogTitle>Review Duplicates</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {unresolvedDups.length} record{unresolvedDups.length !== 1 ? "s" : ""} need your decision.
              </p>
            </DialogHeader>
            <div className="max-h-[52vh] overflow-y-auto space-y-3 py-2 pr-1">
              {unresolvedDups.map((dup: any) => (
                <div key={dup.id} className="border rounded-lg p-4 space-y-3">
                  <Badge variant="outline" className="text-xs">
                    {dup.match_type === "phone"
                      ? "Phone match"
                      : dup.match_type === "name_dob"
                      ? "Name + DOB match"
                      : "Name match"}{" "}
                    — {dup.confidence}% confidence
                  </Badge>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-blue-50 dark:bg-blue-950/20 rounded p-2 space-y-0.5">
                      <div className="font-semibold text-blue-700 dark:text-blue-400 mb-1">Incoming</div>
                      <div>{dup.incoming_data?.first_name} {dup.incoming_data?.last_name}</div>
                      <div className="text-muted-foreground">{dup.incoming_data?.phone}</div>
                      <div className="text-muted-foreground">{dup.incoming_data?.email}</div>
                    </div>
                    <div className="bg-muted/50 rounded p-2 space-y-0.5">
                      <div className="font-semibold text-muted-foreground mb-1">Existing</div>
                      <div>{dup.clients?.first_name} {dup.clients?.last_name}</div>
                      <div className="text-muted-foreground">{dup.clients?.phone}</div>
                      <div className="text-muted-foreground">{dup.clients?.email}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm" variant="outline" className="flex-1 text-xs h-7"
                      disabled={resolveMut.isPending}
                      onClick={() => resolveMut.mutate({ id: dup.id, resolution: "merge" })}
                    >
                      Merge
                    </Button>
                    <Button
                      size="sm" variant="outline" className="flex-1 text-xs h-7"
                      disabled={resolveMut.isPending}
                      onClick={() => resolveMut.mutate({ id: dup.id, resolution: "keep_both" })}
                    >
                      Keep Both
                    </Button>
                    <Button
                      size="sm" variant="outline" className="flex-1 text-xs h-7 text-muted-foreground"
                      disabled={resolveMut.isPending}
                      onClick={() => resolveMut.mutate({ id: dup.id, resolution: "skip" })}
                    >
                      Skip
                    </Button>
                  </div>
                </div>
              ))}
              {unresolvedDups.length === 0 && pendingDups.length > 0 && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  All duplicates resolved!
                </div>
              )}
            </div>
            <DialogFooter>
              <p className="text-xs text-muted-foreground mr-auto self-center">
                {resolvedIds.size} / {pendingDups.length} resolved
              </p>
              <Button onClick={finishReview}>Finish Review</Button>
            </DialogFooter>
          </>
        )}

        {/* ── DONE ──────────────────────────────────────────────── */}
        {phase === "done" && importResult && (
          <>
            <div className="py-4 text-center">
              <CheckCircle2 className="h-11 w-11 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold">Import Complete</h3>
            </div>
            <div className="grid grid-cols-3 gap-3 pb-2">
              {[
                { icon: Users2, label: "Clients", value: importResult.imported ?? 0 },
                { icon: FileText, label: "Policies", value: importResult.policy_count ?? 0 },
                { icon: StickyNote, label: "Notes", value: importResult.note_count ?? 0 },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-xl border bg-muted/30 p-3 text-center">
                  <Icon className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                  <div className="text-2xl font-bold">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            {(importResult.skipped ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground text-center pb-1">
                {importResult.skipped} record{importResult.skipped !== 1 ? "s" : ""} skipped
              </p>
            )}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>View Pipeline</Button>
            </DialogFooter>
          </>
        )}

        {/* ── ERROR ─────────────────────────────────────────────── */}
        {phase === "error" && (
          <>
            <DialogHeader>
              <DialogTitle>Import Failed</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="break-words">{importError}</p>
              </div>
              <div className="rounded-lg border border-muted bg-muted/30 px-3 py-2 space-y-1 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Troubleshooting tips:</p>
                {importError.startsWith("AUTH:") && (
                  <p>• Your API key is invalid or expired — regenerate it in AgentLink → Profile → Integrations.</p>
                )}
                {importError.startsWith("NETWORK:") && (
                  <p>• Check your internet connection and try again.</p>
                )}
                {importError.startsWith("NOT_FOUND:") && (
                  <p>• The AgentLink API endpoint was not found. Contact support if this continues.</p>
                )}
                {!importError.startsWith("AUTH:") &&
                  !importError.startsWith("NETWORK:") &&
                  !importError.startsWith("NOT_FOUND:") && (
                    <>
                      <p>• Ensure your API key is correct and hasn't expired.</p>
                      <p>• Try the Test Connection button before importing.</p>
                      <p>• If the issue persists, use "Request Full Import" below.</p>
                    </>
                  )}
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => { setScrapeBackPhase("error"); setPhase("scrape_form"); }}
              >
                Request Full Import
              </Button>
              <Button onClick={() => { setPhase("ready"); setImportError(""); }}>Try Again</Button>
            </DialogFooter>
          </>
        )}

        {/* ── SCRAPE FORM ───────────────────────────────────────── */}
        {phase === "scrape_form" && (
          <>
            <DialogHeader>
              <DialogTitle>Request Full Import</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Our team will log in to AgentLink on your behalf and run a complete import. Your
                credentials are encrypted in transit and never stored in plain text.
              </p>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>AgentLink Username (email)</Label>
                <Input
                  type="email"
                  value={scrapeUser}
                  onChange={(e) => setScrapeUser(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label>AgentLink Password</Label>
                <div className="relative">
                  <Input
                    type={showScrapePass ? "text" : "password"}
                    value={scrapePass}
                    onChange={(e) => setScrapePass(e.target.value)}
                    placeholder="Your AgentLink password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowScrapePass((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showScrapePass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label>
                  Notes{" "}
                  <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                </Label>
                <Textarea
                  value={scrapeNotes}
                  onChange={(e) => setScrapeNotes(e.target.value)}
                  placeholder="Any special instructions or notes for the import team…"
                  rows={3}
                  maxLength={500}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPhase(scrapeBackPhase)}>Back</Button>
              <Button
                onClick={() => scrapeMut.mutate()}
                disabled={!scrapeUser.trim() || !scrapePass || scrapeMut.isPending}
              >
                {scrapeMut.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  : <Send className="h-4 w-4 mr-2" />}
                Submit Request
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── SCRAPE SENT ───────────────────────────────────────── */}
        {phase === "scrape_sent" && (
          <>
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 className="h-11 w-11 text-emerald-500 mx-auto" />
              <div>
                <h3 className="text-lg font-bold">Request Submitted!</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  Our team will complete your full AgentLink import within 1–2 business days. We'll
                  notify you when it's done.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
