import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, Mic, FileText, TrendingUp, Target, Lightbulb, PhoneCall, MessageSquare, Cake, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ai-assistant")({
  component: AIAssistantPage,
});

const SUGGESTIONS = [
  "Draft a follow-up email for a hot IUL lead",
  "Summarize my last 5 calls",
  "Write an objection rebuttal for 'too expensive'",
  "Generate a 30-day prospecting plan",
];

const PROMPTS = [
  { icon: FileText, label: "Call summary", desc: "Auto-summarize any recorded call" },
  { icon: Target, label: "Objection coach", desc: "Get a rebuttal in 5 seconds" },
  { icon: TrendingUp, label: "Pipeline triage", desc: "Tell me which deals to chase today" },
  { icon: Lightbulb, label: "Script builder", desc: "Custom scripts by demographic" },
];

const TOGGLES = [
  { key: "recovery", label: "Policy Recovery", desc: "Automatically call lapsed and lapse-pending policyholders to recover them.", enabled: true, last: "12 calls in last 24h" },
  { key: "sms", label: "SMS Follow-up", desc: "Send AI-personalized SMS follow-ups after every appointment and call.", enabled: true, last: "47 messages sent yesterday" },
  { key: "birthday", label: "Birthday Messages", desc: "Send a branded birthday text to every client on their special day.", enabled: false, last: "Off since Apr 2026" },
  { key: "beneficiary", label: "Beneficiary Engagement", desc: "Quarterly check-ins with named beneficiaries to keep policies in force.", enabled: true, last: "Last run 3 days ago" },
];

type ActivityType = "recovery" | "sms" | "birthday" | "beneficiary";
const ACTIVITY_ITEMS: { id: number; type: ActivityType; client: string; outcome: string; outcomeKind: "ok" | "neutral" | "bad"; time: string }[] = [
  { id: 1, type: "recovery", client: "Aisha Patel", outcome: "Reinstated · $124/mo", outcomeKind: "ok", time: "12 min ago" },
  { id: 2, type: "sms", client: "James O'Connor", outcome: "Replied, scheduled callback", outcomeKind: "ok", time: "32 min ago" },
  { id: 3, type: "birthday", client: "Maria Gonzalez", outcome: "Sent", outcomeKind: "neutral", time: "1h ago" },
  { id: 4, type: "recovery", client: "Lee Chen", outcome: "No answer", outcomeKind: "bad", time: "2h ago" },
  { id: 5, type: "beneficiary", client: "Theresa Williams (bene)", outcome: "Confirmed contact info", outcomeKind: "ok", time: "4h ago" },
  { id: 6, type: "sms", client: "Daniel Kim", outcome: "Opted out", outcomeKind: "bad", time: "Yesterday" },
];
const ACTIVITY_ICONS: Record<ActivityType, React.ComponentType<{ className?: string }>> = { recovery: PhoneCall, sms: MessageSquare, birthday: Cake, beneficiary: Users };
const ACTIVITY_LABEL: Record<ActivityType, string> = { recovery: "Policy Recovery", sms: "SMS Follow-up", birthday: "Birthday", beneficiary: "Beneficiary" };

function AIAssistantPage() {
  const [messages, setMessages] = useState<Array<{ role: "user" | "ai"; text: string }>>([
    { role: "ai", text: "Hey, I'm your AI Assistant. I can draft, summarize, score leads, and coach you live on calls. What do you need?" },
  ]);
  const [input, setInput] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityType | "all">("all");

  const send = (text: string) => {
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: "user", text }, { role: "ai", text: "Got it — here's a draft based on your book and recent activity. (demo response)" }]);
    setInput("");
  };

  const filteredActivity = activityFilter === "all" ? ACTIVITY_ITEMS : ACTIVITY_ITEMS.filter((i) => i.type === activityFilter);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Assistant</h1>
        <p className="text-muted-foreground mt-1">Your sales co-pilot. Automate follow-ups, coach objections, and recover policies.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 flex flex-col h-[600px]">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">Chat</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto py-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.text}
                </div>
              </div>
            ))}
          </CardContent>
          <div className="border-t p-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="text-xs px-3 py-1 rounded-full border hover:bg-muted">{s}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon"><Mic className="h-4 w-4" /></Button>
              <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder="Ask your AI Assistant anything..." />
              <Button size="icon" onClick={() => send(input)}><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Quick prompts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {PROMPTS.map((p) => (
                <button key={p.label} className="w-full text-left p-3 rounded-lg border hover:bg-muted transition-colors flex items-start gap-3">
                  <p.icon className="h-4 w-4 mt-0.5 text-primary" />
                  <div>
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground">{p.desc}</div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">This week's wins</CardTitle>
              <CardDescription>AI-attributed outcomes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between"><span>Calls summarized</span><Badge>47</Badge></div>
              <div className="flex items-center justify-between"><span>Emails drafted</span><Badge>23</Badge></div>
              <div className="flex items-center justify-between"><span>Objections coached</span><Badge>12</Badge></div>
              <div className="flex items-center justify-between"><span>Hours saved</span><Badge variant="secondary">~9.5</Badge></div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="memory">
        <TabsList>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="voice">Voice</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="automations">Automations</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="memory" className="mt-4">
          <Card><CardContent className="pt-6 text-sm text-muted-foreground">The AI remembers your top objections, preferred carriers, and how you write. Manage what's stored here.</CardContent></Card>
        </TabsContent>
        <TabsContent value="voice" className="mt-4">
          <Card><CardContent className="pt-6 text-sm text-muted-foreground">Enable live call coaching. The AI whispers suggestions during calls without the client hearing.</CardContent></Card>
        </TabsContent>
        <TabsContent value="integrations" className="mt-4">
          <Card><CardContent className="pt-6 text-sm text-muted-foreground">Connect to your dialer, calendar, and email so the AI has full context.</CardContent></Card>
        </TabsContent>
        <TabsContent value="automations" className="mt-4">
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
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant={activityFilter === "all" ? "default" : "outline"} onClick={() => setActivityFilter("all")}>All</Button>
              {(Object.keys(ACTIVITY_LABEL) as ActivityType[]).map((k) => (
                <Button key={k} size="sm" variant={activityFilter === k ? "default" : "outline"} onClick={() => setActivityFilter(k)}>{ACTIVITY_LABEL[k]}</Button>
              ))}
            </div>
            <Card>
              <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
              <CardContent className="divide-y p-0">
                {filteredActivity.map((i) => {
                  const Icon = ACTIVITY_ICONS[i.type];
                  const tone = i.outcomeKind === "ok" ? "bg-success/15 text-success" : i.outcomeKind === "bad" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground";
                  return (
                    <div key={i.id} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 grid place-items-center text-primary"><Icon className="h-4 w-4" /></div>
                        <div>
                          <div className="font-medium">{i.client}</div>
                          <div className="text-xs text-muted-foreground">{ACTIVITY_LABEL[i.type]}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className={tone}>{i.outcome}</Badge>
                        <span className="text-xs text-muted-foreground w-20 text-right">{i.time}</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
