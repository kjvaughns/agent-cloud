import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { useOrganization } from "@/hooks/use-organization";
import { uploadOrgLogo, LOGO_LIMIT } from "@/lib/org-branding";
import { updateOrganization } from "@/lib/organization.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Palette, Building2, FileSignature, Plug, Users, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { IdentityHub } from "@/components/settings/identity-hub";
import { CarriersHub } from "@/components/settings/carriers-hub";
import { ContractingHub } from "@/components/settings/contracting-hub";
import { ConnectionsHub } from "@/components/settings/connections-hub";
import { TeamHub } from "@/components/settings/team-hub";
import { useAccessState } from "@/components/read-only-gate";
import { toast } from "sonner";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "@/components/page-skeleton";
import { useMyAccess } from "@/hooks/use-my-access";
import {
  canOpenTab, visibleTabs, defaultTab, TAB_LABEL, SETTINGS_TABS,
  type SettingsTab, type AccessContext,
} from "@/lib/settings/tab-access";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DiscordSettings } from "@/components/discord-settings";
import { SampleDataPanel } from "@/components/settings/sample-data-panel";
import { IntegrationsCatalog } from "@/components/settings/integrations-catalog";
import { ApiKeysPanel } from "@/components/settings/api-keys-panel";
import { AgencySetupProgress } from "@/components/settings/agency-setup-progress";
import { InheritParentPanel } from "@/components/settings/inherit-parent-panel";
import { SuggestedCarriersPanel } from "@/components/settings/suggested-carriers-panel";

import { AgencyTeamPage } from "@/components/agency-team-page";
import { LevelsPanel } from "@/components/contracting/levels-panel";
import { RenewalsPanel } from "@/components/settings/renewals-panel";
import { CarrierDirectoryPage } from "@/components/contracting/carrier-setup";
import { SetupChecklist } from "@/components/settings/setup-checklist";
import { ContractingSettingsPanel } from "@/components/settings/contracting-settings-panel";
import { TemplatesPanel } from "@/components/settings/templates-panel";
import { getContractingSetupStatus } from "@/lib/settings/setup.functions";
import { useMutation } from "@tanstack/react-query";
import { getOrgSettings, updateOrgSettings } from "@/lib/org-settings.functions";

export const Route = createFileRoute("/_authenticated/settings/agency")({
  ssr: false,
  head: () => ({ meta: [{ title: "Agency Settings — Agent Cloud" }] }),
  // ?tab= so the palette, the setup checklist and the pages that used to be
  // rows of their own can land on the right tab rather than dumping you on
  // General. Old names are aliased, not dropped.
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => {
    const t = normalizeTab(s.tab);
    return t ? { tab: t } : {};
  },

  // The guard moved into the component. It used to live here and check
  // `user_roles` alone, which was wrong twice over: it ignored
  // `organizations.owner_id`, so an owner whose org row predates their account
  // was locked out of their own agency's settings; and it ignored the
  // admin-staff path `resolveCanManagePermissions` honours, so somebody who
  // could administer /settings/roles was bounced from here. Worse, it bounced
  // them to the Dashboard with no explanation — a page they did not ask for,
  // saying nothing about the one they did.
  component: AgencySettingsRoute,
});

/**
 * May this person configure the agency, and if not, why not.
 *
 * `canEditAgencySettings` rather than `canSeeAgency`, and the difference is
 * two real lockouts. `canSeeAgency` requires `inAgency`, which is false on the
 * solo plan — so a solo owner could not open their own workspace's name or
 * logo, as though branding were a headcount question. And `canSeeAgency` was
 * never the rule the *save* enforced: `updateOrganization` refused everyone but
 * the owner, so a delegated admin got the full form and a refusal on submit.
 *
 * Both sides now ask `resolveAgencySettingsAccess`. Reaching this by URL
 * without the capability gets a sentence rather than a redirect.
 */
function AgencySettingsRoute() {
  const { access, loading } = useMyAccess();

  if (loading) {
    return (
      <PageShell>
        <PageSkeleton metrics={0} panels={2} />
      </PageShell>
    );
  }

  if (!access?.canEditAgencySettings) {
    return (
      <PageShell>
        <div className="mx-auto max-w-xl">
          <Panel title="Agency settings are limited to administrators">
            <p className="text-sm text-muted-foreground">
              Your account can't change this agency's name, branding, automations or integrations.
              The agency owner, or an admin they've granted access to, can — ask them, or ask to be
              granted admin access on the Roles page.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/settings">Back to settings</Link>
            </Button>
          </Panel>
        </div>
      </PageShell>
    );
  }

  return <AgencySettingsPage />;
}

