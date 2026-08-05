/**
 * The demo front door.
 *
 * Three buttons and nothing else. No form, no email capture, no "we'll be in
 * touch" — a prospect who wants to see the product sees the product. The whole
 * competitive point of this page is what it does not ask for, so resist adding
 * a field to it.
 *
 * The sign-in itself never touches a credential in this file: the server
 * returns a one-time token hash and `verifyOtp` exchanges it for a session,
 * the same path a magic link takes.
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "./login";
import { DEMO_ROLES, startDemoSession, type DemoRole } from "@/lib/demo.functions";

export const Route = createFileRoute("/demo-login")({
  head: () => ({
    meta: [
      { title: "Explore the demo — Agent Cloud" },
      {
        name: "description",
        content:
          "Log into a working sample agency as an owner, a manager or an agent. No signup, no sales call.",
      },
    ],
  }),
  component: DemoLoginPage,
});

function DemoLoginPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<DemoRole | null>(null);

  async function enter(role: DemoRole) {
    setPending(role);
    try {
      const { tokenHash } = await startDemoSession({ data: { role } });
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "magiclink",
      });
      if (error) throw new Error(error.message);
      await navigate({ to: "/dashboard" });
    } catch (e: any) {
      setPending(null);
      toast.error(e?.message ?? "Could not open the sample agency.");
    }
  }

  return (
    <AuthShell
      title="Look around a real agency"
      subtitle="Summit Life Partners is a working sample agency with a full book, live contracting and real commission maths. Pick a seat."
    >
      <div className="space-y-3">
        {DEMO_ROLES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => enter(r.id)}
            disabled={pending !== null}
            className="w-full rounded-[var(--radius)] border border-border bg-background/40 p-4 text-left transition hover:border-primary/60 hover:bg-background/70 disabled:opacity-60"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{r.label}</span>
              {pending === r.id
                ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                : <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{r.blurb}</p>
          </button>
        ))}
      </div>

      {/* Said plainly, and before they click. Clearly-labelled sample data
          builds trust; data pretending to be real destroys it the moment
          somebody notices — and in insurance, somebody always notices. */}
      <div className="mt-6 flex gap-2.5 rounded-[var(--radius)] border border-border bg-background/30 p-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Everything inside is sample data and resets every night. The demo cannot
          send email, charge a card, or invite anyone — nothing you do in there
          reaches the outside world.
        </p>
      </div>

      {/* The roadmap asked for "Start your own free account". There is no free
          account — Agent Cloud is invite-only for agencies and paid for solo
          producers — and a CTA that promises one would be the first thing a
          prospect found untrue about us. These are the two real next steps. */}
      <div className="mt-6 flex items-center justify-between text-sm">
        <Link to="/demo" className="text-primary hover:underline">
          Set your own agency up
        </Link>
        <Link to="/signup/agent" className="text-muted-foreground hover:underline">
          Solo producer? Start here
        </Link>
      </div>
    </AuthShell>
  );
}
