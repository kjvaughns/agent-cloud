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
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyAccess } from "@/hooks/use-my-access";
import {
  canOpenTab, visibleTabs, defaultTab, TAB_LABEL,
  type SettingsTab, type AccessContext,
} from "@/lib/settings/tab-access";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AutomationsPage } from "@/components/settings/automations-panel";
import { DiscordSettings } from "@/components/discord-settings";
import { SampleDataPanel } from "@/components/settings/sample-data-panel";
import { NotificationsPanel } from "@/components/settings/notifications-panel";
import { IntegrationsCatalog } from "@/components/settings/integrations-catalog";
import { AgencySetupProgress } from "@/components/settings/agency-setup-progress";
import { AgencyTeamPage } from "@/components/agency-team-page";
import { LevelsPanel } from "@/components/contracting/levels-panel";
import { CarrierDirectoryPage } from "@/components/contracting/carrier-setup";
import { ManageGridsPage } from "@/components/contracting/manage-grids";
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
        <Skeleton className="h-64 rounded-xl" />
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

function GeneralTab() {
  const { org } = useOrganization();
  const qc = useQueryClient();
  const updateFn = useServerFn(updateOrganization);

  const [form, setForm] = useState({
    name:         org?.name ?? "",
    tagline:      org?.tagline ?? "",
    accent_color: org?.accent_color ?? "#C9A227",
    slug:         org?.slug ?? "",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const { access } = useMyAccess();

  // Logo and accent colour are every agency's, on every plan. They used to be
  // hidden unless `plan_type === "white_label"`, which left an owner with a
  // name field, a tagline field and an advert — and the accent they could not
  // set was the only thing standing between the product and looking like
  // theirs.
  //
  // What White Label still buys is the part that needs a human: a custom
  // domain, the branded sign-in page on it, and the setup conversation. The
  // subdomain field below stays with it, because nothing in this codebase
  // provisions DNS and a field that quietly does nothing is worse than no
  // field at all.
  const whiteLabel = org?.plan_type === "white_label";

  // The subdomain is globally unique and decides where traffic goes, so the
  // server keeps it owner-only. Disabling it here means the refusal is visible
  // before somebody types into it rather than after they press save.
  const canEditSlug = Boolean(access?.isOwner);

  // Sync form when org loads
  useQuery({
    queryKey: ["organization-init", org?.id],
    queryFn: () => {
      if (org) {
        setForm({
          name:         org.name,
          tagline:      org.tagline ?? "",
          accent_color: org.accent_color ?? "#C9A227",
          slug:         org.slug,
        });
      }
      return null;
    },
    enabled: !!org,
  });

  // Revoked on change and on unmount. Without this every file the user picks
  // leaks a blob for the lifetime of the tab.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!logoFile) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(logoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const logoPreview = previewUrl ?? org?.logo_url ?? null;

  /**
   * Save, and tell the truth about what saved.
   *
   * The old version uploaded to a path row-level security always rejected,
   * swallowed the rejection with a bare `if (!uploadErr)`, saved the rest of
   * the form and then said "Agency settings saved!". The logo on screen was a
   * local `blob:` URL, so it looked right until the first reload and then was
   * simply gone — with nothing anywhere reporting a failure.
   *
   * The upload is now its own step with its own failure. A logo that did not
   * upload does not stop the name and tagline being saved — losing typing
   * because a picture failed is its own annoyance — but it is reported
   * separately and never counted as success.
   */
  async function save() {
    setSaving(true);
    try {
      let logo_url: string | undefined;
      let logoError: string | null = null;

      if (logoFile && org?.id) {
        try {
          logo_url = (await uploadOrgLogo(org.id, logoFile)).url;
        } catch (e: any) {
          logoError = e?.message ?? "The logo could not be uploaded.";
        }
      }

      await updateFn({
        data: {
          name: form.name,
          tagline: form.tagline,
          accent_color: form.accent_color,
          // Omitted entirely rather than sent unchanged when this person may
          // not change it — the server rejects the field, not the value.
          ...(canEditSlug ? { slug: form.slug } : {}),
          ...(logo_url ? { logo_url } : {}),
        },
      });

      qc.invalidateQueries({ queryKey: ["organization"] });
      if (logo_url) setLogoFile(null);

      if (logoError) toast.error(`Saved, but the logo did not upload. ${logoError}`);
      else toast.success("Agency settings saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Your agency name and tagline appear in the sidebar and on every email your
        agency sends.
      </p>

      <Card>
        <CardContent className="p-6 space-y-5">
          {/* Logo — every plan */}
          <div className="space-y-2">
            <Label>Agency Logo</Label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  className="h-14 w-14 rounded-xl object-contain border"
                  alt="Logo preview"
                />
              ) : (
                <div className="h-14 w-14 rounded-xl bg-muted border grid place-items-center text-muted-foreground text-xs">
                  Logo
                </div>
              )}
              <label htmlFor="logo-upload" className="cursor-pointer">
                <Button variant="outline" size="sm" asChild>
                  <span><Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Logo</span>
                </Button>
                <input
                  id="logo-upload"
                  type="file"
                  accept={LOGO_LIMIT.accept}
                  className="hidden"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              PNG or SVG recommended. Square logos work best. Up to {LOGO_LIMIT.label}.
              {logoFile && " Not uploaded until you save."}
            </p>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label>Agency Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. APEX Financial Empire"
            />
          </div>

          {/* Tagline */}
          <div className="space-y-1.5">
            <Label>Tagline <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              placeholder="e.g. Building generational wealth"
              maxLength={60}
            />
          </div>

          {/* Accent colour — every plan */}
          <div className="space-y-1.5">
            <Label>Accent Color</Label>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="color"
                value={form.accent_color}
                onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                className="h-10 w-16 rounded-md border cursor-pointer p-1"
              />
              <Input
                value={form.accent_color}
                onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                className="w-28 font-mono text-sm"
                maxLength={7}
              />
              <div
                className="h-10 w-10 rounded-md border shrink-0"
                style={{ backgroundColor: form.accent_color }}
              />
              <p className="text-xs text-muted-foreground">Used for buttons, badges, and highlights.</p>
            </div>
          </div>

          {/* Subdomain — still White Label, because nothing here provisions DNS */}
          <div className="space-y-1.5">
            <Label>Your Subdomain</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                value={form.slug}
                disabled={!whiteLabel || !canEditSlug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                className="max-w-[180px] font-mono text-sm"
              />
              <span className="text-muted-foreground text-sm">.agentcloud.com</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {!whiteLabel
                ? "A domain of your own is set up with our team as part of White Label — it needs DNS pointed at us, so it isn't something this page can switch on."
                : !canEditSlug
                  ? "Only the agency owner can change the subdomain."
                  : <>Your team will access your platform at <strong>{form.slug || "…"}.agentcloud.com</strong></>}
            </p>
          </div>

          {!whiteLabel && (
            <div className="rounded-[var(--radius)] border border-border bg-surface-2 p-4">
              <p className="text-sm font-medium">Want your own domain too?</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                The logo and colour above are yours on every plan and apply as soon as you save.
                White Label adds the part that needs setting up with us: your own domain, a
                sign-in page on it carrying your brand rather than ours, and a call to get it live.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                {/* Straight to the panel. `/settings/white-label` is a
                    beforeLoad redirect to this same place, so linking to it
                    just adds a hop. */}
                <Link to="/settings/billing" search={{ tab: "white-label" } as any}>
                  Apply for White Label →
                </Link>
              </Button>
            </div>
          )}

          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save Agency Settings"}
          </Button>
        </CardContent>
      </Card>

      {/* Below the agency's own settings rather than tucked into a tab of its
          own: this is the button somebody looks for when they have decided the
          made-up clients have to go, and a search for it should end on the
          first page they open. */}
      <SampleDataPanel />
    </div>
  );
}

const TABS = [
  "general",
  "roles",
  "levels",
  "carriers",
  "contracting",
  "notifications",
  "automations",
  "integrations",
] as const;
type Tab = (typeof TABS)[number];

/** Old bookmarks and palette entries that named a tab we no longer have. */
const TAB_ALIASES: Record<string, Tab> = {
  emails: "general",
  "comp-grids": "carriers",
  templates: "contracting",
  grids: "carriers",
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

  return (
    <PageShell>
      <div className="space-y-[var(--gap)]">
        <HeroBand
          title="Agency settings"
          subtitle="Your agency, your ladder, your carriers, and how this workspace connects"
        />

        <AgencySetupProgress onOpenTab={(t) => setActive((normalizeTab(t) ?? "general"))} />

        <Tabs value={active} onValueChange={(v) => setActive(v as SettingsTab)}>
          <TabsList className="flex-wrap">
            {canOpenTab("general", ctx) && <TabsTrigger value="general">{TAB_LABEL.general}</TabsTrigger>}
            {canOpenTab("roles", ctx) && <TabsTrigger value="roles">{TAB_LABEL.roles}</TabsTrigger>}
            {canOpenTab("levels", ctx) && <TabsTrigger value="levels">{TAB_LABEL.levels}</TabsTrigger>}
            {canOpenTab("carriers", ctx) && <TabsTrigger value="carriers">{TAB_LABEL.carriers}</TabsTrigger>}
            {canOpenTab("contracting", ctx) && <TabsTrigger value="contracting">{TAB_LABEL.contracting}</TabsTrigger>}
            {canOpenTab("notifications", ctx) && <TabsTrigger value="notifications">{TAB_LABEL.notifications}</TabsTrigger>}
            {canOpenTab("automations", ctx) && <TabsTrigger value="automations">{TAB_LABEL.automations}</TabsTrigger>}
            {canOpenTab("integrations", ctx) && <TabsTrigger value="integrations">{TAB_LABEL.integrations}</TabsTrigger>}
          </TabsList>

          <TabsContent value="general" className="mt-4"><GeneralTab /><VisibilityPanel /></TabsContent>

          <TabsContent value="roles" className="mt-4">
            {access?.canManageRoles ? (
              <AgencyTeamPage embedded />
            ) : (
              <Panel title="Roles are limited to administrators">
                <p className="text-sm text-muted-foreground">
                  Changing who can do what is reserved for the agency owner and the admins they
                  have granted access to.
                </p>
              </Panel>
            )}
          </TabsContent>

          <TabsContent value="levels" className="mt-4">
            <SectionHead
              title="Levels & Positions"
              blurb="Your ladder. Each position has a base percentage and a mapping to every active carrier's own levels."
            />
            <LevelsPanel />
          </TabsContent>

          <TabsContent value="carriers" className="mt-4 space-y-6">
            <div>
              <SectionHead
                title="Carriers"
                blurb="The carriers your agency writes with. A carrier only becomes visible to agents once its setup can pay a deal."
              />
              <CarrierDirectoryPage onConfigureLevels={() => setActive("levels")} />
            </div>
            <div>
              <SectionHead
                title="Comp grids"
                blurb="What each carrier pays, by level, product and age band. Every payout forecast reads these numbers."
              />
              <ManageGridsPage embedded />
            </div>
          </TabsContent>

          <TabsContent value="contracting" className="mt-4 space-y-6">
            <ContractingTab />
          </TabsContent>

          <TabsContent value="notifications" className="mt-4"><NotificationsPanel /></TabsContent>
          <TabsContent value="automations" className="mt-4 space-y-6">
            <AutomationsPage />
            <DiscordSettings />
          </TabsContent>
          <TabsContent value="integrations" className="mt-4">
            <IntegrationsCatalog onOpenTab={(t) => setActive((normalizeTab(t) ?? "automations"))} />
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
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
    <>
      <div>
        <SectionHead
          title="How contracting works"
          blurb="Who can request, what needs approval, and how fast requests should move."
        />
        {setup?.available && (
          <div className="mb-4">
            <SetupChecklist steps={setup.steps} progress={setup.progress} ready={setup.ready} />
          </div>
        )}
        <ContractingSettingsPanel />
      </div>
      <div>
        <SectionHead
          title="Submission templates"
          blurb="The email bodies and spreadsheet layouts submission packets are generated from."
        />
        <TemplatesPanel />
      </div>
    </>
  );
}

