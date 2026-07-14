import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, Mic, FileText, TrendingUp, Target, Lightbulb, Loader2, Bot } from "lucide-react";
import { askAiAssistant } from "@/lib/ai-assistant.functions";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";

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
    <PageShell>
      <div className="flex flex-col gap-[var(--gap)]">
        <HeroBand title="AI Assistant" subtitle="Your sales co-pilot — coach objections, draft scripts, and build your pipeline strategy." />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--gap)]">
          <Panel pad={false} className="lg:col-span-2 h-[600px]">
            <div className="flex items-center gap-2 px-[var(--pad)] py-3 border-b border-border">
              <Bot className="h-4 w-4 text-primary" />
              <span className="font-display font-semibold text-sm" style={{ fontFamily: "var(--font-display)" }}>Chat</span>
            </div>
            <div className="flex-1 overflow-y-auto p-[var(--pad)] space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-surface-2 border border-border-soft"}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {sendMutation.isPending && (
                <div className="flex justify-start">
                  <div className="bg-surface-2 border border-border-soft rounded-2xl px-4 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="border-t border-border p-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={sendMutation.isPending}
                    className="text-xs px-3 py-1 rounded-full border border-border bg-surface-2 hover:border-primary/40 hover:text-gold-bright transition-colors disabled:opacity-50"
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
          </Panel>

          <Panel title="Quick Prompts">
            <div className="space-y-2">
              {PROMPTS.map((p) => (
                <button
                  key={p.label}
                  disabled={sendMutation.isPending}
                  className="w-full text-left p-3 rounded-lg border border-border bg-surface-2 hover:border-primary/40 transition-colors flex items-start gap-3 disabled:opacity-50"
                  onClick={() => send(p.desc)}
                >
                  <p.icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <div>
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground">{p.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </Panel>
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
            <Panel><div className="text-sm text-muted-foreground">The AI remembers your top objections, preferred carriers, and how you write. Manage what's stored here.</div></Panel>
          </TabsContent>
          <TabsContent value="voice" className="mt-4">
            <Panel><div className="text-sm text-muted-foreground">Enable live call coaching. The AI whispers suggestions during calls without the client hearing.</div></Panel>
          </TabsContent>
          <TabsContent value="integrations" className="mt-4">
            <Panel><div className="text-sm text-muted-foreground">Connect to your dialer, calendar, and email so the AI has full context.</div></Panel>
          </TabsContent>
          <TabsContent value="automations" className="mt-4">
            <Panel>
              <p className="text-sm text-muted-foreground">
                Automation features including policy recovery calls, birthday messages, and SMS follow-ups
                are available for eligible agency plans. Contact your admin to enable.
              </p>
            </Panel>
          </TabsContent>
          <TabsContent value="activity" className="mt-4">
            <Panel title="Activity Log">
              <p className="text-xs text-muted-foreground mb-3">AI-attributed actions will appear here once automations are enabled.</p>
              <div className="py-8 text-center text-sm text-muted-foreground">
                No activity yet. Activity logging starts when automations are active.
              </div>
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}
