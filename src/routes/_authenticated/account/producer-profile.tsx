import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import {
  getProducerProfile,
  updateProducerProfile,
  upsertProducerDocument,
  getDocumentSignedUrl,
  signBackgroundDisclosure,
  lookupNpnLicenses,
} from "@/lib/account.functions";
import { checkAgentSyncStatus, syncAgentByNpn } from "@/lib/agentsync.functions";
import { readProducerDocument } from "@/lib/document-intake.functions";
import { extractDocument } from "@/lib/document-extract";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, EyeOff, Upload, IdCard, ExternalLink, Download, FileText, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
import { ContractingProfileTab } from "@/components/contracting/producer-profile-tab";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { CompLevelEditor } from "@/components/admin/comp-level-editor";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NpnLookupLink } from "@/components/npn-lookup-link";
import { PageShell, HeroBand } from "@/components/page-shell";
import { BACKGROUND_QUESTIONS } from "@/lib/producer/background-questions";
import { saveMySsn } from "@/lib/producer-file.functions";

export const Route = createFileRoute("/_authenticated/account/producer-profile")({
  head: () => ({
    meta: [
      { title: "Producer Profile — Agent Cloud" },
      { name: "description", content: "Manage your producer profile, documents, and integrations." },
    ],
  }),
  // Lets the "Next" action, and links from elsewhere, land on the tab that
  // actually contains the field being asked for.
  validateSearch: (s: Record<string, unknown>): { tab?: ProfileTab } =>
    PROFILE_TABS.includes(s.tab as ProfileTab) ? { tab: s.tab as ProfileTab } : {},
  component: ProducerProfilePage,
});

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const PROFILE_TABS = [
  "profile", "contracting", "documents", "background", "integrations",
] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

/**
 * Where each outstanding item is actually fixed.
 *
 * Keyed on the labels agent_completion() returns, so there is one definition
 * of what is missing rather than a second list here that can drift from it.
 * An unrecognised label falls back to the profile tab, which is where a new
 * field would most likely live.
 */
const FIX_LOCATION: Record<string, { tab: ProfileTab; action: string }> = {
  "Personal details":  { tab: "profile",   action: "Add your details" },
  "NPN Number":        { tab: "profile",   action: "Add your NPN" },
  "Home address":      { tab: "profile",   action: "Add your address" },
  "E&O Certificate":   { tab: "documents", action: "Upload it" },
  "AML Certificate":   { tab: "documents", action: "Upload it" },
};

/** Why each item is worth having here — useful, never a precondition. */
const WHY: Record<string, string> = {
  "Personal details":  "Carriers contract your legal name. Keeping it here means every packet is pre-filled.",
  "NPN Number":        "Your National Producer Number identifies you to every carrier and to NIPR.",
  "Home address":      "Appointment paperwork is filed against your residential address.",
  "E&O Certificate":   "Carriers ask for current errors-and-omissions cover when they appoint you.",
  "AML Certificate":   "Carriers ask for anti-money-laundering training before annuity business.",
};



// The names here are the ones the contracting review queue understands —
// `DOCUMENT_REQUIREMENTS` in `@/lib/contracting-ops/types`. They used to be a
// second, private vocabulary: `background_check` and `other` are not keys in
// that dictionary, so a reviewer saw them as raw strings, and `pdb_report` was
// missing entirely — the queue lists it first and there was no way to upload it.
/**
 * The documents this profile can hold.
 *
 * No Government ID and no Voided Check, and no setting to bring them back.
 * Agent Cloud does not submit contracting paperwork to carriers — SureLC and
 * NIPR do — so it has no reason to hold a photograph of somebody's driving
 * licence or their bank details, and no business being the place those
 * accumulate.
 */
