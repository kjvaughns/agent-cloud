import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getInviteByToken,
  acceptInviteCreateAccount,
  linkInviteToCurrentUser,
  saveOnboardingPersonal,
  saveOnboardingCarriers,
  signOnboardingAgreement,
} from "@/lib/onboarding.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Cloud, CheckCircle2, Eye, EyeOff, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  component: PublicInvitePage,
  loader: async ({ params }) => {
    const res = await getInviteByToken({ data: { token: params.token } });
    return res;
  },
  head: () => ({ meta: [{ title: "Accept Invite | Agent Cloud" }] }),
});

function PublicInvitePage() {
  const { token } = Route.useParams();
  const initial = Route.useLoaderData();
  const navigate = useNavigate();
  const [authedUser, setAuthedUser] = useState<any>(null);
  const [step, setStep] = useState(0);
  const invite = (initial as any)?.invite as any;
  const migrationMatch = (initial as any)?.migration_match;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthedUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => setAuthedUser(sess?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (invite?.onboarding_step) setStep(invite.onboarding_step);
  }, [invite?.onboarding_step]);

  if (!invite) {
    return <Centered><h1 className="text-2xl font-bold mb-2">Invite not found</h1><p className="text-muted-foreground">This link is invalid.</p></Centered>;
  }
  if (invite.expired) {
    return <Centered><h1 className="text-2xl font-bold mb-2">Invite expired</h1><p className="text-muted-foreground">Ask your upline to send a new one.</p></Centered>;
  }

  const carriers = Array.isArray(invite.carrier_assignments) ? invite.carrier_assignments : [];
  const totalSteps = 5;
  const progress = (step / 4) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <header className="max-w-3xl mx-auto px-6 py-6 flex items-center gap-2">
        <Cloud className="h-7 w-7 text-primary" />
        <span className="font-semibold">Agent Cloud</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 pb-16 space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">You've been invited by {invite.upline_name?.trim() || "your upline"}</h1>
          {carriers.length > 0 ? (
            <>
              <p className="text-muted-foreground mt-1">Join their team and get contracted with the following carriers:</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {carriers.map((c: any) => <Badge key={c.carrier_id} variant="secondary">{c.carrier_name}</Badge>)}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground mt-1">
              Create your account to join their team. Your upline will assign your carrier commission levels after you're onboarded.
            </p>
          )}
        </div>

        {migrationMatch && step <= 1 && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold text-emerald-800 dark:text-emerald-300">Welcome back! </span>
              <span className="text-emerald-700 dark:text-emerald-400">We found your Apex record and pre-filled your name below.</span>
            </div>
          </div>
        )}

        {step > 0 && (
          <div className="space-y-1">
            <Progress value={progress} />
            <div className="text-xs text-muted-foreground text-right">Step {step} of 4</div>
          </div>
        )}

        {step === 0 && !authedUser && <Step0NewAccount token={token} invite={invite} migrationMatch={migrationMatch} onDone={() => setStep(1)} />}
        {step === 0 && authedUser && <Step0LinkExisting token={token} onDone={() => setStep(1)} />}
        {step === 1 && <Step1Personal token={token} invite={invite} migrationMatch={migrationMatch} onDone={() => setStep(2)} />}
        {step === 2 && <Step2Carriers token={token} carriers={carriers} onDone={() => setStep(3)} />}
        {step === 3 && <Step3Agreement token={token} onDone={() => setStep(4)} />}
        {step === 4 && <Step4Confirmation invite={invite} />}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen grid place-items-center p-6"><Card className="p-8 max-w-md text-center">{children}</Card></div>;
}

