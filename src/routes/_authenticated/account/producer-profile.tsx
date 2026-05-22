import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { ExternalLink, Eye, Upload, IdCard } from "lucide-react";

export const Route = createFileRoute("/_authenticated/account/producer-profile")({
  head: () => ({
    meta: [
      { title: "Producer Profile — Agent Cloud" },
      { name: "description", content: "Manage your producer profile, documents, and integrations." },
    ],
  }),
  component: ProducerProfilePage,
});

function Field({ label, value, type = "text" }: { label: string; value?: string; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type={type} defaultValue={value} />
    </div>
  );
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <AccordionItem value={title}>
      <AccordionTrigger className="font-semibold">{title}</AccordionTrigger>
      <AccordionContent className="space-y-4 pt-2">{children}</AccordionContent>
    </AccordionItem>
  );
}

function ProducerProfilePage() {
  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><IdCard className="h-7 w-7" /> Producer Profile</h1>
        <p className="text-muted-foreground mt-1">Your producer record, compliance documents, and account integrations.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile Information</TabsTrigger>
          <TabsTrigger value="background">Background Questions</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <Field label="First Name" value="Jordan" />
              <Field label="Last Name" value="Reyes" />
              <div className="space-y-1.5">
                <Label className="text-xs">NPN Number</Label>
                <div className="flex gap-2">
                  <Input defaultValue="20489173" />
                  <Button variant="outline" size="sm">NPN Lookup</Button>
                </div>
              </div>
              <Field label="Date of Birth" value="1985-04-12" type="date" />
              <Field label="Gender" value="" />
              <div className="space-y-1.5">
                <Label className="text-xs">Social Security Number</Label>
                <div className="flex gap-2">
                  <Input defaultValue="***-**-4821" />
                  <Button variant="outline" size="icon"><Eye className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Address</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <Field label="Street Address" value="1450 Pine St" />
              <Field label="City" value="Austin" />
              <Field label="State" value="TX" />
              <Field label="ZIP Code" value="78704" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <Field label="Contact Email" value="jordan@reyesagency.com" />
              <Field label="Phone" value="(512) 555-0188" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                <DocSection title="E&O Insurance">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Starting Date" type="date" />
                    <Field label="Expiration Date" type="date" />
                    <Field label="Policy Number" />
                    <Field label="Certificate Number" />
                    <Field label="Case Limit" value="$1,000,000" />
                    <Field label="Total Limit" value="$3,000,000" />
                    <Field label="Carrier Name" />
                  </div>
                  <Button variant="outline" size="sm"><Upload className="h-3 w-3 mr-1" /> Upload Certificate (PDF)</Button>
                </DocSection>
                <DocSection title="Banking Information">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Bank Name" />
                    <Field label="Account Type" />
                    <Field label="Account Number" value="****8821" />
                    <Field label="Routing Number" />
                  </div>
                  <Button variant="outline" size="sm"><Upload className="h-3 w-3 mr-1" /> Upload Voided Check</Button>
                </DocSection>
                <DocSection title="Driver's License">
                  <div className="grid sm:grid-cols-3 gap-4">
                    <Field label="License Number" />
                    <Field label="State" />
                    <Field label="Expiration Date" type="date" />
                  </div>
                  <Button variant="outline" size="sm"><Upload className="h-3 w-3 mr-1" /> Upload License</Button>
                </DocSection>
                <DocSection title="AML Certificate">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Annual anti-money-laundering training, required by most carriers.</p>
                    <Button variant="link" size="sm">Complete for free <ExternalLink className="h-3 w-3 ml-1" /></Button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Start Date" type="date" />
                    <Field label="Expiration Date" type="date" />
                  </div>
                  <Button variant="outline" size="sm"><Upload className="h-3 w-3 mr-1" /> Upload Certificate</Button>
                </DocSection>
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>User Account</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <strong>Login Email vs Contact Email:</strong> Your login email is the credential you sign in with. Changing your contact email above does NOT change your login email.
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Login Email</Label>
                  <Input value="jordan@reyesagency.com" readOnly className="bg-muted" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Password</Label>
                  <Button variant="outline" className="w-full justify-start">Change Password</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Signed Producer Agreement</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Signature</span><span className="font-medium">Jordan Reyes</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Signed Date</span><span>Mar 4, 2026</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span>1.0</span></div>
              <Button variant="outline" size="sm" className="mt-3">Download Signed Agreement PDF</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="background" className="mt-4">
          <Card><CardContent className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">Standard insurance producer background disclosure questions. Carriers will request these during contracting.</p>
            {[
              "Have you ever been convicted of any crime other than a minor traffic violation?",
              "Have you ever had an insurance license suspended, revoked, or refused?",
              "Have you ever filed for bankruptcy in the last 10 years?",
              "Are you currently the subject of any pending investigation by an insurance department?",
              "Have you ever been terminated for cause by any insurance company or broker-dealer?",
            ].map((q, i) => (
              <label key={i} className="flex items-start gap-3 p-3 border rounded-lg">
                <Checkbox className="mt-1" />
                <span className="text-sm">{q}</span>
              </label>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <Card><CardContent className="p-6 grid sm:grid-cols-2 gap-3">
            {["Google Calendar", "Outlook Calendar", "Zapier", "HubSpot CRM", "Salesforce", "Mailchimp"].map((s) => (
              <div key={s} className="flex items-center justify-between p-3 border rounded-lg">
                <span className="font-medium text-sm">{s}</span>
                <Button size="sm" variant="outline">Connect</Button>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
