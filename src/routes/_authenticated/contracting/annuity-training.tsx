import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAnnuityCert, recordAnnuityCert } from "@/lib/contracting.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, FileCheck2, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contracting/annuity-training")({
  component: AnnuityTrainingPage,
  head: () => ({ meta: [{ title: "Annuity Training | Agent Cloud" }] }),
});

function AnnuityTrainingPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["contracting","annuityCert"], queryFn: () => getMyAnnuityCert() });
  const recordFn = useServerFn(recordAnnuityCert);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.type !== "application/pdf") { toast.error("PDF only"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Max 10MB"); return; }
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");
      const path = `${uid}/aml_certificate-${Date.now()}.pdf`;
      const { error } = await supabase.storage.from("producer-docs").upload(path, file, { upsert: true, contentType: "application/pdf" });
      if (error) throw error;
      await recordFn({ data: { storage_path: path, file_name: file.name } });
      toast.success("Certificate uploaded");
      qc.invalidateQueries({ queryKey: ["contracting","annuityCert"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const cert = data?.cert;

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Annuity Training</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          To sell annuities and request annuity contracts, you must complete a Best Interest training course and upload your certificate here.
        </p>
      </div>

      <Card><CardContent className="p-6 space-y-3">
        <h2 className="font-semibold">Best Interest Training Course</h2>
        <p className="text-sm text-muted-foreground">
          Complete this required training through WebCE before contracting with annuity carriers.
          This course covers Best Interest and Suitability standards required by state regulators.
        </p>
        <a href="https://www.webce.com" target="_blank" rel="noreferrer">
          <Button variant="outline"><ExternalLink className="h-4 w-4" /> Open WebCE Training Course</Button>
        </a>
      </CardContent></Card>

      <Card><CardContent className="p-6 space-y-4">
        <h2 className="font-semibold">Your Certificate</h2>

        {isLoading ? <Skeleton className="h-24" /> : cert?.file_url ? (
          <>
            <Alert className="border-emerald-500/40 bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertDescription className="text-emerald-700 dark:text-emerald-300">
                Certificate uploaded — Annuity contracting is unlocked
              </AlertDescription>
            </Alert>
            <div className="rounded-lg border p-4 flex items-center gap-3">
              <FileCheck2 className="h-8 w-8 text-emerald-600" />
              <div className="flex-1">
                <div className="font-medium text-sm">{cert.file_name ?? "certificate.pdf"}</div>
                <div className="text-xs text-muted-foreground">Uploaded {new Date(cert.created_at).toLocaleDateString()}</div>
              </div>
              <Button variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
                {uploading ? "Uploading..." : "Replace Certificate"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription>
                No certificate uploaded yet. Complete the course above and upload your certificate to unlock annuity contracting.
              </AlertDescription>
            </Alert>
            <button
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="w-full rounded-xl border-2 border-dashed p-8 text-center hover:bg-muted/30 transition-colors"
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
              <div className="mt-2 text-sm font-medium">{uploading ? "Uploading..." : "Choose PDF"}</div>
              <div className="text-xs text-muted-foreground">PDF only — max 10MB</div>
            </button>
          </>
        )}

        <input
          ref={fileInput} type="file" accept="application/pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
      </CardContent></Card>
    </div>
  );
}