function Step0NewAccount({ token, invite, migrationMatch, onDone }: { token: string; invite: any; migrationMatch?: any; onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "create">("create");
  const [email, setEmail] = useState(invite.new_agent_email ?? "");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState(invite.new_agent_first_name ?? migrationMatch?.first_name ?? "");
  const [lastName, setLastName] = useState(invite.new_agent_last_name ?? migrationMatch?.last_name ?? "");
  const [phone, setPhone] = useState("");

  const createFn = useServerFn(acceptInviteCreateAccount);

  const create = useMutation({
    mutationFn: () => createFn({ data: { token, first_name: firstName, last_name: lastName, email, password, phone } }),
    onSuccess: async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message);
      else { toast.success("Account created"); onDone(); }
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const login = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => onDone(),
    onError: (e: any) => toast.error(e?.message ?? "Login failed"),
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant={mode === "create" ? "default" : "outline"} onClick={() => setMode("create")}>New to Agent Cloud</Button>
        <Button size="sm" variant={mode === "login" ? "default" : "outline"} onClick={() => setMode("login")}>I already have an account</Button>
      </div>

      {mode === "create" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First name *</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
            <div><Label>Last name *</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
          </div>
          <div><Label>Email *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><Label>Create password *</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <Button className="w-full" disabled={create.isPending || !email || password.length < 8 || !firstName || !lastName}
            onClick={() => create.mutate()}>
            {create.isPending ? "Creating..." : "Create Account & Start →"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <Button className="w-full" disabled={login.isPending} onClick={() => login.mutate()}>
            {login.isPending ? "Signing in..." : "Log In & Continue"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function Step0LinkExisting({ token, onDone }: { token: string; onDone: () => void }) {
  const linkFn = useServerFn(linkInviteToCurrentUser);
  useEffect(() => {
    linkFn({ data: { token } }).then(() => onDone()).catch((e: any) => toast.error(e?.message ?? "Failed"));
  }, []);
  return <Card className="p-6 text-center text-muted-foreground">Linking invite to your account...</Card>;
}

function Step1Personal({ token, invite, migrationMatch, onDone }: { token: string; invite: any; migrationMatch?: any; onDone: () => void }) {
  const [form, setForm] = useState({
    first_name: invite.new_agent_first_name ?? migrationMatch?.first_name ?? "",
    last_name: invite.new_agent_last_name ?? migrationMatch?.last_name ?? "",
    date_of_birth: "",
    ssn: "",
    npn_number: "",
    street_address: "",
    city: "",
    state: "",
    zip_code: "",
    phone: "",
    contact_email: invite.new_agent_email ?? "",
  });
  const [showSsn, setShowSsn] = useState(false);
  const saveFn = useServerFn(saveOnboardingPersonal);
  const save = useMutation({
    mutationFn: () => saveFn({ data: { token, ...form } }),
    onSuccess: () => { toast.success("Saved"); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-lg font-semibold">Your Personal Information</h2>
      <p className="text-sm text-muted-foreground">Used to complete contracting packets and locate your license records.</p>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>First name *</Label><Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} /></div>
        <div><Label>Last name *</Label><Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} /></div>
        <div><Label>Date of birth *</Label><Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></div>
        <div>
          <Label className="flex items-center gap-1"><Lock className="h-3 w-3" /> SSN *</Label>
          <div className="flex gap-1">
            <Input type={showSsn ? "text" : "password"} value={form.ssn} maxLength={9}
              onChange={(e) => set("ssn", e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="123456789" />
            <Button type="button" size="icon" variant="outline" onClick={() => setShowSsn(s => !s)}>
              {showSsn ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="col-span-2"><Label>Street address *</Label><Input value={form.street_address} onChange={(e) => set("street_address", e.target.value)} /></div>
        <div><Label>City *</Label><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
        <div><Label>State *</Label><Input value={form.state} onChange={(e) => set("state", e.target.value)} maxLength={2} placeholder="TX" /></div>
        <div><Label>ZIP *</Label><Input value={form.zip_code} onChange={(e) => set("zip_code", e.target.value)} /></div>
        <div><Label>NPN (optional)</Label><Input value={form.npn_number} onChange={(e) => set("npn_number", e.target.value)} /></div>
        <div><Label>Phone *</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div className="col-span-2"><Label>Email *</Label><Input type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} /></div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving..." : "Next →"}</Button>
      </div>
    </Card>
  );
}

function Step2Carriers({ token, carriers, onDone }: { token: string; carriers: any[]; onDone: () => void }) {
  const [choices, setChoices] = useState(() => carriers.map((c) => ({ carrier_id: c.carrier_id, carrier_name: c.carrier_name, include: true, release_needed: !!c.release_needed })));
  const saveFn = useServerFn(saveOnboardingCarriers);

  if (carriers.length === 0) {
    return (
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Carrier Selection</h2>
        <p className="text-sm text-muted-foreground">
          No carriers were pre-assigned to this invite. Your upline will assign your carrier
          commission levels after you've joined the team.
        </p>
        <div className="flex justify-end">
          <Button onClick={onDone}>Continue →</Button>
        </div>
      </Card>
    );
  }
  const save = useMutation({
    mutationFn: () => saveFn({ data: { token, choices: choices.map(({ carrier_id, include, release_needed }) => ({ carrier_id, include, release_needed })) } }),
    onSuccess: () => { toast.success("Saved"); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const anyIncluded = choices.some((c) => c.include);

  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-lg font-semibold">Choose Your Carriers</h2>
      <p className="text-sm text-muted-foreground">Your upline pre-selected these carriers. Pick which ones to include in your contracting.</p>
      <div className="space-y-2">
        {choices.map((ch, i) => (
          <div key={ch.carrier_id} className="border rounded-lg p-3 space-y-2">
            <div className="font-medium">{ch.carrier_name}</div>
            <div className="flex gap-2">
              <Button size="sm" variant={ch.include ? "default" : "outline"} onClick={() => setChoices((s) => s.map((x, idx) => idx === i ? { ...x, include: true } : x))}>Yes</Button>
              <Button size="sm" variant={!ch.include ? "default" : "outline"} onClick={() => setChoices((s) => s.map((x, idx) => idx === i ? { ...x, include: false } : x))}>Skip</Button>
            </div>
            {ch.include && (
              <div className="text-sm flex items-center gap-3">
                <span className="text-muted-foreground">Release needed?</span>
                <Button size="sm" variant={ch.release_needed ? "default" : "outline"} onClick={() => setChoices((s) => s.map((x, idx) => idx === i ? { ...x, release_needed: true } : x))}>Yes</Button>
                <Button size="sm" variant={!ch.release_needed ? "default" : "outline"} onClick={() => setChoices((s) => s.map((x, idx) => idx === i ? { ...x, release_needed: false } : x))}>No</Button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={!anyIncluded || save.isPending}>{save.isPending ? "Saving..." : "Next →"}</Button>
      </div>
    </Card>
  );
}

function Step3Agreement({ token, onDone }: { token: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const signFn = useServerFn(signOnboardingAgreement);
  const sign = useMutation({
    mutationFn: () => signFn({ data: { token, signature_name: name } }),
    onSuccess: () => { toast.success("Agreement signed"); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-lg font-semibold">Producer Agreement</h2>
      <div className="border rounded-md p-4 max-h-64 overflow-auto text-sm text-muted-foreground bg-muted/30">
        <p className="font-medium mb-2">Agent Cloud Producer Agreement</p>
        <p>By signing this agreement, you authorize Agent Cloud and your upline to submit your contracting applications to the carriers you have selected. You confirm that all information you provide is accurate, and you agree to comply with all applicable carrier and regulatory requirements.</p>
        <p className="mt-2">You acknowledge that commission levels are assigned by your upline and may be subject to change upon written agreement, and that all commissions are paid by the carrier in accordance with the carrier's commission schedule.</p>
      </div>
      <div>
        <Label>Type your full legal name to sign</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
        <span>I have read and agree to the Producer Agreement and authorize submission of my contracting applications.</span>
      </label>
      <Button disabled={!agreed || name.trim().length < 2 || sign.isPending} onClick={() => sign.mutate()} className="w-full">
        {sign.isPending ? "Submitting..." : "Submit & Continue →"}
      </Button>
    </Card>
  );
}

function Step4Confirmation({ invite }: { invite: any }) {
  return (
    <Card className="p-8 text-center space-y-4">
      <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 grid place-items-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
      </div>
      <h2 className="text-2xl font-bold">You're in!</h2>
      <p className="text-muted-foreground">
        You've been added to <strong>{invite.upline_name?.trim() || "your upline"}'s</strong> team.
        Your contracting applications are being processed.
      </p>
      <div className="text-sm space-y-2 text-left max-w-xs mx-auto">
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Account created
        </div>
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Personal info saved
        </div>
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Carriers selected
        </div>
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Agreement signed
        </div>
      </div>
      <Button asChild className="mt-2"><a href="/">Go to Dashboard →</a></Button>
    </Card>
  );
}
