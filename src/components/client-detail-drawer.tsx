// DEPRECATED — use src/components/pipeline/client-detail-drawer.tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { TemperatureBadge } from "@/components/temperature-badge";
import { StatusBadge } from "@/components/status-badge";
import { type MockClient } from "@/lib/mock-data";
import { fmtCurrency, fmtPhone } from "@/lib/format";
import {
  Phone, Mail, MapPin, Calendar, Plus, FileText, Users, DollarSign,
  Heart, ClipboardList, MessageSquare,
} from "lucide-react";

interface Props {
  client: MockClient | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const TABS = [
  { v: "needs", label: "Needs Analysis", icon: ClipboardList },
  { v: "notes", label: "Notes", icon: FileText },
  { v: "schedule", label: "Schedule", icon: Calendar },
  { v: "beneficiaries", label: "Beneficiaries", icon: Users },
  { v: "referrals", label: "Referrals", icon: Users },
  { v: "financials", label: "Financials", icon: DollarSign },
  { v: "care", label: "Client Care", icon: Heart },
  { v: "policies", label: "Policies", icon: FileText },
  { v: "email", label: "Email", icon: MessageSquare },
];

export function ClientDetailDrawer({ client, open, onOpenChange }: Props) {
  if (!client) return null;
  const initials = `${client.first_name[0]}${client.last_name[0]}`;
  const policies = MOCK_POLICIES.filter((p) => p.client_id === client.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="p-6 border-b">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-xl">{client.first_name} {client.last_name}</SheetTitle>
              <div className="flex items-center gap-2 mt-1">
                <TemperatureBadge value={client.temperature} />
                <span className="text-xs text-muted-foreground">Source: {client.source}</span>
              </div>
              <div className="flex flex-wrap gap-3 mt-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {fmtPhone(client.phone)}</span>
                <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {client.email}</span>
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {client.city}, {client.state}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button size="sm"><Phone className="h-4 w-4" /> Call</Button>
            <Button size="sm" variant="outline"><MessageSquare className="h-4 w-4" /> Text</Button>
            <Button size="sm" variant="outline"><Mail className="h-4 w-4" /> Email</Button>
          </div>
        </SheetHeader>

        <Tabs defaultValue="notes" className="p-6">
          <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.v} value={t.v} className="gap-1.5">
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="needs" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Annual income" placeholder="$75,000" />
              <Field label="Dependents" placeholder="2" />
              <Field label="Existing coverage" placeholder="$100,000" />
              <Field label="Recommended face amount" placeholder="$500,000" />
              <Field label="Tobacco use" placeholder="No" />
              <Field label="Health class" placeholder="Standard" />
            </div>
            <Button>Save Needs Analysis</Button>
          </TabsContent>

          <TabsContent value="notes" className="mt-4 space-y-3">
            <Textarea placeholder="Add a note about this client..." className="min-h-24" />
            <Button><Plus className="h-4 w-4" /> Add Note</Button>
            <div className="space-y-2 pt-3">
              {[1,2,3].map((i) => (
                <Card key={i}><CardContent className="p-3 text-sm">
                  <div className="text-xs text-muted-foreground mb-1">Yesterday · You</div>
                  Spoke with client about whole life options. Sending quote tomorrow.
                </CardContent></Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="mt-4 space-y-3">
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">Presentation appointment</div>
                  <div className="text-sm text-muted-foreground">Friday, 3:00 PM</div>
                </div>
                <Button size="sm" variant="outline">Reschedule</Button>
              </div>
            </CardContent></Card>
            <Button variant="outline"><Plus className="h-4 w-4" /> Schedule new appointment</Button>
          </TabsContent>

          <TabsContent value="beneficiaries" className="mt-4 space-y-3">
            <Card><CardContent className="p-3 text-sm">
              <div className="font-medium">Jane Smith — Spouse</div>
              <div className="text-muted-foreground">100% primary</div>
            </CardContent></Card>
            <Button variant="outline"><Plus className="h-4 w-4" /> Add beneficiary</Button>
          </TabsContent>

          <TabsContent value="referrals" className="mt-4">
            <div className="text-sm text-muted-foreground text-center py-8">No referrals yet.</div>
            <Button variant="outline" className="w-full"><Plus className="h-4 w-4" /> Request referrals</Button>
          </TabsContent>

          <TabsContent value="financials" className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Monthly budget" placeholder="$150" />
            <Field label="Bank account" placeholder="Checking ****1234" />
            <Field label="Draft date" placeholder="1st of month" />
            <Field label="Payment method" placeholder="ACH" />
          </TabsContent>

          <TabsContent value="care" className="mt-4 space-y-3">
            <div className="text-sm text-muted-foreground">Schedule follow-ups, send birthday/anniversary cards, retention touchpoints.</div>
            <Button variant="outline"><Plus className="h-4 w-4" /> Add care touchpoint</Button>
          </TabsContent>

          <TabsContent value="policies" className="mt-4 space-y-2">
            {policies.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">No policies on file.</div>}
            {policies.map((p) => (
              <Card key={p.id}><CardContent className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{p.carrier} · {p.product}</div>
                  <div className="text-xs text-muted-foreground">{p.policy_number} · {fmtCurrency(p.annual_premium)}/yr</div>
                </div>
                <StatusBadge status={p.status} />
              </CardContent></Card>
            ))}
          </TabsContent>

          <TabsContent value="email" className="mt-4 space-y-3">
            <Input placeholder="Subject" />
            <Textarea placeholder="Write your email..." className="min-h-32" />
            <Button>Send Email</Button>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input placeholder={placeholder} />
    </div>
  );
}
