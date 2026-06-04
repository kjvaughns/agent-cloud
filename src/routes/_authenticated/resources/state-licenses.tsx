import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { getStatesReference, getMyLicenses, upsertLicense, scanNiprPdf, bulkUpsertLicenses } from "@/lib/resources.functions";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Globe, GraduationCap, MapPin, AlertTriangle, RefreshCw, Upload, ExternalLink, ShieldCheck, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/resources/state-licenses")({
  head: () => ({ meta: [{ title: "State Licenses — Agent Cloud" }] }),
  component: Page,
});

interface ExtractedLicense {
  state_code: string;
  license_number?: string;
  license_type?: string;
  loa?: string;
  loa_status?: string;
  issued_date?: string;
  expires_date?: string;
  is_resident?: boolean;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ExpiryCell({ date }: { date?: string }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const today = new Date();
  const in90 = new Date(); in90.setDate(in90.getDate() + 90);
  const exp = new Date(date);
  if (exp < today) return <span className="text-destructive font-semibold">{date}</span>;
  if (exp < in90) return <span className="text-amber-600 font-semibold">{date}</span>;
  return <span>{date}</span>;
}

type NiprPhase = "instructions" | "upload" | "scanning" | "preview" | "done" | "error";

function NiprSyncDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const qc = useQueryClient();
  const scanFn = useServerFn(scanNiprPdf);
  const bulkFn = useServerFn(bulkUpsertLicenses);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<NiprPhase>("instructions");
  const [errorMsg, setErrorMsg] = useState("");
  const [extracted, setExtracted] = useState<{ npn: string; licenses: ExtractedLicense[] } | null>(null);
  const [editedLicenses, setEditedLicenses] = useState<ExtractedLicense[]>([]);
  const [editedNpn, setEditedNpn] = useState("");
  const [importResult, setImportResult] = useState<{ inserted: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);

  function reset() {
    setPhase("instructions");
    setErrorMsg("");
    setExtracted(null);
    setEditedLicenses([]);
    setEditedNpn("");
    setImportResult(null);
    setImporting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setPhase("scanning");
    try {
      const base64 = await fileToBase64(file);
      const result = await scanFn({ data: { file_base64: base64, media_type: file.type || "application/pdf" } });
      setExtracted(result);
      setEditedLicenses(result.licenses);
      setEditedNpn(result.npn ?? "");
      setPhase("preview");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Failed to scan document");
      setPhase("error");
    }
  }

  async function handleImport() {
    if (!editedLicenses.length) return;
    setImporting(true);
    try {
      const result = await bulkFn({ data: { npn: editedNpn || undefined, licenses: editedLicenses } });
      setImportResult(result);
      qc.invalidateQueries({ queryKey: ["my-licenses"] });
      onImported();
      setPhase("done");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Import failed");
      setPhase("error");
    } finally {
      setImporting(false);
    }
  }

