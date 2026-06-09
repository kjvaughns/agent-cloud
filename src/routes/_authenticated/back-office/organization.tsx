import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/use-organization";
import { updateOrganization } from "@/lib/organization.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/back-office/organization" as any)({
  ssr: false,
  head: () => ({ meta: [{ title: "Agency Settings — Agent Cloud" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" as any });
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.session.user.id)
      .in("role", ["super_admin", "agency_owner"] as any)
      .maybeSingle();
    if (!roleRow) throw redirect({ to: "/dashboard" as any });
  },
  component: OrganizationSettings,
});

function OrganizationSettings() {
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
    <div className="p-4 md:p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agency Settings</h1>
        <p className="text-muted-foreground mt-1">
          Customize how your agency appears to your team on Agent Cloud.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          {/* Logo */}
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

          {/* Accent color */}
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

          {/* Subdomain */}
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

          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save Agency Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
