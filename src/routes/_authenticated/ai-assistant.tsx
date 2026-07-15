import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Send, Mic, FileText, TrendingUp, Target, Lightbulb, Loader2, Sparkles,
  Settings, ChevronDown,
} from "lucide-react";
import { askAiAssistant } from "@/lib/ai-assistant.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ai-assistant")({
  component: NovaAIPage,
});

const QUICK_CHIPS: { icon: React.ComponentType<{ className?: string }>; label: string; prompt: string }[] = [
  { icon: FileText, label: "Call summary", prompt: "Summarize a recent call or notes" },
  { icon: Target, label: "Objection coach", prompt: "Give me a rebuttal for 'too expensive' in 5 seconds" },
  { icon: TrendingUp, label: "Pipeline triage", prompt: "Which deals should I chase today?" },
  { icon: Lightbulb, label: "Script builder", prompt: "Build a custom final expense script for 65+ homeowners" },
  { icon: FileText, label: "Follow-up email", prompt: "Draft a follow-up email for a hot IUL lead" },
  { icon: Target, label: "30-day plan", prompt: "Generate a 30-day prospecting plan" },
];

type Message = { role: "user" | "assistant"; text: string };

function NovaAIPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Hi, I'm Nova — your AI co-pilot. I draft, summarize, coach objections, and build scripts. What do you need?" },
  ]);
  const [input, setInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
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
      setMessages((m) => [...m, { role: "user", text }, { role: "assistant", text: res.reply }]);
    },
    onError: (e: Error, text) => {
      setMessages((m) => [
        ...m,
        { role: "user", text },
        { role: "assistant", text: `Sorry, I hit an error: ${e.message}` },
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
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto w-full">
      {/* Hero */}
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-xl" />
          <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 grid place-items-center shadow-lg">
            <Sparkles className="h-7 w-7 text-primary-foreground" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1
              className="text-3xl md:text-4xl font-bold tracking-tight leading-none"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Nova AI
            </h1>
            <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
              Beta
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Your sales co-pilot for objections, scripts, and pipeline strategy.
          </p>
        </div>
      </div>

      {/* Chat surface */}
      <div className="rounded-2xl border border-border bg-gradient-to-b from-surface-2/40 to-transparent overflow-hidden shadow-sm flex flex-col min-h-[70vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/70 bg-surface-2/30">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/60" />
            <span className="text-sm font-medium">Nova</span>
            <span className="text-xs text-muted-foreground">online</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="text-xs">Settings</span>
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.role === "assistant" && (
                <div className="h-7 w-7 shrink-0 rounded-lg bg-primary/15 border border-primary/30 grid place-items-center">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-surface-2 border border-border-soft text-foreground rounded-tl-sm",
                )}
              >
                {m.role === "assistant" && (
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-primary/80 mb-1">Nova</div>
                )}
                {m.text}
              </div>
            </div>
          ))}
          {sendMutation.isPending && (
            <div className="flex gap-3 justify-start">
              <div className="h-7 w-7 shrink-0 rounded-lg bg-primary/15 border border-primary/30 grid place-items-center">
                <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
              </div>
              <div className="bg-surface-2 border border-border-soft rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-border/70 bg-surface-2/20 p-3 md:p-4 space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
            {QUICK_CHIPS.map((c) => (
              <button
                key={c.label}
                onClick={() => send(c.prompt)}
                disabled={sendMutation.isPending}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-primary/25 bg-surface-1/60 hover:border-primary/60 hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                <c.icon className="h-3 w-3 text-primary" />
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-background px-2 py-1 shadow-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full text-muted-foreground" disabled>
              <Mic className="h-4 w-4" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(input)}
              placeholder="Ask Nova anything…"
              disabled={sendMutation.isPending}
              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none h-9 px-1"
            />
            <Button
              size="icon"
              onClick={() => send(input)}
              disabled={sendMutation.isPending || !input.trim()}
              className="h-9 w-9 shrink-0 rounded-full"
            >
              {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Collapsible settings */}
      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Nova settings
            </span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", settingsOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <Tabs defaultValue="memory">
            <TabsList>
              <TabsTrigger value="memory">Memory</TabsTrigger>
              <TabsTrigger value="voice">Voice</TabsTrigger>
              <TabsTrigger value="integrations">Integrations</TabsTrigger>
              <TabsTrigger value="automations">Automations</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="memory" className="mt-4">
              <div className="rounded-xl border border-border bg-surface-1 p-4 text-sm text-muted-foreground">
                Nova remembers your top objections, preferred carriers, and how you write. Manage what's stored here.
              </div>
            </TabsContent>
            <TabsContent value="voice" className="mt-4">
              <div className="rounded-xl border border-border bg-surface-1 p-4 text-sm text-muted-foreground">
                Enable live call coaching. Nova whispers suggestions during calls without the client hearing.
              </div>
            </TabsContent>
            <TabsContent value="integrations" className="mt-4">
              <div className="rounded-xl border border-border bg-surface-1 p-4 text-sm text-muted-foreground">
                Connect Nova to your dialer, calendar, and email so it has full context.
              </div>
            </TabsContent>
            <TabsContent value="automations" className="mt-4">
              <div className="rounded-xl border border-border bg-surface-1 p-4 text-sm text-muted-foreground">
                Automations — policy recovery calls, birthday messages, SMS follow-ups — are available for eligible agency plans. Contact your admin to enable.
              </div>
            </TabsContent>
            <TabsContent value="activity" className="mt-4">
              <div className="rounded-xl border border-border bg-surface-1 p-4">
                <p className="text-xs text-muted-foreground mb-3">Nova-attributed actions will appear here once automations are enabled.</p>
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No activity yet. Activity logging starts when automations are active.
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
