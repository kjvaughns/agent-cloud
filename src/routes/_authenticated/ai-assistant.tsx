import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, Mic, FileText, TrendingUp, Target, Lightbulb, Loader2, Bot } from "lucide-react";
import { askAiAssistant } from "@/lib/ai-assistant.functions";

export const Route = createFileRoute("/_authenticated/ai-assistant")({
  component: AIAssistantPage,
});

const SUGGESTIONS = [
  "Draft a follow-up email for a hot IUL lead",
  "Write an objection rebuttal for 'too expensive'",
  "Generate a 30-day prospecting plan",
  "What are the best final expense carriers right now?",
];

const PROMPTS = [
  { icon: FileText, label: "Call summary", desc: "Summarize a recent call or notes" },
  { icon: Target, label: "Objection coach", desc: "Get a rebuttal in 5 seconds" },
  { icon: TrendingUp, label: "Pipeline triage", desc: "Which deals should I chase today?" },
  { icon: Lightbulb, label: "Script builder", desc: "Custom scripts by demographic" },
];

type Message = { role: "user" | "assistant"; text: string };

function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Hey, I'm your AI Assistant. I can draft, summarize, coach objections, and build scripts. What do you need?" },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const askFn = useServerFn(askAiAssistant);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const history = messages
        .filter((m) => m.role !== "assistant" || messages.indexOf(m) > 0)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.text }));
      return askFn({ data: { messages: [...history, { role: "user", content: text }] } });
    },
    onSuccess: (res, text) => {
      setMessages((m) => [
        ...m,
        { role: "user", text },
        { role: "assistant", text: res.reply },
      ]);
    },
    onError: (e: Error, text) => {
      setMessages((m) => [
        ...m,
        { role: "user", text },
        { role: "assistant", text: `Sorry, I encountered an error: ${e.message}` },
      ]);
    },
  });

  const send = (text: string) => {
    if (!text.trim() || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate(text);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendMutation.isPending]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Assistant</h1>
        <p className="text-muted-foreground mt-1">Your sales co-pilot. Coach objections, draft scripts, and build your pipeline strategy.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 flex flex-col h-[600px]">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-primary" /> Chat
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto py-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {sendMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </CardContent>
          <div className="border-t p-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={sendMutation.isPending}
                  className="text-xs px-3 py-1 rounded-full border hover:bg-muted disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" disabled><Mic className="h-4 w-4" /></Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(input)}
                placeholder="Ask your AI Assistant anything..."
                disabled={sendMutation.isPending}
              />
              <Button size="icon" onClick={() => send(input)} disabled={sendMutation.isPending || !input.trim()}>
                {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Quick prompts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {PROMPTS.map((p) => (
                <button
                  key={p.label}
                  disabled={sendMutation.isPending}
                  className="w-full text-left p-3 rounded-lg border hover:bg-muted transition-colors flex items-start gap-3 disabled:opacity-50"
                  onClick={() => send(p.desc)}
                >
                  <p.icon className="h-4 w-4 mt-0.5 text-primary" />
                  <div>
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground">{p.desc}</div>
                  </div>
                </button>
              ))}
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
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Automation features including policy recovery calls, birthday messages, and SMS follow-ups
                are available for eligible agency plans. Contact your admin to enable.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>AI-attributed actions will appear here once automations are enabled.</CardDescription>
            </CardHeader>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No activity yet. Activity logging starts when automations are active.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