/**
 * The owner's own participation in the shared surfaces. Distinct from the
 * per-child rollup terms on Sub-Agencies: those decide whether a CHILD's
 * numbers flow up; these decide whether the OWNER's personal deals appear in
 * the feed and on leaderboards at all. An IMO owner running the rollup can
 * keep their personal production out of every downline's chat and off the
 * rankings without touching anyone else's numbers.
 */
function VisibilityPanel() {
  const qc = useQueryClient();
  const getFn = useServerFn(getOrgSettings);
  const saveFn = useServerFn(updateOrgSettings);
  const { data } = useQuery({ queryKey: ["org-settings"], queryFn: () => getFn() });

  const save = useMutation({
    mutationFn: (p: any) => saveFn({ data: p }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["org-settings"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that"),
  });

  const settings = (data as any)?.settings;
  if (!settings || !(data as any)?.isOwner) return null;

  const rows = [
    {
      key: "show_own_sales_in_feed",
      label: "Show my own sales in the team sales feed",
      help: "Off keeps your personal deals out of the Discord feed — yours and every agency's above you.",
    },
    {
      key: "show_own_on_leaderboards",
      label: "Show my own numbers on leaderboards",
      help: "Off removes only your line from the rankings; your team's numbers are untouched.",
    },
  ] as const;

  return (
    <Panel title="Visibility" className="mt-4">
      <div className="divide-y divide-border-soft">
        {rows.map((r) => (
          <label key={r.key} className="flex items-start gap-3 py-2.5">
            <input
              type="checkbox"
              checked={settings[r.key] !== false}
              disabled={save.isPending}
              onChange={(e) => save.mutate({ [r.key]: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-[var(--gold)]"
            />
            <span className="min-w-0">
              <span className="block text-sm text-foreground">{r.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{r.help}</span>
            </span>
          </label>
        ))}
      </div>
    </Panel>
  );
}

// Derived, not retyped. A second list of tab names is how the rail, the
// permission map and the alias table stop agreeing about what exists.
const TABS = SETTINGS_TABS;
type Tab = SettingsTab;

/** Old bookmarks and palette entries that named a tab we no longer have. */
const TAB_ALIASES: Record<string, Tab> = {
  emails: "general",
  "comp-grids": "carriers",
  templates: "contracting",
  grids: "carriers",
  // Notifications left Agency Settings for /settings/notifications, because it
  // edits your own preferences rather than the agency's and so could never be
  // gated like the rest. An old link lands on General rather than nowhere; the
  // route itself redirects.
  notifications: "general",
};

export function normalizeTab(raw: unknown): Tab | undefined {
  if (typeof raw !== "string") return undefined;
  if ((TABS as readonly string[]).includes(raw)) return raw as Tab;
  return TAB_ALIASES[raw];
}

/**
 * Everything about how the agency itself runs, in eight tabs.
 *
 * Settings listed nineteen rows, of which ten were agency configuration
 * screens sitting at the same level as "Security" and "Nova Pro". An owner
 * looking for where compensation is set up had to read all nineteen and guess
 * between "Carriers", "Comp Grids", "Levels & Positions" and "How contracting
 * works" — four rows for one job.
 *
 * They are one page now, in the order the work actually happens: who you are,
 * who may do what, the ladder, the carriers, the rules, then how the workspace
 * talks to people and to other software. Levels comes before Carriers because
 * the ladder is what carrier levels get mapped onto.
 */
function AgencySettingsPage() {
  const { tab } = Route.useSearch();
  const { access } = useMyAccess();

  // One answer to "may this person open this tab", shared with the server
  // functions behind each panel. A tab somebody cannot open is dropped rather
  // than disabled: a disabled tab advertises a capability and then refuses it,
  // which reads as a fault rather than as a boundary.
  const ctx: AccessContext = {
    isOwner: Boolean(access?.canManageRoles),
    isPlatformAdmin: access?.role === "super_admin",
    isStaff: Boolean(access?.inAgency),
    perms: (access?.permissions ?? {}) as AccessContext["perms"],
  };
  const allowed = visibleTabs(ctx);
  const landing = defaultTab(ctx, tab ?? null);
  const [active, setActive] = useState<SettingsTab>(landing ?? "general");

  // A deep link to a tab they cannot open, or a permission changing underneath
  // them, must move them somewhere real rather than leave a blank panel.
  useEffect(() => {
    if (landing && !allowed.includes(active)) setActive(landing);
  }, [landing, allowed, active]);

  const hubs = HUBS.filter((h) => h.tabs.some((t) => allowed.includes(t)));
  const activeHub = hubFor(active);
  const [carrierAdv, setCarrierAdv] = useState(false);
  const { data: accessState } = useAccessState();
  const openHub = (h: Hub) => setActive(HUBS.find((x) => x.id === h)!.tabs.find((t) => allowed.includes(t)) ?? "general");
  const has = (t: SettingsTab) => allowed.includes(t);

  return (
    <PageShell>
      <div className="space-y-[var(--gap)]">
        <HeroBand title="Agency settings" subtitle="Everything about how your agency looks and runs." />
        <InheritParentPanel />
        <AgencySetupProgress onOpenTab={(t) => setActive(normalizeTab(t) ?? "general")} />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
          <nav aria-label="Agency settings sections" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:flex md:flex-col md:self-start md:sticky md:top-4">
            {hubs.map((h) => (
              <button
                key={h.id} type="button" onClick={() => openHub(h.id)}
                aria-current={activeHub === h.id ? "page" : undefined}
                className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  activeHub === h.id ? "bg-ink text-ink-foreground shadow-sm" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground")}
              >
                <h.icon className="h-4 w-4 shrink-0" /> {h.label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 space-y-6 overflow-hidden">
            {activeHub === "identity" && (
              <>
                <IdentityHub />
                <VisibilityPanel />
                <SampleDataPanel />
              </>
            )}
            {activeHub === "carriers" && (
              <CarriersHub
                advancedOpen={carrierAdv}
                onAdvancedChange={setCarrierAdv}
                advanced={<>
                  {has("carriers") && <><SuggestedCarriersPanel /><CarrierDirectoryPage onConfigureLevels={() => setActive("levels")} /></>}
                  {has("levels") && <><LevelsPanel /><RenewalsPanel /></>}
                </>}
              />
            )}
            {activeHub === "contracting" && <ContractingTab />}
            {activeHub === "connections" && (
              <ConnectionsHub
                showFeed={has("automations")}
                integrations={has("integrations") ? <IntegrationsCatalog onOpenTab={(t) => setActive(normalizeTab(t) ?? "automations")} /> : null}
                advanced={<>
                  {has("automations") && <DiscordSettings />}
                  {has("integrations") && <ApiKeysPanel />}
                </>}
              />
            )}
            {activeHub === "team" && <TeamHub isSolo={accessState?.plan === "solo"} isOwner={Boolean(accessState?.isOwner)} />}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

type Hub = "identity" | "carriers" | "contracting" | "connections" | "team";
const HUBS: { id: Hub; label: string; icon: typeof Palette; tabs: SettingsTab[] }[] = [
  { id: "identity", label: "Identity", icon: Palette, tabs: ["general"] },
  { id: "carriers", label: "Carriers & Comp", icon: Building2, tabs: ["carriers", "levels"] },
  { id: "contracting", label: "Contracting", icon: FileSignature, tabs: ["contracting"] },
  { id: "connections", label: "Connections", icon: Plug, tabs: ["automations", "integrations"] },
  { id: "team", label: "Team & roles", icon: Users, tabs: ["roles"] },
];
function hubFor(t: SettingsTab): Hub {
  return HUBS.find((h) => h.tabs.includes(t))?.id ?? "identity";
}

function SectionHead({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{blurb}</p>
    </div>
  );
}

/** The contracting policy, its checklist, and the packets it generates. */
function ContractingTab() {
  const { data: setup } = useQuery({
    queryKey: ["settings", "contracting-setup"],
    queryFn: () => getContractingSetupStatus(),
  });
  return (
    <ContractingHub
      progress={setup?.available ? { done: setup.progress.done, total: setup.progress.total } : null}
      advanced={<>
        {setup?.available && <SetupChecklist steps={setup.steps} progress={setup.progress} ready={setup.ready} />}
        <ContractingSettingsPanel />
        <TemplatesPanel />
      </>}
    />
  );
}
