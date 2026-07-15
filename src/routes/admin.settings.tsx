import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
  head: () => ({ meta: [{ title: "Settings — Agent Cloud Admin" }] }),
});

function AdminSettings() {
  const [agencyName, setAgencyName] = useState("");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [notifyNewAgent, setNotifyNewAgent] = useState(true);
  const [notifyNewTicket, setNotifyNewTicket] = useState(true);
  const [notifyContract, setNotifyContract] = useState(true);

  function save() {
    toast.success("Settings saved");
  }

  return (
    <PageShell>
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Admin Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Agency-wide configuration</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Agency Info</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Agency Name</label>
            <Input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="My Insurance Agency" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Primary Admin Email</label>
            <Input type="email" value={primaryEmail} onChange={(e) => setPrimaryEmail(e.target.value)} placeholder="admin@agency.com" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Support Reply-From Email</label>
            <Input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="support@agency.com" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Onboarding Defaults</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Welcome Message</label>
            <Textarea
              value={welcomeMsg}
              onChange={(e) => setWelcomeMsg(e.target.value)}
              placeholder="Welcome to Agent Cloud! Here's how to get started..."
              className="min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground mt-1">Shown to new agents on first login</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Notification Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">New Agent Joined</p>
              <p className="text-xs text-muted-foreground">Email when a new agent completes signup</p>
            </div>
            <Switch checked={notifyNewAgent} onCheckedChange={setNotifyNewAgent} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">New Support Ticket</p>
              <p className="text-xs text-muted-foreground">Email when an agent opens a support ticket</p>
            </div>
            <Switch checked={notifyNewTicket} onCheckedChange={setNotifyNewTicket} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Contract Request Submitted</p>
              <p className="text-xs text-muted-foreground">Email when an agent requests a new contract</p>
            </div>
            <Switch checked={notifyContract} onCheckedChange={setNotifyContract} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={save}>Save Settings</Button>
    </div>
    </PageShell>
  );
}
