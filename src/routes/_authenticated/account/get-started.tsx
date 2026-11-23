import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { Check, ChevronLeft, FileUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@/hooks/use-server-fn";
import { useAuth } from "@/hooks/use-auth";
import { getProducerFile, saveGuidedProfile, saveMySsn } from "@/lib/producer-file.functions";
import { upsertProducerDocument, signBackgroundDisclosure } from "@/lib/account.functions";
import { BACKGROUND_QUESTIONS } from "@/lib/producer/background-questions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NpnLookupLink } from "@/components/npn-lookup-link";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/account/get-started")({
  head: () => ({
    meta: [
      { title: "Set up your producer profile — Agent Cloud" },
      { name: "description", content: "A guided, step-by-step setup of everything carriers need to contract you." },
      { property: "og:title", content: "Set up your producer profile — Agent Cloud" },
      { property: "og:description", content: "A guided, step-by-step setup of everything carriers need to contract you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GetStarted,
});

const STEPS = ["About you", "Your license", "Home address", "ID & SSN", "E&O", "AML", "Background", "Sign"] as const;
const US = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");

type Answer = { answer: boolean | null; explanation: string };

function GetStarted() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileFn = useServerFn(getProducerFile);
  const saveFn = useServerFn(saveGuidedProfile);
  const docFn = useServerFn(upsertProducerDocument);
  const signFn = useServerFn(signBackgroundDisclosure);
  const ssnFn = useServerFn(saveMySsn);
  const [ssn, setSsn] = useState(""); const [ssnLast4, setSsnLast4] = useState("");
  const [dlFront, setDlFront] = useState<{ file: File | null; has: boolean }>({ file: null, has: false });
  const [dlBack, setDlBack] = useState<{ file: File | null; has: boolean }>({ file: null, has: false });
  const { data, isLoading } = useQuery({ queryKey: ["producer-file", "me"], queryFn: () => fileFn({ data: {} }) });

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ first_name: "", last_name: "", phone: "", date_of_birth: "", gender: "", npn_number: "", street_address: "", city: "", state: "", zip_code: "" });
  const [eo, setEo] = useState({ start_date: "", expiration_date: "", policy_number: "", carrier_name: "", coverage_amount: "", file: null as File | null, has: false });
  const [aml, setAml] = useState({ start_date: "", expiration_date: "", provider_name: "", file: null as File | null, has: false });
  const [answers, setAnswers] = useState<Answer[]>(BACKGROUND_QUESTIONS.map(() => ({ answer: null, explanation: "" })));
  const [signature, setSignature] = useState("");

  useEffect(() => {
    if (!data) return;
    const p: any = data.profile ?? {};
    setF({
      first_name: p.first_name ?? "", last_name: p.last_name ?? "", phone: p.phone ?? "",
      date_of_birth: p.date_of_birth ?? "", gender: p.gender ?? "", npn_number: p.npn_number ?? "",
      street_address: p.street_address ?? "", city: p.city ?? "", state: p.state ?? "", zip_code: p.zip_code ?? "",
    });
    const e: any = data.documents.find((d: any) => d.doc_type === "eo_certificate");
    if (e) setEo((s) => ({ ...s, start_date: e.start_date ?? "", expiration_date: e.expiration_date ?? "", policy_number: e.policy_number ?? "", carrier_name: e.carrier_name ?? "", coverage_amount: e.coverage_amount ?? "", has: !!e.file_url }));
    const a: any = data.documents.find((d: any) => d.doc_type === "aml_certificate");
    if (a) setAml((s) => ({ ...s, start_date: a.start_date ?? "", expiration_date: a.expiration_date ?? "", has: !!a.file_url }));
    if (data.background.length) {
      setAnswers(BACKGROUND_QUESTIONS.map((_, i) => {
        const b: any = data.background.find((x: any) => x.question_number === i + 1);
        return { answer: b ? b.answer : null, explanation: b?.explanation ?? "" };
      }));
    }
    setSsnLast4(p.ssn_last4 ?? "");
    setDlFront((s) => ({ ...s, has: data.documents.some((d: any) => d.doc_type === "drivers_license_front" && d.file_url) }));
    setDlBack((s) => ({ ...s, has: data.documents.some((d: any) => d.doc_type === "drivers_license_back" && d.file_url) }));
    if (data.agreement?.signature_name) setSignature(data.agreement.signature_name);
  }, [data]);

  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function upload(doc_type: "eo_certificate" | "aml_certificate" | "drivers_license_front" | "drivers_license_back", file: File | null, extra: Record<string, string>) {
    let file_path: string | undefined; let file_name: string | undefined;
    if (file && user) {
      file_path = `${user.id}/${doc_type}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("agent-documents").upload(file_path, file, { upsert: true });
      if (error) throw new Error(error.message);
      file_name = file.name;
    }
    const clean = Object.fromEntries(Object.entries(extra).filter(([, v]) => v));
    await docFn({ data: { doc_type, ...(file_path ? { file_path, file_name } : {}), ...clean } as any });
  }

  const canNext = (() => {
    switch (step) {
      case 0: return f.first_name && f.last_name && f.phone && f.date_of_birth && f.gender;
      case 1: return /^\d{5,10}$/.test(f.npn_number);
      case 2: return f.street_address && f.city && f.state && f.zip_code;
      case 3: return (ssnLast4 || ssn.replace(/\D/g, "").length === 9) && (dlFront.has || dlFront.file) && (dlBack.has || dlBack.file);
      case 4: return true;
      case 5: return true;
      case 6: return answers.every((a) => a.answer !== null && (!a.answer || a.explanation.trim()));
      case 7: return signature.trim().length >= 2;
    }
    return false;
  })();

  async function next() {
    setBusy(true);
    try {
      if (step === 0) await saveFn({ data: { first_name: f.first_name, last_name: f.last_name, phone: f.phone, date_of_birth: f.date_of_birth, gender: f.gender as any } });
      if (step === 1) await saveFn({ data: { npn_number: f.npn_number } });
      if (step === 2) await saveFn({ data: { street_address: f.street_address, city: f.city, state: f.state, zip_code: f.zip_code } });
      if (step === 3) {
        if (ssn) { const r = await ssnFn({ data: { ssn } }); setSsnLast4(r.last4); setSsn(""); }
        if (dlFront.file) { await upload("drivers_license_front", dlFront.file, {}); setDlFront({ file: null, has: true }); }
        if (dlBack.file) { await upload("drivers_license_back", dlBack.file, {}); setDlBack({ file: null, has: true }); }
      }
      if (step === 4 && (eo.file || eo.has || eo.expiration_date || eo.policy_number)) await upload("eo_certificate", eo.file, { start_date: eo.start_date, expiration_date: eo.expiration_date, policy_number: eo.policy_number, carrier_name: eo.carrier_name, coverage_amount: eo.coverage_amount });
      if (step === 5 && (aml.file || aml.has || aml.expiration_date)) await upload("aml_certificate", aml.file, { start_date: aml.start_date, expiration_date: aml.expiration_date, provider_name: aml.provider_name });
      if (step === 7) {
        await signFn({ data: { signature_name: signature, answers: answers.map((a, i) => ({ question_number: i + 1, answer: !!a.answer, explanation: a.explanation || null })) } });
        qc.invalidateQueries();
        toast.success("Your producer profile is complete");
        navigate({ to: "/dashboard" });
        return;
      }
      setStep((s) => s + 1);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally { setBusy(false); }
  }

  if (isLoading) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto max-w-xl px-4 py-8 pb-28">
      <div className="mb-6 flex items-center justify-between text-xs text-muted-foreground">
        <Link to="/dashboard" className="hover:text-foreground">Finish later</Link>
        <span>Step {step + 1} of {STEPS.length}</span>
      </div>
      <div className="mb-8 flex gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-muted")} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
          {step === 0 && (
            <Section title="Let's start with you" blurb="Exactly as it appears on your license — carriers match on it.">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name"><Input value={f.first_name} onChange={(e) => set("first_name", e.target.value)} /></Field>
                <Field label="Last name"><Input value={f.last_name} onChange={(e) => set("last_name", e.target.value)} /></Field>
              </div>
              <Field label="Mobile number"><Input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
              <Field label="Date of birth"><Input type="date" value={f.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></Field>
              <Field label="Gender">
                <div className="grid grid-cols-3 gap-2">
                  {["Male", "Female", "Other"].map((g) => (
                    <Pill key={g} on={f.gender === g} onClick={() => set("gender", g)}>{g}</Pill>
                  ))}
                </div>
              </Field>
            </Section>
          )}
          {step === 1 && (
            <Section title="Your NPN" blurb="Your National Producer Number identifies you to every carrier.">
              <Field label="NPN"><Input inputMode="numeric" value={f.npn_number} onChange={(e) => set("npn_number", e.target.value.replace(/\D/g, "").slice(0, 10))} /></Field>
              <NpnLookupLink />
            </Section>
          )}
          {step === 2 && (
            <Section title="Where do you live?" blurb="Appointment paperwork is filed against your home address.">
              <Field label="Street address"><Input value={f.street_address} onChange={(e) => set("street_address", e.target.value)} /></Field>
              <div className="grid grid-cols-[1fr_90px_110px] gap-3">
                <Field label="City"><Input value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
                <Field label="State">
                  <select className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={f.state} onChange={(e) => set("state", e.target.value)}>
                    <option value="" />{US.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="ZIP"><Input value={f.zip_code} onChange={(e) => set("zip_code", e.target.value.slice(0, 10))} /></Field>
              </div>
            </Section>
          )}
          {step === 3 && (
            <Section title="ID & Social Security" blurb="Carriers need these for background checks. Your SSN is encrypted and only your agency's contracting team can see it.">
              <Field label={ssnLast4 ? `Social Security number (saved · ends in ${ssnLast4})` : "Social Security number"}>
                <Input inputMode="numeric" autoComplete="off" placeholder={ssnLast4 ? "Leave blank to keep it" : "123-45-6789"} value={ssn}
                  onChange={(e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 9); setSsn(d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d); }} />
              </Field>
              <Field label="Driver's license — front"><FilePick has={dlFront.has} file={dlFront.file} onPick={(file) => setDlFront((s) => ({ ...s, file }))} /></Field>
              <Field label="Driver's license — back"><FilePick has={dlBack.has} file={dlBack.file} onPick={(file) => setDlBack((s) => ({ ...s, file }))} /></Field>
            </Section>
          )}
          {step === 4 && (
            <Section title="Errors & Omissions" blurb="Upload your E&O certificate. Don't have one yet? Most agents get it in minutes from an E&O provider.">
              <FilePick has={eo.has} file={eo.file} onPick={(file) => setEo((s) => ({ ...s, file }))} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start date"><Input type="date" value={eo.start_date} onChange={(e) => setEo((s) => ({ ...s, start_date: e.target.value }))} /></Field>
                <Field label="Expiration date"><Input type="date" value={eo.expiration_date} onChange={(e) => setEo((s) => ({ ...s, expiration_date: e.target.value }))} /></Field>
                <Field label="Policy number"><Input value={eo.policy_number} onChange={(e) => setEo((s) => ({ ...s, policy_number: e.target.value }))} /></Field>
                <Field label="Insurance company"><Input value={eo.carrier_name} onChange={(e) => setEo((s) => ({ ...s, carrier_name: e.target.value }))} /></Field>
              </div>
              <Field label="Coverage limit"><Input placeholder="$1,000,000" value={eo.coverage_amount} onChange={(e) => setEo((s) => ({ ...s, coverage_amount: e.target.value }))} /></Field>
              <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">Don't have it yet? Just tap Continue — you can upload it anytime from <Link to="/account/producer-profile" className="font-medium text-primary hover:underline">your Producer Profile</Link>.</p>
            </Section>
          )}
          {step === 5 && (
            <Section title="Anti-money-laundering" blurb="Carriers need an AML training certificate. Free courses are available online.">
              <FilePick has={aml.has} file={aml.file} onPick={(file) => setAml((s) => ({ ...s, file }))} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Completed on"><Input type="date" value={aml.start_date} onChange={(e) => setAml((s) => ({ ...s, start_date: e.target.value }))} /></Field>
                <Field label="Expiration date"><Input type="date" value={aml.expiration_date} onChange={(e) => setAml((s) => ({ ...s, expiration_date: e.target.value }))} /></Field>
              </div>
              <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">Don't have it yet? Just tap Continue — you can upload it anytime from <Link to="/account/producer-profile" className="font-medium text-primary hover:underline">your Producer Profile</Link>.</p>
            </Section>
          )}
          {step === 6 && (
            <Section title="Background questions" blurb="Answer honestly — every carrier asks these. A 'yes' just needs a short explanation.">
              <Button variant="outline" size="sm" onClick={() => setAnswers((a) => a.map((x) => ({ ...x, answer: false })))}>Set all to No</Button>
              <ol className="space-y-3">
                {BACKGROUND_QUESTIONS.map((q, i) => (
                  <li key={q.id} className="rounded-xl border border-border-soft bg-card p-3">
                    <p className="text-sm text-foreground"><span className="mr-1 font-semibold text-primary">{i + 1}.</span>{q.text}</p>
                    <div className="mt-2 flex gap-2">
                      {[true, false].map((v) => (
                        <Pill key={String(v)} on={answers[i]?.answer === v} onClick={() => setAnswers((a) => a.map((x, j) => j === i ? { ...x, answer: v } : x))}>{v ? "Yes" : "No"}</Pill>
                      ))}
                    </div>
                    {answers[i]?.answer && (
                      <Textarea className="mt-2" placeholder="Please explain" value={answers[i]?.explanation ?? ""} onChange={(e) => setAnswers((a) => a.map((x, j) => j === i ? { ...x, explanation: e.target.value } : x))} />
                    )}
                  </li>
                ))}
              </ol>
            </Section>
          )}
          {step === 7 && (
            <Section title="Sign and finish" blurb="Type your full legal name to confirm your answers are true and complete.">
              <Field label="Signature"><Input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={`${f.first_name} ${f.last_name}`} /></Field>
              {signature && <p className="font-serif text-2xl italic text-foreground">{signature}</p>}
              <p className="text-xs text-muted-foreground">Your agency's contracting team will use this information to get you appointed.</p>
            </Section>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="fixed inset-x-0 bottom-0 border-t border-border-soft bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Back</Button>
          <Button className="min-w-32 rounded-full" disabled={!canNext || busy} onClick={next}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : step === STEPS.length - 1 ? "Finish" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
      </div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("h-10 rounded-full border px-5 text-sm transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/50")}>
      {on && <Check className="mr-1 inline h-3.5 w-3.5" />}{children}
    </button>
  );
}
function FilePick({ has, file, onPick }: { has: boolean; file: File | null; onPick: (f: File | null) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-border p-4 hover:border-primary/60">
      <FileUp className="h-5 w-5 text-primary" />
      <span className="text-sm text-foreground">{file ? file.name : has ? "On file — tap to replace" : "Upload a PDF or photo"}</span>
      <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
    </label>
  );
}
