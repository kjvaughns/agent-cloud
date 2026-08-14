import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { getInviteByToken, acceptInviteCreateAccount, linkInviteToCurrentUser } from "@/lib/onboarding.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cloud, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  component: PublicInvitePage,
  loader: async ({ params }) => getInviteByToken({ data: { token: params.token } }),
  head: () => ({ meta: [{ title: "Accept Invite | Agent Cloud" }] }),
});

/**
 * Accepting an invite.
 *
 * One screen. Name, email, phone, NPN, password — the things that make
 * somebody a member of a downline, and the two identifiers that are cheap to
 * give now and expensive to chase later.
 *
 * It used to be a four-step wizard that asked for date of birth, SSN, full
 * address, carrier choices and a signed producer agreement before you were
 * in. That existed because the wizard was the only onboarding there was. It
 * is not any more: /onboarding works out what each agent still needs from
 * live data and asks for one thing at a time, in the app, where it saves as
 * you go. Asking for a stranger's SSN before they have seen a single screen
 * cost more than it collected, and anyone who stopped halfway left nothing
 * behind but a half-made account.
 */
function PublicInvitePage() {
  const { token } = Route.useParams();
  const initial = Route.useLoaderData();
  const [authedUser, setAuthedUser] = useState<any>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [done, setDone] = useState(false);

  const invite = (initial as any)?.invite as any;
  const migrationMatch = (initial as any)?.migration_match;
  // Present only on an agency-branded link. Its existence is what switches the
  // page from "a person invited you" to "an agency invited you, tell us who
  // your upline is".
  const agencyLink = (initial as any)?.agency_link as
    | { organization_name: string | null; upline_options: { id: string; name: string }[] }
    | null
    | undefined;
  const [chosenUpline, setChosenUpline] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setAuthedUser(data.user); setCheckedAuth(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => setAuthedUser(sess?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!invite) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold mb-2">Invite not found</h1>
        <p className="text-muted-foreground">This link is invalid.</p>
      </Centered>
    );
  }
  if (invite.expired) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold mb-2">Invite expired</h1>
        <p className="text-muted-foreground">Ask your upline to send a new one.</p>
      </Centered>
    );
  }

  const carriers = Array.isArray(invite.carrier_assignments) ? invite.carrier_assignments : [];
  const uplineName = invite.upline_name?.trim() || "your upline";
  const inviterLabel = agencyLink
    ? agencyLink.organization_name?.trim() || "Your agency"
    : uplineName;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <header className="mx-auto flex max-w-xl items-center gap-2 px-6 py-6">
        <Cloud className="h-7 w-7 text-primary" />
        <span className="font-semibold">Agent Cloud</span>
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-6 pb-16">
        {done ? (
          <Welcome uplineName={inviterLabel} />
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">
                You've been invited by {inviterLabel}
              </h1>
              {carriers.length > 0 ? (
                <>
                  <p className="mt-1 text-muted-foreground">
                    Join their team. These carriers are already lined up for you:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {carriers.map((c: any) => (
                      <Badge key={c.carrier_id} variant="secondary">{c.carrier_name}</Badge>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  Create your account to join their team.
                </p>
              )}
              <p className="mt-3 text-sm text-muted-foreground">
                Takes about a minute. Everything carriers need for contracting is asked for
                afterwards, one step at a time.
              </p>
            </div>

            {migrationMatch && (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                <div className="text-sm">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300">Welcome back! </span>
                  <span className="text-emerald-700 dark:text-emerald-400">
                    We found your Apex record and pre-filled your name.
                  </span>
                </div>
              </div>
            )}

            {agencyLink && (
              <Card className="space-y-2 p-6">
                <Label>Who is your upline? *</Label>
                <Select value={chosenUpline} onValueChange={setChosenUpline}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select your upline" /></SelectTrigger>
                  <SelectContent>
                    {agencyLink.upline_options.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The person who recruited you, or whoever you report to at {inviterLabel}.
                </p>
              </Card>
            )}

            {!checkedAuth ? (
              <Card className="p-6 text-center text-muted-foreground">Loading…</Card>
            ) : authedUser ? (
              <JoinWithExistingAccount
                token={token}
                uplineId={agencyLink ? chosenUpline : null}
                requireUpline={Boolean(agencyLink)}
                onDone={() => setDone(true)}
              />
            ) : (
              <JoinForm
                token={token}
                invite={invite}
                migrationMatch={migrationMatch}
                uplineId={agencyLink ? chosenUpline : null}
                requireUpline={Boolean(agencyLink)}
                onDone={() => setDone(true)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <Card className="max-w-md p-8 text-center">{children}</Card>
    </div>
  );
}

function JoinForm({
  token, invite, migrationMatch, uplineId, requireUpline, onDone,
}: {
  token: string; invite: any; migrationMatch?: any;
  uplineId?: string | null; requireUpline?: boolean; onDone: () => void;
}) {
  const [mode, setMode] = useState<"create" | "login">("create");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    first_name: invite.new_agent_first_name ?? migrationMatch?.first_name ?? "",
    last_name: invite.new_agent_last_name ?? migrationMatch?.last_name ?? "",
    email: invite.new_agent_email ?? "",
    phone: "",
    npn_number: "",
    password: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const createFn = useServerFn(acceptInviteCreateAccount);
  const linkFn = useServerFn(linkInviteToCurrentUser);

  const create = useMutation({
    mutationFn: () => createFn({ data: { token, ...form, npn_number: form.npn_number || null, upline_id: uplineId || null } }),
    onSuccess: async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email, password: form.password,
      });
      if (error) toast.error(error.message);
      else onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create your account"),
  });

  const login = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email, password: form.password,
      });
      if (error) throw new Error(error.message);
      // Signing in does not join the team on its own — the invite still has to
      // be attached to the account that just signed in.
      await linkFn({ data: { token, upline_id: uplineId || null } });
    },
    onSuccess: () => onDone(),
    onError: (e: any) => toast.error(e?.message ?? "Could not sign you in"),
  });

  const ready =
    form.first_name.trim() && form.last_name.trim() && form.email.trim() &&
    form.phone.trim().length >= 7 && form.password.length >= 8 &&
    (!requireUpline || Boolean(uplineId));

  return (
    <Card className="space-y-4 p-6">
      <div className="flex gap-2">
        <Button size="sm" variant={mode === "create" ? "default" : "outline"} onClick={() => setMode("create")}>
          New to Agent Cloud
        </Button>
        <Button size="sm" variant={mode === "login" ? "default" : "outline"} onClick={() => setMode("login")}>
          I already have an account
        </Button>
      </div>

      {mode === "create" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First name *</Label>
              <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </div>
            <div>
              <Label>Last name *</Label>
              <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <Label>Mobile number *</Label>
            <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <Label>NPN</Label>
            <Input
              value={form.npn_number}
              onChange={(e) => set("npn_number", e.target.value.replace(/\D/g, "").slice(0, 20))}
              placeholder="Optional — you can add it later"
            />
            {/* Says where to find it rather than assuming they know. A new
                agent frequently does not have it to hand. */}
            <p className="mt-1 text-xs text-muted-foreground">
              Your National Producer Number. On your licence, or look it up at nipr.com.
            </p>
          </div>
          <div>
            <Label>Create a password *</Label>
            <div className="flex gap-1">
              <Input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
              />
              <Button type="button" size="icon" variant="outline" onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <Button className="w-full" disabled={create.isPending || !ready} onClick={() => create.mutate()}>
            {create.isPending ? "Creating your account…" : "Join the team →"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} />
          </div>
          <Button className="w-full" disabled={login.isPending || (Boolean(requireUpline) && !uplineId)} onClick={() => login.mutate()}>
            {login.isPending ? "Signing in…" : "Sign in and join →"}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Already signed in — one button, no forms they have already filled in once. */
function JoinWithExistingAccount({ token, uplineId, requireUpline, onDone }: {
  token: string; uplineId?: string | null; requireUpline?: boolean; onDone: () => void;
}) {
  const linkFn = useServerFn(linkInviteToCurrentUser);
  const join = useMutation({
    mutationFn: () => linkFn({ data: { token, upline_id: uplineId || null } }),
    onSuccess: () => onDone(),
    onError: (e: any) => toast.error(e?.message ?? "Could not join the team"),
  });

  return (
    <Card className="space-y-4 p-6">
      <p className="text-sm text-muted-foreground">
        You're already signed in to Agent Cloud. Joining adds you to this team.
      </p>
      <Button className="w-full" disabled={join.isPending || (Boolean(requireUpline) && !uplineId)} onClick={() => join.mutate()}>
        {join.isPending ? "Joining…" : "Join the team →"}
      </Button>
    </Card>
  );
}

function Welcome({ uplineName }: { uplineName: string }) {
  return (
    <Card className="space-y-4 p-8 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/10">
        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
      </div>
      <h2 className="text-2xl font-bold">You're in</h2>
      <p className="text-muted-foreground">
        You've joined <strong>{uplineName}'s</strong> team. Your dashboard shows the next step
        towards being ready to sell — one at a time, and it saves as you go.
      </p>
      {/* A full page load rather than a client navigation: the session was just
          created, and the app shell needs to boot with it. */}
      <Button asChild className="mt-2"><a href="/dashboard">Go to my dashboard →</a></Button>
    </Card>
  );
}
