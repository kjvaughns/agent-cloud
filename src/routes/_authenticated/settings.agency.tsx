import { requireSession } from "@/lib/require-session";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/use-organization";
import { updateOrganization } from "@/lib/organization.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { PageShell, HeroBand } from "@/components/page-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmailsPage } from "@/components/settings/emails-panel";
import { AutomationsPage } from "@/components/settings/automations-panel";
import { DiscordSettings } from "@/components/discord-settings";

export const Route = createFileRoute("/_authenticated/settings/agency")({
  ssr: false,
  head: () => ({ meta: [{ title: "Agency Settings — Agent Cloud" }] }),
  // ?tab= so the palette and the old /settings/emails bookmark can land on
  // the right one rather than dumping you on General.
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => {
    const t = s.tab;
    return TABS.includes(t as Tab) ? { tab: t as Tab } : {};
  },
  beforeLoad: async () => {
    const session = await requireSession();
    // limit(1), not maybeSingle(): maybeSingle errors when more than one row
    // matches, and an owner holds several of these roles at once.
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .in("role", ["super_admin", "agency_owner", "admin"] as any)
      .limit(1);
    if (!roleRows?.length) throw redirect({ to: "/dashboard" as any });
  },
  component: AgencySettingsPage,
});

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

  // Logo, accent colour and subdomain are the White Label product. Showing
  // them to everyone means most agencies configure branding that never
  // renders — the theme override and custom domain only apply on that plan.
  const whiteLabel = org?.plan_type === "white_label";

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

  const logoPreview = logoFile ? URL.createObjectURL(logoFile) : (org?.logo_url ?? null);

  async function save() {
    setSaving(true);
    try {
      let logo_url = org?.logo_url ?? null;

      if (logoFile && org?.id) {
        const ext = logoFile.name.split(".").pop();
        const path = `org-logos/${org.id}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("agent-documents")
          .upload(path, logoFile, { upsert: true });
        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage
            .from("agent-documents")
            .getPublicUrl(path);
          logo_url = publicUrl;
        }
      }

      await updateFn({ data: { ...form, logo_url } });
      qc.invalidateQueries({ queryKey: ["organization"] });
      toast.success("Agency settings saved!");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
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
          {/* Logo — White Label only */}
          {whiteLabel && (
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
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">PNG or SVG recommended. Square logos work best.</p>
          </div>
          )}

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

          {/* Accent colour — White Label only */}
          {whiteLabel && (
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
          )}

          {/* Subdomain — White Label only */}
          {whiteLabel && (
          <div className="space-y-1.5">
            <Label>Your Subdomain</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                className="max-w-[180px] font-mono text-sm"
              />
              <span className="text-muted-foreground text-sm">.agentcloud.com</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Your team will access your platform at <strong>{form.slug || "…"}.agentcloud.com</strong>
            </p>
          </div>
          )}

          {!whiteLabel && (
            <div className="rounded-[var(--radius)] border border-border bg-surface-2 p-4">
              <p className="text-sm font-medium">Want your own logo, colours and domain?</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Custom branding is part of White Label. Your agency name and tagline above
                apply on every plan.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to="/settings/white-label">Apply for White Label →</Link>
              </Button>
            </div>
          )}

          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save Agency Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

const TABS = ["general", "emails", "automations", "integrations"] as const;
type Tab = (typeof TABS)[number];

/**
 * Everything about how the agency itself runs.
 *
 * Emails, Automations and Integrations were three sidebar rows of their own,
 * which made Settings nine deep and buried the two things people actually
 * open. They are the same subject as the name and logo above them — how this
 * workspace behaves — so they are tabs of it now.
 */
function AgencySettingsPage() {
  const { tab } = Route.useSearch();
  const [active, setActive] = useState<Tab>(tab ?? "general");

  return (
    <PageShell>
      <div className="space-y-[var(--gap)]">
        <HeroBand title="Agency settings" subtitle="How your workspace looks, sends, and connects" />

        <Tabs value={active} onValueChange={(v) => setActive(v as Tab)}>
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="emails">Emails</TabsTrigger>
            <TabsTrigger value="automations">Automations</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4"><GeneralTab /></TabsContent>
          <TabsContent value="emails" className="mt-4"><EmailsPage /></TabsContent>
          <TabsContent value="automations" className="mt-4"><AutomationsPage /></TabsContent>
          <TabsContent value="integrations" className="mt-4"><DiscordSettings /></TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}
