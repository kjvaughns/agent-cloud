import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { getStatesReference, getMyLicenses, upsertLicense } from "@/lib/resources.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Globe, GraduationCap, MapPin, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/resources/state-licenses")({
  head: () => ({ meta: [{ title: "State Licenses — Agent Cloud" }] }),
  component: Page,
});

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

  const licMap = useMemo(() => new Map(licenses.map((l: any) => [l.state_code, l])), [licenses]);

  const stats = useMemo(() => {
    const today = new Date();
    const in90 = new Date(); in90.setDate(in90.getDate() + 90);
    let expiring = 0, expired = 0;
    for (const l of licenses) {
      const exp = new Date((l as any).expires_date);
      if (exp < today) expired++;
      else if (exp < in90) expiring++;
    }
    return { total: licenses.length, expiring, expired };
  }, [licenses]);

  const filtered = useMemo(() => {
    let arr = states.filter((s: any) =>
      (tz === "all" || s.timezone === tz) &&
      (q === "" || s.state_name.toLowerCase().includes(q.toLowerCase()) || s.state_code.toLowerCase().includes(q.toLowerCase()))
    );
    if (sort === "name-asc") arr = [...arr].sort((a: any, b: any) => a.state_name.localeCompare(b.state_name));
    else if (sort === "name-desc") arr = [...arr].sort((a: any, b: any) => b.state_name.localeCompare(a.state_name));
    else if (sort === "price") arr = [...arr].sort((a: any, b: any) => (a.license_fee_cents ?? 0) - (b.license_fee_cents ?? 0));
    else arr = [...arr].sort((a: any, b: any) => {
      const la = licMap.has(a.state_code) ? 0 : 1;
      const lb = licMap.has(b.state_code) ? 0 : 1;
      return la - lb || a.state_name.localeCompare(b.state_name);
    });
    return arr;
  }, [states, q, tz, sort, licMap]);

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
    const existing: any = licMap.get(state.state_code);
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
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><MapPin className="h-7 w-7" /> State Licenses</h1>
        <p className="text-muted-foreground">Manage your licenses and explore new states</p>
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
          const lic: any = licMap.get(s.state_code);
          return (
            <Card key={s.state_code} className={lic ? "border-l-4 border-l-green-500" : ""}>
              <CardContent className="pt-5 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{s.state_name} <span className="text-muted-foreground text-xs">{s.state_code}</span></div>
                  </div>
                  {lic ? statusBadge(lic.expires_date) : <span className="text-sm font-semibold">${((s.license_fee_cents ?? 0) / 100).toFixed(2)}</span>}
                </div>
                {lic && (
                  <div className="rounded bg-muted/50 p-2 text-xs">
                    <div className="text-muted-foreground">LICENSE NUMBER</div>
                    <div className="font-mono">{lic.license_number}</div>
                    <div className="text-muted-foreground mt-1">Issued: {lic.issued_date} · Expires: {lic.expires_date}</div>
                  </div>
                )}
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> {s.timezone}</div>
                  {s.doi_url && <a href={s.doi_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary"><Globe className="h-3 w-3" /> DOI Website</a>}
                  {s.prelicensing_url && <a href={s.prelicensing_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary"><GraduationCap className="h-3 w-3" /> Pre-Licensing</a>}
                </div>
                <Button size="sm" variant={lic ? "outline" : "default"} className="w-full" onClick={() => openModal(s)}>
                  {lic ? "Edit License" : "+ Add License"}
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
    </div>
  );
}