const DOC_CATEGORIES = [
  { type: "pdb_report", label: "PDB Report", note: "Producer Database report from NIPR" },
  { type: "eo_certificate", label: "E&O Certificate", note: "" },
  { type: "aml_certificate", label: "AML Certificate", note: "" },
  { type: "background_questionnaire", label: "Background Questionnaire", note: "" },
  { type: "w9", label: "W-9", note: "" },
  { type: "other_document", label: "Other", note: "" },
] as const;

function ProducerProfilePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const search = Route.useSearch();
  const initial = search.tab;
  const [tab, setTabRaw] = useState<ProfileTab>(initial === "contracting" || initial === "documents" || initial === "background" || !initial ? "profile" : initial);
  const setTab = (t: ProfileTab) => {
    if (t === "contracting" || t === "documents" || t === "background" || t === "profile") {
      setTabRaw("profile");
      const id = t === "contracting" ? "pp-contracting" : t === "documents" ? "pp-eo-aml" : t === "background" ? "pp-background" : "pp-personal";
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } else setTabRaw(t);
  };
  useEffect(() => {
    if (initial === "contracting" || initial === "documents" || initial === "background") setTab(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { data, isLoading } = useQuery({
    queryKey: ["account", "producerProfile"],
    queryFn: () => getProducerProfile(),
  });

  const profile = data?.profile;
  const documents = data?.documents ?? [];

  const background = data?.background ?? [];
  const agreement = data?.agreement;
  const completion = data?.completion ?? { pct: 0, missing: [] as string[] };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["account", "producerProfile"] });

  if (isLoading) {
    return (
      <PageShell>
        <div className="max-w-5xl mx-auto space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-64" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-5xl mx-auto space-y-6">
      <HeroBand
        title={<span className="flex items-center gap-2"><IdCard className="h-7 w-7" /> Producer Profile</span>}
        subtitle="Your producer record, compliance documents, and account integrations."
      />

      <NextStep
        pct={completion.pct}
        missing={completion.missing as string[]}
        onGo={setTab}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as ProfileTab)}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="flex w-max">
            <TabsTrigger value="profile" className="whitespace-nowrap">Producer Profile</TabsTrigger>
            <TabsTrigger value="integrations" className="whitespace-nowrap">Integrations</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile" className="mt-4 space-y-4">
          <ProfileInfoTab profile={profile} documents={documents} agreement={agreement} onSaved={invalidate} />
          <section id="pp-contracting" className="scroll-mt-24 space-y-2">
            <h2 className="text-lg font-semibold">Licensing &amp; contracting</h2>
            <ContractingProfileTab />
          </section>
          <section id="pp-documents" className="scroll-mt-24 space-y-2">
            <h2 className="text-lg font-semibold">Other documents</h2>
            <DocumentsTab documents={documents} userId={user?.id ?? ""} onSaved={invalidate} />
          </section>
          <section id="pp-background" className="scroll-mt-24 space-y-2">
            <h2 className="text-lg font-semibold">Background questions &amp; signature</h2>
            <BackgroundTab background={background} agreement={agreement} onSaved={invalidate} />
                </section>
        </TabsContent>


        <TabsContent value="integrations" className="mt-4">
          <IntegrationsTab />
        </TabsContent>
      </Tabs>
      </div>
    </PageShell>
  );
}

// ─────────────────────────────────────────────
// Next step
// ─────────────────────────────────────────────

/**
 * One thing to do, and the score.
 *
 * This page holds forty-odd fields across six tabs. Showing every outstanding
 * item at once told you the size of the job without telling you where to
 * start, which is the part that makes people close the tab.
 *
 * So: the next item, why it matters, and a button that goes to the tab
 * containing it. The rest stays available behind a disclosure — hidden, not
 * removed, because somebody who wants to work through all of them should be
 * able to see the list.
 *
 * The percentage stays. People like knowing how far along they are; the
 * problem was never the number, it was that the number came with a wall.
 */
