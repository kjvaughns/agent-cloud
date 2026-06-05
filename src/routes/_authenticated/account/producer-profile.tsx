import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getProducerProfile,
  updateProducerProfile,
  setSsn,
  revealSsn,
  upsertProducerDocument,
  getDocumentSignedUrl,
  signBackgroundDisclosure,
  upsertProducerBanking,
  revealBankingAccount,
  lookupNpnLicenses,
} from "@/lib/account.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, EyeOff, Upload, IdCard, ExternalLink, Download, FileText, CheckCircle2, RefreshCw } from "lucide-react";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { CompLevelEditor } from "@/components/admin/comp-level-editor";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/account/producer-profile")({
  head: () => ({
    meta: [
      { title: "Producer Profile — Agent Cloud" },
      { name: "description", content: "Manage your producer profile, documents, and integrations." },
    ],
  }),
  component: ProducerProfilePage,
});

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const BACKGROUND_QUESTIONS = [
  { id: "felony", text: "Have you ever been convicted of a felony?" },
  { id: "misdemeanor", text: "Have you ever been convicted of any crime other than a minor traffic violation?" },
  { id: "license_action", text: "Have you ever had an insurance license suspended, revoked, or refused in any state?" },
  { id: "regulatory", text: "Have you ever been subject to a regulatory action, fine, or sanction by any state insurance department?" },
  { id: "bankruptcy", text: "Have you filed for bankruptcy within the last 10 years?" },
  { id: "civil_judgment", text: "Do you have any unsatisfied judgments or liens against you?" },
  { id: "terminated", text: "Have you ever been terminated for cause by any insurance company, broker-dealer, or financial institution?" },
  { id: "investigation_pending", text: "Are you currently the subject of any pending investigation by an insurance department, FINRA, or law enforcement?" },
  { id: "restraining_order", text: "Have you ever had a restraining order or injunction entered against you in connection with a financial services business?" },
  { id: "military_discharge", text: "Have you ever been discharged from the military under other than honorable conditions?" },
];

const DOC_CATEGORIES = [
  { type: "government_id", label: "Government ID", note: "Driver's License or Passport" },
  { type: "eo_certificate", label: "E&O Certificate", note: "" },
  { type: "aml_certificate", label: "AML Certificate", note: "" },
  { type: "voided_check", label: "Voided Check", note: "For direct deposit setup" },
  { type: "background_check", label: "Background Check Authorization", note: "" },
  { type: "w9", label: "W-9", note: "" },
  { type: "other", label: "Other", note: "" },
] as const;

function ProducerProfilePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["account", "producerProfile"],
    queryFn: () => getProducerProfile(),
  });

  const profile = data?.profile;
  const documents = data?.documents ?? [];
  const banking = data?.banking;
  const background = data?.background ?? [];
  const agreement = data?.agreement;
  const completion = data?.completion ?? { pct: 0, missing: [] as string[] };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["account", "producerProfile"] });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <IdCard className="h-7 w-7" /> Producer Profile
        </h1>
        <p className="text-muted-foreground mt-1">Your producer record, compliance documents, and account integrations.</p>
      </div>

      {/* Completion meter */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Profile Completion</span>
            <span className="text-muted-foreground font-semibold">{completion.pct}%</span>
          </div>
          <Progress value={completion.pct} className="h-2" />
          {(completion.missing as string[]).length > 0 && (
            <p className="text-xs text-muted-foreground">Missing: {(completion.missing as string[]).join(", ")}</p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="profile">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="flex w-max">
            <TabsTrigger value="profile" className="whitespace-nowrap">Profile Information</TabsTrigger>
            <TabsTrigger value="documents" className="whitespace-nowrap">Documents</TabsTrigger>
            <TabsTrigger value="banking" className="whitespace-nowrap">Banking</TabsTrigger>
            <TabsTrigger value="background" className="whitespace-nowrap">Background Questions</TabsTrigger>
            <TabsTrigger value="integrations" className="whitespace-nowrap">Integrations</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile" className="mt-4 space-y-4">
          <ProfileInfoTab profile={profile} documents={documents} agreement={agreement} onSaved={invalidate} />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DocumentsTab documents={documents} userId={user?.id ?? ""} onSaved={invalidate} />
        </TabsContent>

        <TabsContent value="banking" className="mt-4">
          <BankingTab banking={banking} documents={documents} userId={user?.id ?? ""} onSaved={invalidate} />
        </TabsContent>

        <TabsContent value="background" className="mt-4">
          <BackgroundTab background={background} agreement={agreement} onSaved={invalidate} />
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <IntegrationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────
// Profile Information Tab
// ─────────────────────────────────────────────
function ProfileInfoTab({ profile, documents, agreement, onSaved }: { profile: any; documents: any[]; agreement: any; onSaved: () => void }) {
  const profileFn = useServerFn(updateProducerProfile);
  const { isAdmin, isManager } = useRole();
  const save = (patch: Record<string, unknown>) => {
    profileFn({ data: patch as any }).then(onSaved).catch((e: any) => toast.error(e?.message ?? "Save failed"));
  };

  const eoDoc = documents.find((d: any) => d.doc_type === "eo_certificate");
  const amlDoc = documents.find((d: any) => d.doc_type === "aml_certificate");

  return (
    <div className="space-y-4">
      <PersonalCard profile={profile} onSave={save} />
      <DriversLicenseCard profile={profile} onSave={save} />
      <AddressCard profile={profile} onSave={save} />
      <ContactCard profile={profile} onSave={save} />
      <EoCard doc={eoDoc} onSaved={onSaved} />
      <AmlCard doc={amlDoc} onSaved={onSaved} />
      <UserAccountCard profile={profile} />
      <AgreementCard agreement={agreement} />
      {(isAdmin || isManager) && profile?.id && (
        <Card>
          <CardContent className="pt-5">
            <CompLevelEditor agentId={profile.id} agentName="My Commission Levels" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SaveInput({ label, defaultValue, field, onSave, type = "text", className }: {
  label: string; defaultValue?: string | null; field: string; onSave: (patch: Record<string, unknown>) => void; type?: string; className?: string;
}) {
  const [val, setVal] = useState(defaultValue ?? "");
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { if (val !== (defaultValue ?? "")) onSave({ [field]: val || null }); }}
      />
    </div>
  );
}

function PersonalCard({ profile, onSave }: { profile: any; onSave: (p: Record<string, unknown>) => void }) {
  const [npn, setNpn] = useState(profile?.npn_number ?? "");
  const [showSsn, setShowSsn] = useState(false);
  const [revealedSsn, setRevealedSsn] = useState<string | null>(null);
  const [showSsnModal, setShowSsnModal] = useState(false);
  const [newSsn, setNewSsn] = useState("");
  const revealFn = useServerFn(revealSsn);
  const setSsnFn = useServerFn(setSsn);
  const lookupFn = useServerFn(lookupNpnLicenses);

  const revealMut = useMutation({
    mutationFn: () => revealFn(),
    onSuccess: (res: any) => { setRevealedSsn(res.ssn); setShowSsn(true); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const setSsnMut = useMutation({
    mutationFn: () => setSsnFn({ data: { ssn: newSsn.replace(/\D/g, "") } }),
    onSuccess: () => { toast.success("SSN updated"); setShowSsnModal(false); setNewSsn(""); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const lookupMut = useMutation({
    mutationFn: () => lookupFn({ data: { npn } }),
    onSuccess: (res: any) => toast.success(res.note ?? `NPN ${res.npn} verified`),
    onError: (e: any) => toast.error(e?.message ?? "NPN lookup failed"),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-4">
        <SaveInput label="First Name" defaultValue={profile?.first_name} field="first_name" onSave={onSave} />
        <SaveInput label="Last Name" defaultValue={profile?.last_name} field="last_name" onSave={onSave} />

        <div className="space-y-1.5">
          <Label className="text-xs">NPN Number</Label>
          <div className="flex gap-2">
            <Input value={npn} onChange={(e) => setNpn(e.target.value)} onBlur={() => { if (npn !== (profile?.npn_number ?? "")) onSave({ npn_number: npn }); }} />
            <Button variant="outline" size="sm" onClick={() => lookupMut.mutate()} disabled={lookupMut.isPending || !npn}>
              {lookupMut.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Verify"}
            </Button>
          </div>
        </div>

        <SaveInput label="Date of Birth" defaultValue={profile?.date_of_birth} field="date_of_birth" onSave={onSave} type="date" />

        <div className="space-y-1.5">
          <Label className="text-xs">Gender</Label>
          <Select value={profile?.gender ?? ""} onValueChange={(v) => onSave({ gender: v })}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {["Male","Female","Non-binary","Prefer not to say"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Marital Status</Label>
          <Select value={profile?.marital_status ?? ""} onValueChange={(v) => onSave({ marital_status: v })}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {["Single","Married","Divorced","Widowed"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Social Security Number</Label>
          <div className="flex gap-2">
            <Input readOnly value={showSsn && revealedSsn ? revealedSsn : `***-**-${profile?.ssn_last4 ?? "?????"}`} className="font-mono" />
            <Button variant="outline" size="icon" onClick={() => {
              if (showSsn) { setShowSsn(false); setRevealedSsn(null); }
              else revealMut.mutate();
            }} disabled={revealMut.isPending}>
              {showSsn ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSsnModal(true)}>Update</Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={showSsnModal} onOpenChange={setShowSsnModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update SSN</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter your 9-digit Social Security Number. It will be stored encrypted.</p>
            <Input type="password" value={newSsn} onChange={(e) => setNewSsn(e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="123456789" maxLength={9} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSsnModal(false)}>Cancel</Button>
            <Button disabled={newSsn.length !== 9 || setSsnMut.isPending} onClick={() => setSsnMut.mutate()}>
              {setSsnMut.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DriversLicenseCard({ profile, onSave }: { profile: any; onSave: (p: Record<string, unknown>) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Driver's License</CardTitle></CardHeader>
      <CardContent className="grid sm:grid-cols-3 gap-4">
        <SaveInput label="License Number" defaultValue={profile?.drivers_license_number} field="drivers_license_number" onSave={onSave} />
        <div className="space-y-1.5">
          <Label className="text-xs">State</Label>
          <Select value={profile?.drivers_license_state ?? ""} onValueChange={(v) => onSave({ drivers_license_state: v })}>
            <SelectTrigger><SelectValue placeholder="State..." /></SelectTrigger>
            <SelectContent>{US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <SaveInput label="Expiry Date" defaultValue={profile?.drivers_license_expiry} field="drivers_license_expiry" onSave={onSave} type="date" />
      </CardContent>
    </Card>
  );
}

function AddressCard({ profile, onSave }: { profile: any; onSave: (p: Record<string, unknown>) => void }) {
  const [street, setStreet] = useState(profile?.street_address ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [state, setState] = useState(profile?.state ?? "");
  const [zip, setZip] = useState(profile?.zip_code ?? "");

  return (
    <Card>
      <CardHeader><CardTitle>Home Address</CardTitle></CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Street Address</Label>
          <AddressAutocomplete
            value={street}
            onChange={setStreet}
            onSelect={(p) => {
              setStreet(p.street);
              setCity(p.city);
              setState(p.state);
              setZip(p.zip);
              onSave({ street_address: p.street, city: p.city, state: p.state, zip_code: p.zip });
            }}
            onBlur={() => { if (street !== (profile?.street_address ?? "")) onSave({ street_address: street }); }}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">City</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)}
            onBlur={() => { if (city !== (profile?.city ?? "")) onSave({ city }); }} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">State</Label>
          <Select value={state} onValueChange={(v) => { setState(v); onSave({ state: v }); }}>
            <SelectTrigger><SelectValue placeholder="State..." /></SelectTrigger>
            <SelectContent>{US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">ZIP Code</Label>
          <Input value={zip} onChange={(e) => setZip(e.target.value)}
            onBlur={() => { if (zip !== (profile?.zip_code ?? "")) onSave({ zip_code: zip }); }} />
        </div>
      </CardContent>
    </Card>
  );
}

function ContactCard({ profile, onSave }: { profile: any; onSave: (p: Record<string, unknown>) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-4">
        <SaveInput label="Contact Email" defaultValue={profile?.email} field="email" onSave={onSave} type="email" />
        <SaveInput label="Phone" defaultValue={profile?.phone} field="phone" onSave={onSave} />
      </CardContent>
    </Card>
  );
}

function DocUploadButton({ docType, userId, currentDoc, extraData, onSaved, label = "Upload" }: {
  docType: string; userId: string; currentDoc?: any; extraData?: Record<string, string | null>; onSaved: () => void; label?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const upsertFn = useServerFn(upsertProducerDocument);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);
    try {
      const path = `${userId}/${docType}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from("agent-documents").upload(path, file, { upsert: true });
      if (upErr) throw new Error(upErr.message);
      await upsertFn({ data: { doc_type: docType as any, file_path: path, file_name: file.name, ...extraData } });
      onSaved();
      toast.success("Document uploaded");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <input ref={fileRef} type="file" className="hidden" onChange={handleFile} accept=".pdf,.jpg,.jpeg,.png" />
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
        <Upload className="h-3 w-3 mr-1" /> {uploading ? "Uploading..." : label}
      </Button>
    </>
  );
}

function EoCard({ doc, onSaved }: { doc: any; onSaved: () => void }) {
  const { user } = useAuth();
  const [carrier, setCarrier] = useState(doc?.carrier_name ?? "");
  const [policyNum, setPolicyNum] = useState(doc?.policy_number ?? "");
  const [coverage, setCoverage] = useState(doc?.coverage_amount ?? "");
  const [startDate, setStartDate] = useState(doc?.start_date ?? "");
  const [expDate, setExpDate] = useState(doc?.expiration_date ?? "");
  const upsertFn = useServerFn(upsertProducerDocument);

  function saveMetadata(patch: Record<string, string | null>) {
    upsertFn({ data: {
      doc_type: "eo_certificate",
      carrier_name: carrier, policy_number: policyNum, coverage_amount: coverage,
      start_date: startDate || null, expiration_date: expDate || null,
      ...patch,
    } as any }).then(onSaved).catch((e: any) => toast.error(e?.message ?? "Save failed"));
  }

  const dlFn = useServerFn(getDocumentSignedUrl);
  const download = () => {
    if (!doc?.id) return;
    dlFn({ data: { doc_id: doc.id } }).then((r: any) => window.open(r.url, "_blank")).catch((e: any) => toast.error(e?.message));
  };

  return (
    <Card>
      <CardHeader><CardTitle>E&O Insurance</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Carrier Name</Label>
            <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} onBlur={() => saveMetadata({ carrier_name: carrier || null })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Policy Number</Label>
            <Input value={policyNum} onChange={(e) => setPolicyNum(e.target.value)} onBlur={() => saveMetadata({ policy_number: policyNum || null })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Effective Date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onBlur={() => saveMetadata({ start_date: startDate || null })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Expiration Date</Label>
            <Input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} onBlur={() => saveMetadata({ expiration_date: expDate || null })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Coverage Amount</Label>
            <Input value={coverage} onChange={(e) => setCoverage(e.target.value)} onBlur={() => saveMetadata({ coverage_amount: coverage || null })} placeholder="e.g. $1,000,000" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DocUploadButton docType="eo_certificate" userId={user?.id ?? ""} currentDoc={doc} extraData={{ carrier_name: carrier || null, policy_number: policyNum || null, coverage_amount: coverage || null, start_date: startDate || null, expiration_date: expDate || null }} onSaved={onSaved} label="Upload Certificate (PDF)" />
          {doc?.file_name && (
            <button onClick={download} className="text-xs text-primary flex items-center gap-1 hover:underline">
              <FileText className="h-3 w-3" /> {doc.file_name}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AmlCard({ doc, onSaved }: { doc: any; onSaved: () => void }) {
  const { user } = useAuth();
  const [provider, setProvider] = useState(doc?.provider_name ?? "");
  const [certNum, setCertNum] = useState(doc?.certificate_number ?? "");
  const [completionDate, setCompletionDate] = useState(doc?.start_date ?? "");
  const upsertFn = useServerFn(upsertProducerDocument);

  function saveMetadata(patch: Record<string, string | null>) {
    upsertFn({ data: {
      doc_type: "aml_certificate",
      provider_name: provider, certificate_number: certNum, start_date: completionDate || null,
      ...patch,
    } as any }).then(onSaved).catch((e: any) => toast.error(e?.message ?? "Save failed"));
  }

  const dlFn = useServerFn(getDocumentSignedUrl);
  const download = () => {
    if (!doc?.id) return;
    dlFn({ data: { doc_id: doc.id } }).then((r: any) => window.open(r.url, "_blank")).catch((e: any) => toast.error(e?.message));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>AML Training</CardTitle>
          <a href="https://www.limra.com/en/learning-development/courses-and-programs/aml-training/" target="_blank" rel="noreferrer"
            className="text-xs text-primary flex items-center gap-1 hover:underline">
            Complete for free <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Annual anti-money-laundering training, required by most carriers.</p>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Completion Date</Label>
            <Input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} onBlur={() => saveMetadata({ start_date: completionDate || null })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Provider</Label>
            <Input value={provider} onChange={(e) => setProvider(e.target.value)} onBlur={() => saveMetadata({ provider_name: provider || null })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Certificate Number</Label>
            <Input value={certNum} onChange={(e) => setCertNum(e.target.value)} onBlur={() => saveMetadata({ certificate_number: certNum || null })} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DocUploadButton docType="aml_certificate" userId={user?.id ?? ""} currentDoc={doc} extraData={{ provider_name: provider || null, certificate_number: certNum || null, start_date: completionDate || null }} onSaved={onSaved} label="Upload Certificate" />
          {doc?.file_name && (
            <button onClick={download} className="text-xs text-primary flex items-center gap-1 hover:underline">
              <FileText className="h-3 w-3" /> {doc.file_name}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function UserAccountCard({ profile }: { profile: any }) {
  return (
    <Card>
      <CardHeader><CardTitle>User Account</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <strong>Login Email vs Contact Email:</strong> Your login email is the credential you sign in with. Changing your contact email above does NOT change your login email.
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Login Email</Label>
            <Input value={profile?.email ?? ""} readOnly className="bg-muted" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Password</Label>
            <Button variant="outline" className="w-full justify-start">Change Password</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AgreementCard({ agreement }: { agreement: any }) {
  if (!agreement) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Signed Producer Agreement</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Signature</span><span className="font-medium">{agreement.signature_name}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Signed Date</span><span>{agreement.signed_date ? new Date(agreement.signed_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span>{agreement.agreement_version}</span></div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// Documents Tab
// ─────────────────────────────────────────────
function DocumentsTab({ documents, userId, onSaved }: { documents: any[]; userId: string; onSaved: () => void }) {
  const dlFn = useServerFn(getDocumentSignedUrl);

  function download(doc: any) {
    dlFn({ data: { doc_id: doc.id } })
      .then((r: any) => window.open(r.url, "_blank"))
      .catch((e: any) => toast.error(e?.message));
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {DOC_CATEGORIES.map(({ type, label, note }) => {
            const doc = documents.find((d: any) => d.doc_type === type);
            return (
              <div key={type} className="flex items-center gap-4 p-4">
                <div className="h-10 w-10 rounded-lg bg-muted grid place-items-center shrink-0">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{label}</div>
                  {note && <div className="text-xs text-muted-foreground">{note}</div>}
                  {doc?.file_name && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {doc.file_name} · {new Date(doc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {doc && (
                    <Button size="sm" variant="ghost" onClick={() => download(doc)}>
                      <Download className="h-3.5 w-3.5 mr-1" /> Download
                    </Button>
                  )}
                  <DocUploadButton
                    docType={type}
                    userId={userId}
                    currentDoc={doc}
                    onSaved={onSaved}
                    label={doc ? "Replace" : "Upload"}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// Banking Tab
// ─────────────────────────────────────────────
function BankingTab({ banking, documents, userId, onSaved }: { banking: any; documents: any[]; userId: string; onSaved: () => void }) {
  const [bankName, setBankName] = useState(banking?.bank_name ?? "");
  const [accountType, setAccountType] = useState(banking?.account_type ?? "checking");
  const [routing, setRouting] = useState(banking?.routing_number ?? "");
  const [showAcct, setShowAcct] = useState(false);
  const [revealedAcct, setRevealedAcct] = useState<string | null>(null);
  const [newAcctOpen, setNewAcctOpen] = useState(false);
  const [newAcct, setNewAcct] = useState("");

  const upsertFn = useServerFn(upsertProducerBanking);
  const revealFn = useServerFn(revealBankingAccount);

  function save(patch: Record<string, unknown>) {
    upsertFn({ data: patch as any }).then(onSaved).catch((e: any) => toast.error(e?.message ?? "Save failed"));
  }

  const revealMut = useMutation({
    mutationFn: () => revealFn(),
    onSuccess: (res: any) => { setRevealedAcct(res.account_number); setShowAcct(true); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const setAcctMut = useMutation({
    mutationFn: () => upsertFn({ data: {
      account_number_encrypted: newAcct,
      account_last4: newAcct.slice(-4),
    }}),
    onSuccess: () => { toast.success("Account number saved"); setNewAcctOpen(false); setNewAcct(""); onSaved(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const voidedCheck = documents.find((d: any) => d.doc_type === "voided_check");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-sm">
        Direct deposit info is used for commission payments. Keep this current.
      </div>

      <Card>
        <CardHeader><CardTitle>Direct Deposit Information</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Bank Name</Label>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)}
              onBlur={() => { if (bankName !== (banking?.bank_name ?? "")) save({ bank_name: bankName || null }); }} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Account Type</Label>
            <Select value={accountType} onValueChange={(v) => { setAccountType(v); save({ account_type: v }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="checking">Checking</SelectItem>
                <SelectItem value="savings">Savings</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Routing Number</Label>
            <Input value={routing} onChange={(e) => setRouting(e.target.value.replace(/\D/g, "").slice(0, 9))}
              onBlur={() => { if (routing !== (banking?.routing_number ?? "")) save({ routing_number: routing || null }); }} placeholder="9 digits" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Account Number</Label>
            <div className="flex gap-2">
              <Input readOnly value={showAcct && revealedAcct ? revealedAcct : `****${banking?.account_last4 ?? "????"}`} className="font-mono" />
              <Button variant="outline" size="icon" onClick={() => {
                if (showAcct) { setShowAcct(false); setRevealedAcct(null); }
                else revealMut.mutate();
              }} disabled={revealMut.isPending || !banking?.account_last4}>
                {showAcct ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setNewAcctOpen(true)}>Update</Button>
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Voided Check</Label>
            {voidedCheck ? (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>{voidedCheck.file_name}</span>
                <DocUploadButton docType="voided_check" userId={userId} currentDoc={voidedCheck} onSaved={onSaved} label="Replace" />
              </div>
            ) : (
              <DocUploadButton docType="voided_check" userId={userId} onSaved={onSaved} label="Upload Voided Check" />
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={newAcctOpen} onOpenChange={setNewAcctOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Account Number</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter your full account number.</p>
            <Input type="password" value={newAcct} onChange={(e) => setNewAcct(e.target.value.replace(/\D/g, ""))} placeholder="Account number" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewAcctOpen(false)}>Cancel</Button>
            <Button disabled={newAcct.length < 4 || setAcctMut.isPending} onClick={() => setAcctMut.mutate()}>
              {setAcctMut.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────
// Background Questions Tab
// ─────────────────────────────────────────────
function BackgroundTab({ background, agreement, onSaved }: { background: any[]; agreement: any; onSaved: () => void }) {
  type AnswerState = { answer: boolean | null; explanation: string };
  const initial: Record<number, AnswerState> = {};
  for (let i = 1; i <= BACKGROUND_QUESTIONS.length; i++) {
    const existing = background.find((b: any) => b.question_number === i);
    initial[i] = { answer: existing ? existing.answer : null, explanation: existing?.explanation ?? "" };
  }
  const [answers, setAnswers] = useState<Record<number, AnswerState>>(initial);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sigName, setSigName] = useState("");
  const [agreed, setAgreed] = useState(false);

  const signFn = useServerFn(signBackgroundDisclosure);
  const signMut = useMutation({
    mutationFn: () => signFn({
      data: {
        answers: Object.entries(answers)
          .filter(([, v]) => v.answer !== null)
          .map(([k, v]) => ({ question_number: Number(k), answer: v.answer as boolean, explanation: v.explanation || null })),
        signature_name: sigName,
      },
    }),
    onSuccess: () => { toast.success("Background disclosure signed"); setReviewOpen(false); onSaved(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const bgAgreement = agreement?.agreement_version === "background_v1" ? agreement : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Standard insurance producer background disclosure questions. Carriers will request these during contracting.</p>

          {BACKGROUND_QUESTIONS.map((q, i) => {
            const qNum = i + 1;
            const ans = answers[qNum];
            return (
              <div key={q.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-xs font-medium text-muted-foreground mt-0.5 shrink-0">{qNum}.</span>
                  <span className="text-sm flex-1">{q.text}</span>
                </div>
                <div className="flex gap-2 ml-5">
                  <Button
                    size="sm"
                    variant={ans.answer === true ? "default" : "outline"}
                    className={ans.answer === true ? "bg-red-600 hover:bg-red-700 border-red-600" : ""}
                    onClick={() => setAnswers(prev => ({ ...prev, [qNum]: { ...prev[qNum], answer: true } }))}
                  >Yes</Button>
                  <Button
                    size="sm"
                    variant={ans.answer === false ? "default" : "outline"}
                    className={ans.answer === false ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600" : ""}
                    onClick={() => setAnswers(prev => ({ ...prev, [qNum]: { ...prev[qNum], answer: false } }))}
                  >No</Button>
                </div>
                {ans.answer === true && (
                  <div className="ml-5">
                    <Textarea
                      placeholder="Please explain..."
                      value={ans.explanation}
                      onChange={(e) => setAnswers(prev => ({ ...prev, [qNum]: { ...prev[qNum], explanation: e.target.value.slice(0, 2000) } }))}
                      rows={2}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {bgAgreement && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300 p-3 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Signed by {bgAgreement.signature_name} on {new Date(bgAgreement.signed_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          )}

          <div className="border-t pt-4 space-y-3">
            <p className="text-xs text-muted-foreground">By signing below, I certify that the answers above are true and complete to the best of my knowledge. I understand that any misrepresentation may result in termination of my contract.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Full Legal Name *</Label>
                <Input value={sigName} onChange={(e) => setSigName(e.target.value)} placeholder="Your full legal name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input readOnly value={new Date().toLocaleDateString()} />
              </div>
            </div>
            <Button
              onClick={() => setReviewOpen(true)}
              disabled={Object.values(answers).some(a => a.answer === null) || sigName.trim().length < 2}
            >
              Review & Sign
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader><DialogTitle>Background Disclosure Review</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-auto space-y-3 py-2">
            {BACKGROUND_QUESTIONS.map((q, i) => {
              const qNum = i + 1;
              const ans = answers[qNum];
              return (
                <div key={q.id} className="space-y-1">
                  <p className="text-sm font-medium">{qNum}. {q.text}</p>
                  <p className={cn("text-sm font-semibold", ans.answer ? "text-red-600" : "text-emerald-600")}>
                    {ans.answer ? "Yes" : "No"}
                  </p>
                  {ans.answer && ans.explanation && <p className="text-sm text-muted-foreground italic">{ans.explanation}</p>}
                </div>
              );
            })}
          </div>
          <div className="border-t pt-4 space-y-3">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
              <span>I confirm these answers are accurate and complete to the best of my knowledge.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button disabled={!agreed || signMut.isPending} onClick={() => signMut.mutate()}>
              {signMut.isPending ? "Signing..." : "Submit & Sign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────
// Integrations Tab
// ─────────────────────────────────────────────
function IntegrationsTab() {
  return (
    <Card>
      <CardContent className="p-6 grid sm:grid-cols-2 gap-3">
        {["Google Calendar", "Outlook Calendar", "Zapier", "HubSpot CRM", "Salesforce", "Mailchimp"].map((s) => (
          <div key={s} className="flex items-center justify-between p-3 border rounded-lg">
            <span className="font-medium text-sm">{s}</span>
            <Button size="sm" variant="outline">Connect</Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
