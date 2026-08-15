import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings/security")({
  head: () => ({ meta: [{ title: "Security — Agent Cloud" }] }),
  component: SecurityPage,
});

type Enrolling = { factorId: string; qr: string; secret: string } | null;

export function SecurityPage() {
  const qc = useQueryClient();
  const [enrolling, setEnrolling] = useState<Enrolling>(null);
  const [code, setCode] = useState("");

  const factors = useQuery({
    queryKey: ["mfa", "factors"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const verified = (factors.data?.totp ?? []).filter((f: any) => f.status === "verified");
  const isOn = verified.length > 0;

  const start = useMutation({
    mutationFn: async () => {
      // Clear any half-finished factor from a previous attempt, otherwise
      // Supabase rejects the new enrollment as a duplicate friendly name.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of (existing?.all ?? []) as any[]) {
        if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (d: any) => {
      setEnrolling({ factorId: d.id, qr: d.totp.qr_code, secret: d.totp.secret });
      setCode("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't start enrollment"),
  });

  const confirm = useMutation({
    mutationFn: async () => {
      if (!enrolling) throw new Error("Nothing to confirm");
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId });
      if (chErr) throw new Error(chErr.message);
      const { error } = await supabase.auth.mfa.verify({
        factorId: enrolling.factorId,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Two-factor authentication is on");
      setEnrolling(null);
      setCode("");
      qc.invalidateQueries({ queryKey: ["mfa", "factors"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That code didn't match"),
  });

  const disable = useMutation({
    mutationFn: async (factorId: string) => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Two-factor authentication is off");
      qc.invalidateQueries({ queryKey: ["mfa", "factors"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't disable"),
  });

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand title="Security" subtitle="Protect your account and your agency's data" />

        <Panel
          title="Two-Factor Authentication"
          action={
            isOn
              ? <Badge variant="success">On</Badge>
              : <Badge variant="warning">Off</Badge>
          }
        >
          {factors.isLoading ? (
            <Skeleton className="h-24" />
          ) : isOn ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-success/15 grid place-items-center text-success shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Your account asks for a code from your authenticator app at sign-in.
                  Anyone with your password alone cannot get in.
                </p>
              </div>
              {verified.map((f: any) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="text-sm">
                    <div className="font-medium">Authenticator app</div>
                    <div className="text-xs text-muted-foreground">
                      Added {new Date(f.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => disable.mutate(f.id)}
                    disabled={disable.isPending}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : enrolling ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Scan this with your authenticator app, then enter the six-digit code it shows.
              </p>
              <div className="flex justify-center">
                {/* Supabase returns the QR as an inline SVG data URI. */}
                <img
                  src={enrolling.qr}
                  alt="Two-factor QR code"
                  className="h-44 w-44 rounded-lg bg-card p-2"
                />
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Can't scan? Enter this key manually:</p>
                <code className="text-xs tnum break-all">{enrolling.secret}</code>
              </div>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  className="tnum tracking-[0.3em] text-center"
                />
                <Button onClick={() => confirm.mutate()} disabled={code.length !== 6 || confirm.isPending}>
                  {confirm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEnrolling(null)}>Cancel</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-warning/15 grid place-items-center text-warning shrink-0">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Add a second step at sign-in using an authenticator app. Strongly recommended
                  for agency owners and admins — your account can reach every client record in
                  the agency.
                </p>
              </div>
              <Button onClick={() => start.mutate()} disabled={start.isPending}>
                {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Turn on two-factor"}
              </Button>
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
