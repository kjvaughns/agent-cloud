import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/resources/new-agent-guide")({
  head: () => ({
    meta: [
      { title: "New Agent Guide — Agent Cloud" },
      { name: "description", content: "Step-by-step onboarding checklist for brand-new life insurance agents." },
    ],
  }),
  component: NewAgentGuidePage,
});

const CHECKLIST = [
  { done: true, title: "Get your life-only license", note: "Pre-licensing course, state exam, fingerprints." },
  { done: true, title: "Sign your independent agent agreement", note: "E-signed, returned to upline." },
  { done: true, title: "Request your first 3 carrier contracts", note: "Mutual of Omaha, Americo, Foresters." },
  { done: false, title: "Build your dial list", note: "Upload 100 contacts or import from your CRM." },
  { done: false, title: "Run your first 3-way call", note: "Shadow with your upline before going solo." },
  { done: false, title: "Post your first deal", note: "Submit through Post a Deal — track in Book of Business." },
];

const ARTICLES = [
  { title: "Day 1 — Set up your Agent Cloud workspace", read: "4 min" },
  { title: "Understanding commission levels and chargebacks", read: "7 min" },
  { title: "Choosing your first 3 carriers", read: "5 min" },
  { title: "Your first 100 contacts — where to start", read: "6 min" },
];

function NewAgentGuidePage() {
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Onboarding checklist</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {CHECKLIST.map((c, i) => (
            <label key={i} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/40 cursor-pointer">
              <Checkbox checked={c.done} className="mt-0.5" />
              <div className="flex-1">
                <div className={c.done ? "line-through text-muted-foreground" : "font-medium"}>{c.title}</div>
                <div className="text-sm text-muted-foreground">{c.note}</div>
              </div>
              {c.done && <Badge variant="secondary" className="bg-success/15 text-success">Done</Badge>}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Starter articles</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {ARTICLES.map((a, i) => (
            <a key={i} href="#" className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/40 border">
              <div>
                <div className="font-medium text-sm">{a.title}</div>
                <div className="text-xs text-muted-foreground">{a.read} read</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
