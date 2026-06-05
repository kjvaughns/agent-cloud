import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createAdminImportJob, confirmAdminImport, discardAdminImport } from "@/lib/admin-import.functions";

type Phase = "pick" | "extracting" | "review" | "importing" | "done" | "error";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function AIImportDialog({
  open,
  onOpenChange,
  targetAgent,
  scrapeRequestId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetAgent: { id: string; name: string };
  scrapeRequestId?: string | null;
  onDone?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [errMsg, setErrMsg] = useState("");

  const createFn = useServerFn(createAdminImportJob);
  const confirmFn = useServerFn(confirmAdminImport);
  const discardFn = useServerFn(discardAdminImport);

  const reset = () => {
    setPhase("pick"); setFile(null); setJobId(null);
    setExtracted(null); setResult(null); setErrMsg("");
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      if (file.size > 20 * 1024 * 1024) throw new Error("File must be ≤ 20MB");
      const b64 = await fileToBase64(file);
      return createFn({
        data: {
          target_agent_id: targetAgent.id,
          scrape_request_id: scrapeRequestId ?? undefined,
          file_name: file.name,
          file_type: file.type || "application/octet-stream",
          file_base64: b64,
        },
      });
    },
    onMutate: () => setPhase("extracting"),
    onSuccess: (res: any) => {
      setJobId(res.job_id);
      setExtracted(res.extracted);
      setPhase("review");
    },
    onError: (e: any) => {
      setErrMsg(e?.message ?? "Extraction failed");
      setPhase("error");
    },
  });

  const confirmMut = useMutation({
    mutationFn: () => confirmFn({ data: { job_id: jobId! } }),
    onMutate: () => setPhase("importing"),
    onSuccess: (res: any) => {
      setResult(res);
      setPhase("done");
      toast.success(`Imported ${res.clients_imported} clients, ${res.policies_imported} policies`);
      onDone?.();
    },
    onError: (e: any) => {
      setErrMsg(e?.message ?? "Import failed");
      setPhase("error");
    },
  });

  const discardMut = useMutation({
    mutationFn: () => (jobId ? discardFn({ data: { job_id: jobId } }) : Promise.resolve()),
    onSuccess: () => { reset(); onOpenChange(false); },
  });

  const clients: any[] = extracted?.clients ?? [];
  const policyCount = clients.reduce((acc, c) => acc + (c.policies?.length ?? 0), 0);
  const noteCount = clients.reduce((acc, c) => acc + (c.notes?.length ?? 0), 0);

  const closeable = phase !== "extracting" && phase !== "importing";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!closeable) return;
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> AI File Import — {targetAgent.name}
          </DialogTitle>
        </DialogHeader>

        {phase === "pick" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Upload any file exported from AgentLink (XLS, CSV, PDF, or screenshot). AI will extract clients,
              policies, and notes and let you preview before saving to <b>{targetAgent.name}</b>'s account.
            </p>
            <label className="block rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 text-center cursor-pointer hover:border-primary/60 transition-colors">
              <input
                type="file"
                accept=".xls,.xlsx,.csv,.pdf,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <FileText className="h-4 w-4" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Click to choose a file (max 20MB)
                </div>
              )}
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => createMut.mutate()} disabled={!file}>
                Extract with AI
              </Button>
            </DialogFooter>
          </div>
        )}

        {phase === "extracting" && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <div>
              <p className="font-semibold">Extracting with AI…</p>
              <p className="text-xs text-muted-foreground mt-1">This can take 30–60 seconds for large files.</p>
            </div>
          </div>
        )}

        {phase === "review" && extracted && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Clients", value: clients.length, color: "text-emerald-600" },
                { label: "Policies", value: policyCount, color: "text-blue-600" },
                { label: "Notes", value: noteCount, color: "text-amber-600" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border bg-muted/30 p-3 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>

            {extracted.source_description && (
              <div className="text-xs text-muted-foreground italic">
                AI detected: {extracted.source_description}
              </div>
            )}

            <div className="border rounded-lg max-h-[40vh] overflow-y-auto divide-y">
              {clients.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No clients extracted. Try a different file.
                </div>
              ) : (
                clients.slice(0, 100).map((c, i) => (
                  <div key={i} className="p-3 text-sm">
                    <div className="font-medium">
                      {c.first_name} {c.last_name}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 mt-0.5">
                      {c.phone && <span>📞 {c.phone}</span>}
                      {c.email && <span>✉️ {c.email}</span>}
                      {c.state && <span>📍 {c.city ? `${c.city}, ` : ""}{c.state}</span>}
                      {c.policies?.length > 0 && <span>📋 {c.policies.length} policies</span>}
                    </div>
                  </div>
                ))
              )}
              {clients.length > 100 && (
                <div className="p-2 text-xs text-center text-muted-foreground">
                  + {clients.length - 100} more not shown
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => discardMut.mutate()} disabled={discardMut.isPending}>
                Discard
              </Button>
              <Button
                onClick={() => confirmMut.mutate()}
                disabled={clients.length === 0 || confirmMut.isPending}
              >
                Confirm Import → {targetAgent.name}
              </Button>
            </DialogFooter>
          </div>
        )}

        {phase === "importing" && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="font-semibold">Saving to {targetAgent.name}'s account…</p>
          </div>
        )}

        {phase === "done" && result && (
          <div className="py-6 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <div>
              <h3 className="text-lg font-bold">Import Complete</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {targetAgent.name} has been notified.
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Clients", value: result.clients_imported },
                { label: "Policies", value: result.policies_imported },
                { label: "Notes", value: result.notes_imported },
                { label: "Duplicates", value: result.duplicates_skipped },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border bg-muted/30 p-2 text-center">
                  <div className="text-xl font-bold">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={() => { reset(); onOpenChange(false); }}>Close</Button>
            </DialogFooter>
          </div>
        )}

        {phase === "error" && (
          <div className="py-6 space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-destructive">Something went wrong</div>
                <div className="text-sm text-destructive/80 mt-1">{errMsg}</div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Close</Button>
              <Button onClick={() => setPhase("pick")}>Try Again</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