  function removeRow(idx: number) {
    setEditedLicenses((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" /> Sync Licenses from NIPR
          </DialogTitle>
        </DialogHeader>

        {phase === "instructions" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              NIPR.com provides an official Producer Database (PDB) report listing every state license, line of authority, and expiration date. Upload it here to automatically import all your licenses.
            </p>
            <div className="space-y-2">
              {[
                { n: 1, text: 'Go to nipr.com and log in with your NPN' },
                { n: 2, text: 'Navigate to "PDB Report" or "My Licenses"' },
                { n: 3, text: 'Download the PDF report' },
                { n: 4, text: 'Return here and upload the PDF below' },
                { n: 5, text: 'Review the extracted licenses and click Import' },
              ].map(({ n, text }) => (
                <div key={n} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs grid place-items-center font-bold">{n}</div>
                  <p className="text-sm pt-0.5">{text}</p>
                </div>
              ))}
            </div>
            <a href="https://nipr.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Open NIPR.com
            </a>
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 dark:bg-green-950/20 px-3 py-2 text-xs text-green-700 dark:text-green-400">
              <ShieldCheck className="h-4 w-4 flex-shrink-0" />
              Your document is processed securely and never stored. Only the extracted license data is saved.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => setPhase("upload")}>I have my report</Button>
            </DialogFooter>
          </div>
        )}

        {phase === "upload" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
            >
              <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Drop your NIPR PDB report here</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse — PDF or image</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setPhase("instructions")}>Back</Button>
            </DialogFooter>
          </div>
        )}

        {phase === "scanning" && (
          <div className="py-12 flex flex-col items-center gap-4">
            <RefreshCw className="h-10 w-10 text-primary animate-spin" />
            <p className="text-sm font-medium">Scanning your NIPR report…</p>
            <p className="text-xs text-muted-foreground">This usually takes 10–20 seconds</p>
          </div>
        )}

        {phase === "preview" && extracted && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div>
                <Label htmlFor="npn-field" className="text-xs text-muted-foreground">NPN Number</Label>
                <Input
                  id="npn-field"
                  value={editedNpn}
                  onChange={(e) => setEditedNpn(e.target.value)}
                  className="w-44 h-8 text-sm mt-1"
                />
              </div>
              <div className="ml-auto text-sm text-muted-foreground">{editedLicenses.length} license rows</div>
            </div>
            <div className="rounded-md border overflow-auto max-h-80">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">State</th>
                    <th className="text-left p-2 font-medium">License #</th>
                    <th className="text-left p-2 font-medium">LOA</th>
                    <th className="text-left p-2 font-medium">Type</th>
                    <th className="text-left p-2 font-medium">Issued</th>
                    <th className="text-left p-2 font-medium">Expires</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {editedLicenses.map((lic, idx) => (
                    <tr key={idx} className="border-t hover:bg-muted/20">
                      <td className="p-2 font-semibold">{lic.state_code}</td>
                      <td className="p-2 font-mono">{lic.license_number ?? "—"}</td>
                      <td className="p-2">{lic.loa ?? "—"}</td>
                      <td className="p-2">{lic.license_type ?? "—"}</td>
                      <td className="p-2">{lic.issued_date ?? "—"}</td>
                      <td className="p-2"><ExpiryCell date={lic.expires_date} /></td>
                      <td className="p-2">
                        <Badge variant={lic.loa_status === "Active" ? "default" : "secondary"} className="text-xs">
                          {lic.loa_status ?? "Active"}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <button type="button" onClick={() => removeRow(idx)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPhase("upload")}>Re-upload</Button>
              <Button onClick={handleImport} disabled={importing || editedLicenses.length === 0}>
                {importing ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                Import {editedLicenses.length} License{editedLicenses.length !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </div>
        )}

        {phase === "done" && importResult && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div>
              <p className="text-lg font-semibold">{importResult.inserted} licenses imported</p>
              {editedNpn && <p className="text-sm text-muted-foreground mt-1">NPN: {editedNpn}</p>}
            </div>
            {importResult.errors.length > 0 && (
              <div className="w-full rounded border border-destructive/30 bg-destructive/5 p-3 text-left text-xs space-y-1">
                <p className="font-semibold text-destructive">{importResult.errors.length} rows had errors:</p>
                {importResult.errors.map((err, i) => <p key={i} className="text-muted-foreground">{err}</p>)}
              </div>
            )}
            <Button onClick={handleClose}>Done</Button>
          </div>
        )}

        {phase === "error" && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <div>
              <p className="text-lg font-semibold">Something went wrong</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">{errorMsg}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => setPhase("upload")}>Try Again</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Page() {
  const qc = useQueryClient();
  const statesFn = useServerFn(getStatesReference);
  const licensesFn = useServerFn(getMyLicenses);
  const upsertFn = useServerFn(upsertLicense);
  const { data: states = [] } = useQuery({ queryKey: ["states-ref"], queryFn: () => statesFn() });
  const { data: licenses = [] } = useQuery({ queryKey: ["my-licenses"], queryFn: () => licensesFn() });

  const [q, setQ] = useState("");
  const [tz, setTz] = useState("all");
  const [sort, setSort] = useState("licensed");
  const [editState, setEditState] = useState<any>(null);
  const [form, setForm] = useState({ license_number: "", issued_date: "", expires_date: "" });
  const [niprOpen, setNiprOpen] = useState(false);

  const licensedStates = useMemo(() => new Set(licenses.map((l: any) => l.state_code)), [licenses]);

  const stats = useMemo(() => {
    const today = new Date();
    const in90 = new Date(); in90.setDate(in90.getDate() + 90);
    let expiring = 0, expired = 0;
    for (const l of licenses) {
      const exp = new Date((l as any).expires_date);
      if (exp < today) expired++;
      else if (exp < in90) expiring++;
    }
    return { total: licensedStates.size, expiring, expired };
  }, [licenses, licensedStates]);

  const filtered = useMemo(() => {
    let arr = states.filter((s: any) =>
      (tz === "all" || s.timezone === tz) &&
      (q === "" || s.state_name.toLowerCase().includes(q.toLowerCase()) || s.state_code.toLowerCase().includes(q.toLowerCase()))
    );
    if (sort === "name-asc") arr = [...arr].sort((a: any, b: any) => a.state_name.localeCompare(b.state_name));
    else if (sort === "name-desc") arr = [...arr].sort((a: any, b: any) => b.state_name.localeCompare(a.state_name));
    else if (sort === "price") arr = [...arr].sort((a: any, b: any) => (a.license_fee_cents ?? 0) - (b.license_fee_cents ?? 0));
    else arr = [...arr].sort((a: any, b: any) => {
      const la = licensedStates.has(a.state_code) ? 0 : 1;
      const lb = licensedStates.has(b.state_code) ? 0 : 1;
      return la - lb || a.state_name.localeCompare(b.state_name);
    });
    return arr;
  }, [states, q, tz, sort, licensedStates]);

  const mut = useMutation({
    mutationFn: (data: any) => upsertFn({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-licenses"] });
      toast.success("License saved");
      setEditState(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openModal(state: any) {
    const existing: any = licenses.find((l: any) => l.state_code === state.state_code);
    setEditState(state);
    setForm({
      license_number: existing?.license_number ?? "",
      issued_date: existing?.issued_date ?? "",
      expires_date: existing?.expires_date ?? "",
    });
  }

  function statusBadge(expires: string) {
    const today = new Date();
    const in90 = new Date(); in90.setDate(in90.getDate() + 90);
    const exp = new Date(expires);
    if (exp < today) return <Badge variant="destructive">Expired</Badge>;
    if (exp < in90) return <Badge className="bg-amber-500 text-white">Expiring soon</Badge>;
    return <Badge className="bg-green-600 text-white">Active</Badge>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><MapPin className="h-7 w-7" /> State Licenses</h1>
          <p className="text-muted-foreground">Manage your licenses and explore new states</p>
        </div>
        <Button variant="outline" className="flex-shrink-0" onClick={() => setNiprOpen(true)}>
          <RefreshCw className="h-4 w-4 mr-2" /> Sync from NIPR
        </Button>
      </div>

      {stats.expiring + stats.expired > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="pt-4 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            {stats.expired > 0 && <span><strong>{stats.expired}</strong> expired</span>}
            {stats.expiring > 0 && <span>· <strong>{stats.expiring}</strong> expiring within 90 days</span>}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Licensed States</div><div className="text-2xl font-bold">{stats.total}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Expiring (90d)</div><div className="text-2xl font-bold text-amber-600">{stats.expiring}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Expired</div><div className="text-2xl font-bold text-destructive">{stats.expired}</div></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input placeholder="Search states..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={tz} onValueChange={setTz}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Timezones</SelectItem>
            <SelectItem value="Eastern">Eastern</SelectItem>
            <SelectItem value="Central">Central</SelectItem>
            <SelectItem value="Mountain">Mountain</SelectItem>
            <SelectItem value="Pacific">Pacific</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="licensed">Licensed First</SelectItem>
            <SelectItem value="name-asc">Name A-Z</SelectItem>
            <SelectItem value="name-desc">Name Z-A</SelectItem>
            <SelectItem value="price">Price Low-High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((s: any) => {
          const stateLics: any[] = licenses.filter((l: any) => l.state_code === s.state_code);
          const isLicensed = stateLics.length > 0;
          return (
            <Card key={s.state_code} className={cn(isLicensed && "border-l-4 border-l-green-500")}>
              <CardContent className="pt-5 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{s.state_name} <span className="text-muted-foreground text-xs">{s.state_code}</span></div>
                  </div>
                  {isLicensed
                    ? statusBadge(stateLics.reduce((best: any, l: any) => {
                        if (!best) return l;
                        return new Date(l.expires_date) > new Date(best.expires_date) ? l : best;
                      }, null)?.expires_date ?? "")
                    : <span className="text-sm font-semibold">${((s.license_fee_cents ?? 0) / 100).toFixed(2)}</span>
                  }
                </div>
                {stateLics.length > 0 && (
                  <div className="rounded bg-muted/50 p-2 text-xs space-y-1.5">
                    {stateLics.map((lic: any, i: number) => (
                      <div key={i} className={cn(i > 0 && "border-t pt-1.5")}>
                        {lic.loa && <div className="font-medium text-primary">{lic.loa}</div>}
                        <div className="text-muted-foreground">LICENSE NUMBER</div>
                        <div className="font-mono">{lic.license_number ?? "—"}</div>
                        <div className="text-muted-foreground mt-0.5">
                          Issued: {lic.issued_date ?? "—"} · Expires: {lic.expires_date ?? "—"}
                        </div>
                        {lic.npn_number && <div className="text-muted-foreground">NPN: {lic.npn_number}</div>}
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> {s.timezone}</div>
                  {s.doi_url && <a href={s.doi_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary"><Globe className="h-3 w-3" /> DOI Website</a>}
                  {s.prelicensing_url && <a href={s.prelicensing_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary"><GraduationCap className="h-3 w-3" /> Pre-Licensing</a>}
                </div>
                <Button size="sm" variant={isLicensed ? "outline" : "default"} className="w-full" onClick={() => openModal(s)}>
                  {isLicensed ? "Edit License" : "+ Add License"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editState} onOpenChange={(v) => !v && setEditState(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editState?.state_name} License</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>License Number</Label><Input value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} /></div>
            <div><Label>Issued Date</Label><Input type="date" value={form.issued_date} onChange={(e) => setForm({ ...form, issued_date: e.target.value })} /></div>
            <div><Label>Expiration Date</Label><Input type="date" value={form.expires_date} onChange={(e) => setForm({ ...form, expires_date: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => mut.mutate({ state_code: editState.state_code, ...form })}
              disabled={!form.license_number || !form.issued_date || !form.expires_date || mut.isPending}
            >Save License</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NiprSyncDialog
        open={niprOpen}
        onClose={() => setNiprOpen(false)}
        onImported={() => qc.invalidateQueries({ queryKey: ["my-licenses"] })}
      />
    </div>
  );
}
