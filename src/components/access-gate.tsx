import { useEffect, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Lock, Users, Trophy, Megaphone, ClipboardList, Building2, Check, LogOut, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessState } from "@/components/read-only-gate";
import { useBillingCheckout } from "@/components/BillingCheckout";
import { isAgencyOnlyPath, LOCKED_ALLOWED_PATHS } from "@/lib/billing/access";
import { PRICING } from "@/lib/billing/pricing";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hard paywall around every signed-in page. Decides from the server's access
 * answer only; while that answer is loading nothing behind it renders.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const { data, isError, refetch } = useAccessState();
  const { pathname } = useLocation();
  const allowed = LOCKED_ALLOWED_PATHS.some((p) => pathname.startsWith(p));
  const sendToStart = !!data && data.mode === "locked" && (data.reason === "no_workspace" || data.isOwner);

  useEffect(() => {
    if (sendToStart && !allowed) window.location.assign("/start");
  }, [sendToStart, allowed]);

  if (isError && !data) {
    return (
      <CenterCard icon={<RotateCcw className="h-6 w-6 text-primary" />} title="We couldn't check your plan">
        <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
        <Button className="mt-5" onClick={() => refetch()}>Try again</Button>
      </CenterCard>
    );
  }
  if (!data) return <div className="p-6 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full rounded-xl" /></div>;

  if (data.mode === "locked" && !allowed) {
    if (sendToStart) return <div className="p-6"><Skeleton className="h-64 w-full rounded-xl" /></div>;
    return <AgencyInactive />;
  }
  if (data.plan === "solo" && isAgencyOnlyPath(pathname)) return <UpgradeToAgency isOwner={data.isOwner} />;
  return <>{children}</>;
}

function CenterCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">{icon}</div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

function AgencyInactive() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }
  return (
    <CenterCard icon={<Lock className="h-6 w-6 text-primary" />} title="Your agency isn't active yet">
      <p className="text-sm text-muted-foreground">
        Your agency owner needs to finish setting up their Agent Cloud plan. Once they do, everything opens up here automatically.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button variant="outline" asChild><Link to="/account/help">Contact support</Link></Button>
        <Button variant="ghost" onClick={signOut}><LogOut className="mr-2 h-4 w-4" />Sign out</Button>
      </div>
    </CenterCard>
  );
}

const AGENCY_PERKS = [
  { icon: Users, text: "Invite agents with your own recruiting links" },
  { icon: Building2, text: "Team view, downline and hierarchy" },
  { icon: Trophy, text: "Leaderboards, challenges and Trophy Case" },
  { icon: Megaphone, text: "Announcements to your whole agency" },
  { icon: ClipboardList, text: "Contracting Ops for your agents' paperwork" },
];

/** Shown to solo workspaces instead of any agency-only page. */
export function UpgradeToAgency({ isOwner }: { isOwner: boolean }) {
  const checkout = useBillingCheckout();
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Agency plan</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Ready to build a team?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Inviting agents and running a team are part of the Agency plan. Your book, clients and settings come with you.
        </p>
        <ul className="mt-6 space-y-3">
          {AGENCY_PERKS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-foreground">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10"><Icon className="h-4 w-4 text-primary" /></span>
              {text}
            </li>
          ))}
          <li className="flex items-center gap-3 text-sm text-foreground">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10"><Check className="h-4 w-4 text-primary" /></span>
            Unlimited agents, one flat price. Your Solo plan ends when you upgrade.
          </li>
        </ul>
        {isOwner ? (
          <Button className="mt-7 w-full" size="lg" data-billing-allowed onClick={() => checkout.mutate({ product: "agency_plan" })} disabled={checkout.isPending}>
            Upgrade to Agency – ${PRICING.agencyBase}/mo
          </Button>
        ) : (
          <p className="mt-7 text-sm text-muted-foreground">Ask your workspace owner to upgrade to the Agency plan.</p>
        )}
        <Button variant="ghost" className="mt-2 w-full" asChild><Link to="/dashboard">Not now</Link></Button>
        {checkout.element}
      </div>
    </div>
  );
}