function NextStep({
  pct, missing, onGo,
}: {
  pct: number;
  missing: string[];
  onGo: (tab: ProfileTab) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  if (missing.length === 0) {
    return (
      <Card className="border-2 border-success/30">
        <CardContent className="flex items-center gap-2.5 p-5">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <div>
            <div className="text-sm font-semibold">
              Your profile is complete — you're fully set up for contracting.
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Everything carriers ask for is on file.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const next = missing[0];
  const where = FIX_LOCATION[next] ?? { tab: "profile" as ProfileTab, action: "Go to it" };
  const rest = missing.slice(1);

  return (
    <Card className="border-2 border-primary/30">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
              Suggested next
            </div>
            <div className="mt-1 text-base font-bold">{next}</div>
            <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {WHY[next] ?? "Worth keeping here so you only ever type it once."}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Nothing here is required — the rest of Agent Cloud is open either way.
            </div>
            <Button size="sm" className="mt-3" onClick={() => onGo(where.tab)}>
              {where.action}
            </Button>
          </div>
          <div className="shrink-0 text-right">
            <div className="tnum text-3xl font-bold text-foreground">{pct}%</div>
            <div className="text-xs text-muted-foreground">
              {missing.length} to go
            </div>
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>

        {rest.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {showAll ? "Hide the rest" : `Show the other ${rest.length}`}
            </button>

            {showAll && (
              <ul className="mt-2 space-y-1">
                {rest.map((item) => {
                  const w = FIX_LOCATION[item] ?? { tab: "profile" as ProfileTab, action: "Go to it" };
                  return (
                    <li key={item} className="flex items-center gap-2 text-sm">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                      <span className="min-w-0 flex-1 truncate">{item}</span>
                      <button
                        type="button"
                        onClick={() => onGo(w.tab)}
                        className="shrink-0 text-xs font-medium text-primary hover:underline"
                      >
                        {w.action}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
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
      <div id="pp-personal" className="scroll-mt-24 space-y-4">
        <PersonalCard profile={profile} onSave={save} />
        <AddressCard profile={profile} onSave={save} />
        <ContactCard profile={profile} onSave={save} />
      </div>
      <IdentityCard profile={profile} documents={documents} onSave={save} onSaved={onSaved} />
      <section id="pp-eo-aml" className="scroll-mt-24 space-y-4">
        <SureLcCard />
        <EoCard doc={eoDoc} onSaved={onSaved} />
        <AmlCard doc={amlDoc} onSaved={onSaved} />
      </section>
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
  const [syncing, setSyncing] = useState(false);
  const lookupFn = useServerFn(lookupNpnLicenses);
  const checkFn = useServerFn(checkAgentSyncStatus);
  const agentSyncFn = useServerFn(syncAgentByNpn);

  const { data: asStatus } = useQuery({
    queryKey: ["agentsync-status"],
    queryFn: () => checkFn(),
    staleTime: 60 * 60 * 1000,
  });
  const agentSyncAvailable = asStatus?.available ?? false;

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
            {agentSyncAvailable ? (
              <Button
                variant="outline"
                size="sm"
                disabled={syncing || !npn}
                onClick={async () => {
                  setSyncing(true);
                  try {
                    const res = await agentSyncFn({ data: { npn } });
                    if (res.has_regulatory_flag) {
                      toast.warning(`Synced ${res.licenses_imported} licenses — regulatory actions on file.`);
                    } else {
                      toast.success(`Synced ${res.licenses_imported} licenses across ${res.states_covered.length} states`);
                    }
                  } catch (e: any) {
                    toast.error(e.message ?? "Sync failed");
                  } finally {
                    setSyncing(false);
                  }
                }}
              >
                {syncing ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Sync"}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => lookupMut.mutate()} disabled={lookupMut.isPending || !npn}>
                {lookupMut.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Verify"}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <NpnLookupLink />
          </div>
          {!agentSyncAvailable && (
            <p className="text-xs text-muted-foreground">Verify pulls basic NPN info from NIPR. For full license import, use Licensing → Sync from NIPR.</p>
          )}
        </div>

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

/**
 * Upload a document, and let the document fill in its own fields.
 *
 * The carrier, the policy number, the expiry — all of it is printed on the
 * certificate being uploaded, and asking somebody to retype it is why these
 * fields sit empty. So after the file is stored we read it (text layer first,
 * page images only for scans), ask the model for the handful of fields this
 * card holds, and save whatever came back.
 *
 * Reading is strictly a bonus. If it fails, or finds nothing, the document is
 * already saved and the fields stay as the agent left them — an upload never
 * fails because the reader could not make sense of the file. Anything typed by
 * hand wins over anything read, because the person is right.
 */
function DocUploadButton({ docType, userId, currentDoc, extraData, onSaved, onExtracted, label = "Upload" }: {
  docType: string; userId: string; currentDoc?: any; extraData?: Record<string, string | null>;
  onSaved: () => void; onExtracted?: (fields: Record<string, string | null>) => void; label?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState(false);
  const upsertFn = useServerFn(upsertProducerDocument);
  const readFn = useServerFn(readProducerDocument);

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
      setUploading(false);

      // Read it. Anything the agent already typed stays; only blanks get filled.
      setReading(true);
      try {
        const doc = await extractDocument(file, { prefer: "text", maxPages: 4 });
        const found: any = await readFn({
          data: {
            doc_type: docType as any,
            text: doc.text || null,
            images: doc.images?.length ? doc.images.slice(0, 4) : null,
          },
        });
        const fill: Record<string, string | null> = {};
        for (const [k, v] of Object.entries(found ?? {})) {
          if (typeof v === "string" && v && !extraData?.[k]) fill[k] = v;
        }
        if (Object.keys(fill).length > 0) {
          await upsertFn({ data: { doc_type: docType as any, ...extraData, ...fill } as any });
          onExtracted?.(fill);
          onSaved();
          toast.success("Filled in what we could read — worth a quick check.");
        }
      } catch {
        // Silent on purpose: the upload succeeded, which is what was asked for.
      } finally {
        setReading(false);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
      setUploading(false);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <input ref={fileRef} type="file" className="hidden" onChange={handleFile} accept=".pdf,.jpg,.jpeg,.png" />
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading || reading}>
        <Upload className="h-3 w-3 mr-1" />
        {uploading ? "Uploading..." : reading ? "Reading..." : label}
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
          <DocUploadButton docType="eo_certificate" userId={user?.id ?? ""} currentDoc={doc} extraData={{ carrier_name: carrier || null, policy_number: policyNum || null, coverage_amount: coverage || null, start_date: startDate || null, expiration_date: expDate || null }} onSaved={onSaved} label="Upload Certificate (PDF)"
            onExtracted={(f) => {
              if (f.carrier_name) setCarrier(f.carrier_name);
              if (f.policy_number) setPolicyNum(f.policy_number);
              if (f.coverage_amount) setCoverage(f.coverage_amount);
              if (f.start_date) setStartDate(f.start_date);
              if (f.expiration_date) setExpDate(f.expiration_date);
            }} />
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
          <div className="min-w-0 space-y-1.5">
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
          <DocUploadButton docType="aml_certificate" userId={user?.id ?? ""} currentDoc={doc} extraData={{ provider_name: provider || null, certificate_number: certNum || null, start_date: completionDate || null }} onSaved={onSaved} label="Upload Certificate"
            onExtracted={(f) => {
              if (f.provider_name) setProvider(f.provider_name);
              if (f.certificate_number) setCertNum(f.certificate_number);
              if (f.start_date) setCompletionDate(f.start_date);
            }} />
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
        <div className="rounded-lg bg-surface-2 p-3 text-sm">
          <strong>Login Email vs Contact Email:</strong> Your login email is the credential you sign in with. Changing your contact email above does NOT change your login email.
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Login Email</Label>
            <Input value={profile?.email ?? ""} readOnly className="bg-muted" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Password</Label>
            {/* Had no onClick at all. Security is where the password and MFA
                already live, so this goes there rather than growing a second
                implementation of the same form. */}
            <Button asChild variant="outline" className="w-full justify-start">
              <Link to="/settings/security">Change password</Link>
            </Button>
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
        <div className="rounded-lg border border-dashed border-border p-4"><div className="text-xs text-muted-foreground">Signature</div><div className="font-serif text-2xl italic">{agreement.signature_name}</div></div>
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
          {DOC_CATEGORIES.filter((c) => c.type !== "eo_certificate" && c.type !== "aml_certificate").map(({ type, label, note }) => {
            const doc = documents.find((d: any) => d.doc_type === type);
            return (
              <div key={type} className="flex items-center gap-4 p-4">
                <div className="h-10 w-10 rounded-lg bg-surface-2 grid place-items-center shrink-0">
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
                    className={ans.answer === true ? "bg-destructive hover:bg-destructive border-destructive" : ""}
                    onClick={() => setAnswers(prev => ({ ...prev, [qNum]: { ...prev[qNum], answer: true } }))}
                  >Yes</Button>
                  <Button
                    size="sm"
                    variant={ans.answer === false ? "default" : "outline"}
                    className={ans.answer === false ? "bg-success hover:bg-success border-success" : ""}
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
            <div className="flex items-center gap-2 text-sm text-success p-3 rounded-lg bg-success/10">
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
                  <p className={cn("text-sm font-semibold", ans.answer ? "text-destructive" : "text-success")}>
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
/**
 * Six integrations, none of them built.
 *
 * This rendered Google Calendar, Outlook, Zapier, HubSpot, Salesforce and
 * Mailchimp, each with a Connect button that had no handler — so clicking any
 * of them did nothing, silently, forever. A button that does nothing is worse
 * than an empty state: it tells somebody the feature exists and that they
 * failed to use it.
 *
 * What does exist is named, and the rest is stated as the roadmap it is.
 */
function IntegrationsTab() {
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h3 className="text-sm font-semibold">What's connected today</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your agency's integrations are set up once for everybody, not per agent —
            an admin manages them in Settings → Agency.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link to="/settings/agency" search={{ tab: "integrations" } as any}>
              Open agency integrations
            </Link>
          </Button>
        </div>
        <div className="rounded-lg border border-border bg-surface-2/40 p-3">
          <p className="text-xs text-muted-foreground">
            Calendar, Zapier and CRM connections are not built yet. When they are, they
            will appear here rather than as buttons that do nothing.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// Identity: DOB, gender, SSN, driver's license
// ─────────────────────────────────────────────
function IdentityCard({ profile, documents, onSave, onSaved }: { profile: any; documents: any[]; onSave: (p: Record<string, unknown>) => void; onSaved: () => void }) {
  const { user } = useAuth();
  const ssnFn = useServerFn(saveMySsn);
  const [ssn, setSsn] = useState("");
  const [editingSsn, setEditingSsn] = useState(!profile?.ssn_last4);
  const [savingSsn, setSavingSsn] = useState(false);
  const [f, setF] = useState({
    date_of_birth: profile?.date_of_birth ?? "",
    gender: profile?.gender ?? "",
    drivers_license_number: profile?.drivers_license_number ?? "",
    drivers_license_state: profile?.drivers_license_state ?? "",
    drivers_license_expiry: profile?.drivers_license_expiry ?? "",
  });
  const front = documents.find((d: any) => d.doc_type === "drivers_license_front");
  const back = documents.find((d: any) => d.doc_type === "drivers_license_back");

  async function saveSsn() {
    setSavingSsn(true);
    try {
      await ssnFn({ data: { ssn } });
      setSsn(""); setEditingSsn(false); onSaved(); toast.success("SSN saved securely");
    } catch (e: any) { toast.error(e?.message ?? "Couldn't save SSN"); }
    finally { setSavingSsn(false); }
  }

  return (
    <Card id="pp-identity" className="scroll-mt-24">
      <CardHeader><CardTitle>Identity</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Date of birth</Label>
            <Input type="date" value={f.date_of_birth} onChange={(e) => setF({ ...f, date_of_birth: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Gender</Label>
            <Select value={f.gender || undefined} onValueChange={(v) => setF({ ...f, gender: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Social Security number</Label>
          {editingSsn ? (
            <div className="flex gap-2">
              <Input inputMode="numeric" autoComplete="off" placeholder="123-45-6789" value={ssn} onChange={(e) => setSsn(e.target.value)} className="max-w-xs" />
              <Button size="sm" onClick={saveSsn} disabled={savingSsn || ssn.replace(/\D/g, "").length !== 9}>{savingSsn ? "Saving…" : "Save SSN"}</Button>
              {profile?.ssn_last4 && <Button size="sm" variant="ghost" onClick={() => setEditingSsn(false)}>Cancel</Button>}
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <span className="font-mono">•••-••-{profile?.ssn_last4}</span>
              <Button size="sm" variant="outline" onClick={() => setEditingSsn(true)}>Replace</Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Encrypted. Only your agency's contracting team can view it.</p>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Driver's license</div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">License number</Label>
              <Input value={f.drivers_license_number} onChange={(e) => setF({ ...f, drivers_license_number: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Issuing state</Label>
              <Select value={f.drivers_license_state || undefined} onValueChange={(v) => setF({ ...f, drivers_license_state: v })}>
                <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                <SelectContent>{US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expiration date</Label>
              <Input type="date" value={f.drivers_license_expiry} onChange={(e) => setF({ ...f, drivers_license_expiry: e.target.value })} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <LicensePhoto label="Front of license" docType="drivers_license_front" doc={front} userId={user?.id ?? ""} onSaved={onSaved} />
            <LicensePhoto label="Back of license" docType="drivers_license_back" doc={back} userId={user?.id ?? ""} onSaved={onSaved} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onSave(f); toast.success("Identity saved"); }}>Save identity</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LicensePhoto({ label, docType, doc, userId, onSaved }: { label: string; docType: string; doc?: any; userId: string; onSaved: () => void }) {
  const dlFn = useServerFn(getDocumentSignedUrl);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!doc?.id || !doc?.file_url) { setPreview(null); return; }
    dlFn({ data: { doc_id: doc.id } }).then((r: any) => setPreview(r.url)).catch(() => setPreview(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, doc?.file_url]);
  const isPdf = (doc?.file_name ?? "").toLowerCase().endsWith(".pdf");
  return (
    <div className="rounded-xl border border-dashed border-border p-3 space-y-2">
      <div className="text-xs font-medium">{label}</div>
      <div className="aspect-[1.6] rounded-lg bg-surface-2 grid place-items-center overflow-hidden">
        {preview && !isPdf ? <img src={preview} alt={label} className="h-full w-full object-cover" />
          : doc ? <span className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-4 w-4" />{doc.file_name}</span>
          : <IdCard className="h-8 w-8 text-muted-foreground" />}
      </div>
      <DocUploadButton docType={docType} userId={userId} currentDoc={doc} onSaved={onSaved} label={doc ? "Replace" : "Upload"} />
    </div>
  );
}

const SURELC_URL = "https://surelc.surancebay.com";

function SureLcCard() {
  return (
    <Card>
      <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5">
        <div>
          <div className="text-sm font-semibold">E&amp;O and AML</div>
          <div className="text-xs text-muted-foreground">Get or update your E&amp;O and AML in SureLC, then upload the certificates below.</div>
        </div>
        <Button asChild size="sm" variant="outline">
          <a href={SURELC_URL} target="_blank" rel="noreferrer">Open SureLC <ExternalLink className="h-3 w-3 ml-1" /></a>
        </Button>
      </CardContent>
    </Card>
  );
}
