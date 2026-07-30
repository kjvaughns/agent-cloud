import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, ShieldCheck, UploadCloud, ChevronRight } from "lucide-react";
import { getMyAccess } from "@/lib/permissions.functions";

import { BillingPage } from "./settings.billing";
import { NovaProPage } from "./settings.nova-pro";
import { SecurityPage } from "./settings.security";
import { NotificationSettings } from "./settings.notifications";
import { AgencyTeamPage } from "./agency.team";
import { DiscordSettings } from "@/components/discord-settings";
import { SupportConsole } from "@/components/support-console";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({ meta: [{ title: "Settings — Agent Cloud" }] }),
  component: SettingsHub,
});

type TabKey = "billing" | "nova" | "security" | "notifications" | "support" | "integrations" | "management";

/**
 * One Settings page instead of four sidebar entries.
 *
 * Each tab renders the existing page component unchanged — PageShell is
 * nesting-aware, so the inner shell collapses and the page body drops
 * straight into the tab without any of them needing an `embedded` prop.
 *
 * Every original route still resolves, so bookmarks and in-app links keep
 * working.
 */
function SettingsHub() {
  const accessFn = useServerFn(getMyAccess);
  const { data: access, isLoading } = useQuery({ queryKey: ["my-access"], queryFn: () => accessFn() });
  const [tab, setTab] = useState<TabKey>("billing");

  if (isLoading) {
    return <PageShell><Skeleton className="h-72" /></PageShell>;
  }

  // Computed server-side by getMyAccess so this and the server's own check
  // cannot disagree. Deriving it from isOwner here hid Support Desk,
  // Integrations and Management from any owner whose account was never
  // written into organizations.owner_id — the same bug already fixed on the
  // Team page, missed in this file.
  const canManage = Boolean(access?.canManageRoles);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "billing", label: "Billing" },
    { key: "nova", label: "Nova Pro" },
    { key: "security", label: "Security" },
    { key: "notifications", label: "Notifications" },
    ...(canManage ? [{ key: "support" as TabKey, label: "Support Desk" }] : []),
    ...(canManage ? [{ key: "integrations" as TabKey, label: "Integrations" }] : []),
    ...(canManage ? [{ key: "management" as TabKey, label: "Management" }] : []),
  ];

  return (
    <PageShell>
      <div className="max-w-[1100px] mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand title="Settings" subtitle="Your account, your subscription, and your agency" />

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
          <TabsList className="flex-wrap h-auto gap-1 bg-card border border-border rounded-[var(--radius)] p-1">
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="min-w-0">
          {tab === "billing" && <BillingPage />}
          {tab === "nova" && <NovaProPage />}
          {tab === "security" && <SecurityPage />}
          {tab === "notifications" && <NotificationSettings />}
          {tab === "support" && canManage && <SupportConsole />}
          {tab === "integrations" && canManage && <DiscordSettings />}
          {tab === "management" && canManage && <ManagementTab isOwner={canManage} />}
        </div>
      </div>
    </PageShell>
  );
}

/**
 * Agency management. Roles and permissions render inline because that is the
 * thing owners come here to do; the rest are links, since they are full pages
 * of their own and burying them in a tab would make them harder to find, not
 * easier.
 */
function ManagementTab({ isOwner }: { isOwner: boolean }) {
  const links = [
    {
      to: "/agency/settings",
      icon: Building2,
      title: "Agency Settings",
      body: "Name, subdomain, logo and brand colour.",
      ownerOnly: true,
    },
    {
      to: "/intake",
      icon: UploadCloud,
      title: "Document Intake",
      body: "Bulk-upload carrier reports for Nova to sort.",
      ownerOnly: false,
    },
    {
      to: "/contracting/comp-grids-manage",
      icon: ShieldCheck,
      title: "Commission Grids",
      body: "Your carrier contract levels — these drive every payout forecast.",
      ownerOnly: true,
    },
  ].filter((l) => !l.ownerOnly || isOwner);

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      {links.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {links.map((l) => (
            <Link key={l.to} to={l.to}>
              <Panel className="ac-lift h-full hover:border-primary/40">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <l.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-sm font-semibold">
                      {l.title}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{l.body}</p>
                  </div>
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      )}

      {/* Roles, permissions and promotions. */}
      <AgencyTeamPage />
    </div>
  );
}
