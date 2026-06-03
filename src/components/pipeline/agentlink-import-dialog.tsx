import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importAgentLinkBook } from "@/lib/agentlink.functions";

type Step = "credentials" | "loading" | "done";

const LOADING_TEXTS = [
  "Fetching contacts...",
  "Importing policies...",
  "Syncing notes...",
  "Saving banking info...",
];

export function AgentLinkImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("credentials");
  const [baseUrl, setBaseUrl] = useState("https://agentlink.insuracloud.ai");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [authError, setAuthError] = useState("");
  const [loadingText, setLoadingText] = useState(LOADING_TEXTS[0]);
  const [result, setResult] = useState<{ imported: number; errors: number; total: number } | null>(null);

  // Reset when dialog closes/opens
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("credentials");
        setApiKey("");
        setAuthError("");
        setResult(null);
      }, 200);
    }
  }, [open]);

  // Cycle loading text
  useEffect(() => {
    if (step !== "loading") return;
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % LOADING_TEXTS.length;
      setLoadingText(LOADING_TEXTS[i]);
    }, 1800);
    return () => clearInterval(id);
  }, [step]);

  const importFn = useServerFn(importAgentLinkBook);
  const mut = useMutation({
    mutationFn: () => importFn({ data: { api_key: apiKey, base_url: baseUrl } }),
    onMutate: () => {
      setAuthError("");
      setStep("loading");
    },
    onSuccess: (data) => {
      setResult(data);
      setStep("done");
    },
    onError: (err: Error) => {
      setStep("credentials");
      setAuthError(err.message ?? "Could not connect to AgentLink. Double-check your API key.");
    },
  });

  const handleDone = () => {
    qc.invalidateQueries({ queryKey: ["pipeline", "list"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={step === "loading" ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        {step === "credentials" && (
          <>
            <DialogHeader>
              <DialogTitle>Import from AgentLink</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Connect your AgentLink account to import your full book of business — clients, policies, notes, and banking info.
              </p>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {authError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {authError}
                </div>
              )}

              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                Generate your API key in AgentLink → Profile → Integrations → API Access
              </div>

              <div className="space-y-2">
                <Label htmlFor="al-url">AgentLink URL</Label>
                <Input
                  id="al-url"
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://your-agentlink-instance.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="al-apikey">API Key</Label>
                <div className="relative">
                  <Input
                    id="al-apikey"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste your x-api-key here"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && apiKey.length >= 10) mut.mutate();
                    }}
                    className="pr-10"
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
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={() => mut.mutate()}
                disabled={!baseUrl.trim() || apiKey.length < 10}
              >
                Connect &amp; Import
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "loading" && (
          <div className="py-8 flex flex-col items-center gap-4">
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-[progress_2s_ease-in-out_infinite]" style={{ width: "60%" }} />
            </div>
            <div className="text-center">
              <p className="font-medium">Importing your book…</p>
              <p className="text-sm text-muted-foreground mt-1">This may take 1–2 minutes.</p>
              <p className="text-xs text-muted-foreground mt-3 animate-pulse">{loadingText}</p>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <>
            <div className="py-6 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <div>
                <h3 className="text-lg font-semibold">Import Complete!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.imported} {result.imported === 1 ? "client" : "clients"} imported successfully.
                </p>
                {result.errors > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {result.errors} {result.errors === 1 ? "record" : "records"} had errors and were skipped.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleDone}>View Pipeline</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
