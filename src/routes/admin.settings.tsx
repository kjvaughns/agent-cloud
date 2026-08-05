import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { getOrgSettings, updateOrgSettings } from "@/lib/org-settings.functions";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
  head: () => ({ meta: [{ title: "Settings — Agent Cloud Admin" }] }),
});

type Form = {
  support_email: string;
  primary_admin_email: string;
  welcome_message: string;
  notify_new_agent: boolean;
  notify_new_ticket: boolean;
  notify_contract_request: boolean;
  collect_contracting_pii: boolean;
};

const EMPTY: Form = {
  support_email: "",
  primary_admin_email: "",
  welcome_message: "",
  notify_new_agent: false,
  notify_new_ticket: false,
  notify_contract_request: false,
  collect_contracting_pii: false,
};

function AdminSettings() {
  const qc = useQueryClient();
  const getFn = useServerFn(getOrgSettings);
  const saveFn = useServerFn(updateOrgSettings);

  const { data, isLoading } = useQuery({ queryKey: ["org-settings"], queryFn: () => getFn() });
  const [form, setForm] = useState<Form>(EMPTY);
  const [dirty, setDirty] = useState(false);

  // Hydrate once the server value arrives.
  useEffect(() => {
    const s = data?.settings;
    if (!s) return;
    setForm({
      support_email: s.support_email ?? "",
      primary_admin_email: s.primary_admin_email ?? "",
      welcome_message: s.welcome_message ?? "",
      notify_new_agent: s.notify_new_agent,
      collect_contracting_pii: s.collect_contracting_pii,
      notify_new_ticket: s.notify_new_ticket,
      notify_contract_request: s.notify_contract_request,
    });
    setDirty(false);
  }, [data]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          support_email: form.support_email.trim() || null,
          primary_admin_email: form.primary_admin_email.trim() || null,
          welcome_message: form.welcome_message.trim() || null,
          notify_new_agent: form.notify_new_agent,
          collect_contracting_pii: form.collect_contracting_pii,
          notify_new_ticket: form.notify_new_ticket,
          notify_contract_request: form.notify_contract_request,
        },
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["org-settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't save settings"),
  });

  if (isLoading) {
    return (
      <PageShell>
        <div className="space-y-6 max-w-2xl">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-48" />
          <Skeleton className="h-40" />
        </div>
      </PageShell>
    );
  }

  if (!data?.settings) {
    return (
      <PageShell>
        <div className="max-w-2xl">
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No organization is attached to your account yet.
            </CardContent>
          </Card>
        </div>
      </PageShell>
    );
  }

  const readOnly = !data.isOwner;

  return (
    <PageShell>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Admin Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agency-wide configuration{data.orgName ? ` for ${data.orgName}` : ""}
          </p>
        </div>

        {readOnly && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Only the agency owner can change these settings. You're viewing them read-only.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Operational Contacts</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Primary Admin Email</label>
              <Input
                type="email" disabled={readOnly}
                value={form.primary_admin_email}
                onChange={(e) => set("primary_admin_email", e.target.value)}
                placeholder="admin@agency.com"
              />
              <p className="text-xs text-muted-foreground mt-1">Where agency-level alerts are sent.</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Support Reply-From Email</label>
              <Input
                type="email" disabled={readOnly}
                value={form.support_email}
                onChange={(e) => set("support_email", e.target.value)}
                placeholder="support@agency.com"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Agency name, logo and branding live in{" "}
              <Link to="/settings/agency" className="text-primary hover:underline">Agency Settings</Link>.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Onboarding Defaults</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Welcome Message</label>
              <Textarea
                disabled={readOnly}
                value={form.welcome_message}
                onChange={(e) => set("welcome_message", e.target.value)}
                placeholder="Welcome to the team! Here's how to get started..."
                className="min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground mt-1">Shown to new agents on first login</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Contracting paperwork</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Agent Cloud does not submit contracting to carriers, so it does not ask your agents
              for the details a carrier application needs. Turn this on only if your agency
              submits that paperwork itself and wants to collect them here.
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Collect SSN, driver's licence and banking</p>
                <p className="text-xs text-muted-foreground">
                  Adds those fields back to the Producer Profile and counts them toward
                  profile completeness. Off by default.
                </p>
              </div>
              <Switch
                disabled={readOnly}
                checked={form.collect_contracting_pii}
                onCheckedChange={(v) => set("collect_contracting_pii", v)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Automated Notifications</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              All automated email is off until you turn it on here. Nothing sends on your agency's
              behalf without this.
            </p>
            {([
              ["notify_new_agent", "New Agent Joined", "Email when a new agent completes signup"],
              ["notify_new_ticket", "New Support Ticket", "Email when an agent opens a support ticket"],
              ["notify_contract_request", "Contract Request Submitted", "Email when an agent requests a new contract"],
            ] as const).map(([key, title, desc]) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Switch
                  disabled={readOnly}
                  checked={form[key]}
                  onCheckedChange={(v) => set(key, v)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Button onClick={() => save.mutate()} disabled={readOnly || !dirty || save.isPending}>
          {save.isPending ? "Saving…" : dirty ? "Save Settings" : "Saved"}
        </Button>
      </div>
    </PageShell>
  );
}
