import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/nova/settings")({
  head: () => ({
    meta: [
      { title: "Nova Settings — Agent Cloud" },
      { name: "description", content: "Configure Nova AI automations: policy recovery, SMS follow-ups, birthdays, and beneficiary outreach." },
    ],
  }),
  component: NovaSettingsPage,
});

const TOGGLES = [
  { key: "recovery", label: "Policy Recovery", desc: "Automatically call lapsed and lapse-pending policyholders to recover them.", enabled: true, last: "12 calls in last 24h" },
  { key: "sms", label: "SMS Follow-up", desc: "Send AI-personalized SMS follow-ups after every appointment and call.", enabled: true, last: "47 messages sent yesterday" },
  { key: "birthday", label: "Birthday Messages", desc: "Send a branded birthday text to every client on their special day.", enabled: false, last: "Off since Apr 2026" },
  { key: "beneficiary", label: "Beneficiary Engagement", desc: "Quarterly check-ins with named beneficiaries to keep policies in force.", enabled: true, last: "Last run 3 days ago" },
];

function NovaSettingsPage() {
  return (
    <Card>
      <CardHeader><CardTitle>Automations</CardTitle></CardHeader>
      <CardContent className="divide-y">
        {TOGGLES.map((t) => (
          <div key={t.key} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
            <div className="flex-1">
              <div className="font-medium">{t.label}</div>
              <div className="text-sm text-muted-foreground mt-1">{t.desc}</div>
              <div className="text-xs text-muted-foreground mt-1">{t.last}</div>
            </div>
            <Switch defaultChecked={t.enabled} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
