import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Copy, Eye, Globe, Sparkles, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/account/my-landing-page")({
  head: () => ({
    meta: [
      { title: "My Landing Page — Agent Cloud" },
      { name: "description", content: "Customize your public-facing agent profile." },
    ],
  }),
  component: MyLandingPage,
});

const SPECIALTIES = ["Final Expense", "Mortgage Protection", "Income Replacement", "Living Benefits", "Health Insurance", "Retirement Planning"];
const CARRIERS = ["Prudential", "Combined", "Foresters", "Transamerica", "Aflac", "Mutual of Omaha", "American Amicable", "Baltimore Life", "National Life Group", "Royal Neighbors", "Athene Annuity"];
const SELECTED_STATES = ["TX", "FL", "GA", "NC", "OH"];

function MyLandingPage() {
  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Globe className="h-7 w-7" /> My Landing Page</h1>
          <p className="text-muted-foreground mt-1">Customize your public-facing agent profile.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Copy className="h-3 w-3 mr-1" /> Copy URL</Button>
          <Button variant="outline" size="sm"><Eye className="h-3 w-3 mr-1" /> Preview</Button>
          <Button size="sm">Save</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">Landing Page Published</div>
            <div className="text-sm text-muted-foreground mt-0.5">https://agentcloud.com/myagent/jordan-reyes</div>
          </div>
          <Switch defaultChecked />
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Contact Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Email Address</Label>
              <Input placeholder="Leave blank to use account email" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone Number</Label>
              <Input defaultValue="(512) 555-0188" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Profile Photo</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-4">
            <Avatar className="h-20 w-20"><AvatarFallback className="text-xl bg-primary text-primary-foreground">JR</AvatarFallback></Avatar>
            <div className="flex-1">
              <Button variant="outline" size="sm">Change Photo</Button>
              <p className="text-xs text-muted-foreground mt-2">Square image, 400×400px min, max 5MB</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Custom Message</CardTitle>
            <Button variant="outline" size="sm"><Sparkles className="h-3 w-3 mr-1" /> Generate with AI</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea rows={4} maxLength={500} placeholder="Tell prospects who you are and how you help families protect what matters most." />
          <div className="text-xs text-muted-foreground mt-1 text-right">0 / 500</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>What I Help With</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {SPECIALTIES.map((s, i) => (
            <Badge key={s} variant={i < 3 ? "default" : "outline"} className="cursor-pointer text-sm py-1">{s}</Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Carriers I Represent</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {CARRIERS.map((c, i) => (
            <Badge key={c} variant={i < 5 ? "default" : "outline"} className="cursor-pointer text-sm py-1">{c}</Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>States Licensed In</CardTitle>
            <Button variant="link" size="sm">Select All</Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {SELECTED_STATES.map((s) => (
            <Badge key={s} className="text-sm py-1 gap-1">{s} <X className="h-3 w-3 cursor-pointer" /></Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
