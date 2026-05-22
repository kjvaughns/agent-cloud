import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Send, Mic, FileText, TrendingUp, Target, Lightbulb } from "lucide-react";

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

function AIAssistantPage() {
  const [messages, setMessages] = useState<Array<{ role: "user" | "ai"; text: string }>>([
    { role: "ai", text: "Hey, I'm Sophai. I can draft, summarize, score leads, and coach you live on calls. What do you need?" },
  ]);
  const [input, setInput] = useState("");

  const send = (text: string) => {
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: "user", text }, { role: "ai", text: "Got it — here's a draft based on your book and recent activity. (demo response)" }]);
    setInput("");
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Sparkles className="h-7 w-7 text-primary" /> Sophai AI</h1>
        <p className="text-muted-foreground mt-1">Your sales co-pilot. Trained on your book, your calls, and the agency's playbook.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 flex flex-col h-[600px]">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" /> Chat</CardTitle>
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
              <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder="Ask Sophai anything..." />
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
              <CardDescription>Sophai-attributed outcomes</CardDescription>
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
        </TabsList>
        <TabsContent value="memory" className="mt-4">
          <Card><CardContent className="pt-6 text-sm text-muted-foreground">Sophai remembers your top objections, preferred carriers, and how you write. Manage what's stored here.</CardContent></Card>
        </TabsContent>
        <TabsContent value="voice" className="mt-4">
          <Card><CardContent className="pt-6 text-sm text-muted-foreground">Enable live call coaching. Sophai whispers suggestions during calls without the client hearing.</CardContent></Card>
        </TabsContent>
        <TabsContent value="integrations" className="mt-4">
          <Card><CardContent className="pt-6 text-sm text-muted-foreground">Connect to your dialer, calendar, and email so Sophai has full context.</CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
