import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Send, Mic, FileText, TrendingUp, Target, Lightbulb, Loader2, Sparkles,
  Settings, Zap, Activity, Plus,
} from "lucide-react";
import { askAiAssistant, listNovaConversations, getNovaConversation } from "@/lib/ai-assistant.functions";
import { cn } from "@/lib/utils";
import { NovaAutomationsPanel } from "@/components/nova/automations-panel";
import { NovaActivityPanel } from "@/components/nova/activity-panel";
import { useNavContext } from "@/hooks/use-my-access";
import type { Audience } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/ai-assistant")({
  component: NovaAIPage,
});

type Chip = { icon: React.ComponentType<{ className?: string }>; label: string; prompt: string };

/**
 * What Nova offers to do, by who is asking.
 *
 * Two independent questions, and the answer needs both. *What is this person's
 * job* — a contracting coordinator was offered an objection coach, a
 * prospecting plan and a final expense script, none of which are their work.
 * And *do they have a book yet* — an agent on their first day was told "I can
 * see your pipeline, your book and what's at risk" about records that do not
 * exist, which is the same failure as a dashboard of zeros.
 *
 * So: staff get the queue prompts, an agent with no book gets the starter
 * prompts, and everybody else gets the original six. Staff are checked first —
 * a coordinator is not "getting started as an agent", they have no book and
 * never will, so the starter set is as wrong for them as the pipeline set.
 *
 * The server decides what Nova can actually see; this decides what she offers
 * first. Both read the same role, so they cannot disagree about who is here.
 */
const QUICK_CHIPS: Record<Audience, Chip[]> = {
  core: [
    { icon: FileText, label: "Call summary", prompt: "Summarize a recent call or notes" },
    { icon: Target, label: "Objection coach", prompt: "Give me a rebuttal for 'too expensive' in 5 seconds" },
    { icon: TrendingUp, label: "Pipeline triage", prompt: "Which deals should I chase today?" },
    { icon: Lightbulb, label: "Script builder", prompt: "Build a custom final expense script for 65+ homeowners" },
    { icon: FileText, label: "Follow-up email", prompt: "Draft a follow-up email for a hot IUL lead" },
    { icon: Target, label: "30-day plan", prompt: "Generate a 30-day prospecting plan" },
  ],
  staff: [
    { icon: Target, label: "What's overdue", prompt: "What contracting requests are overdue, and what is each one waiting on?" },
    { icon: TrendingUp, label: "Work next", prompt: "What should I work next in the contracting queue?" },
    { icon: FileText, label: "Licences expiring", prompt: "Which licences expire in the next 45 days, and for which agents?" },
    { icon: Lightbulb, label: "Not ready to sell", prompt: "Which agents are not ready to sell, and what is missing for each?" },
    { icon: FileText, label: "Chase a carrier", prompt: "Draft an email chasing a carrier on an outstanding contracting request." },
    { icon: Target, label: "PDB reports", prompt: "Which agents are missing a PDB report or have one that is out of date?" },
  ],
};

const GREETINGS: Record<Audience, string> = {
  core: "Hi, I'm Nova. I can see your pipeline, your book and what's at risk — ask me how you're doing, what to work next, or for help with a call.",
  staff: "Hi, I'm Nova. I can see your contracting queue, licence expirations and PDB status — ask me what's overdue, what to work next, or for help drafting a note to a carrier.",
};

const STARTER_CHIPS: Chip[] = [
  { icon: Target, label: "30-day plan", prompt: "Generate a 30-day plan for my first month as a life insurance agent" },
  { icon: Lightbulb, label: "First script", prompt: "Build me a simple final expense phone script I can use on my first calls" },
  { icon: Target, label: "Objection coach", prompt: "Give me a rebuttal for 'too expensive' in 5 seconds" },
  { icon: TrendingUp, label: "Where to start", prompt: "I have no clients yet. Where do I find my first ten prospects?" },
  { icon: FileText, label: "What is an FE sale", prompt: "Walk me through what a final expense sale looks like start to finish" },
];

type Message = { role: "user" | "assistant"; text: string };

const STARTER_GREETING_TEXT =
  "Hi, I'm Nova. You're just getting started, so there's no book for me to read yet — but I can help you build a script, plan your first month, or work through an objection before you hit the phones.";

function NovaAIPage() {
  // `isPending` already means "has not posted a policy yet" — it is what gates
  // Clients, Book and Finances in the nav. No new query for this.
  const { audience, isPending: noBookYet } = useNavContext();
  // Staff are never "starting out": they have no book because they do not sell,
  // not because they have not sold yet.
  const starter = audience === "core" && noBookYet;

  const chips = audience === "staff"
    ? QUICK_CHIPS.staff
    : starter ? STARTER_CHIPS : QUICK_CHIPS.core;

  const greeting: Message = {
    role: "assistant",
    text: audience === "staff"
      ? GREETINGS.staff
      : starter ? STARTER_GREETING_TEXT : GREETINGS.core,
  };

  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [input, setInput] = useState("");
  const [tab, setTab] = useState("assistant");
  // Null means this is a new thread; the server mints the id on first reply.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const askFn = useServerFn(askAiAssistant);
  const listFn = useServerFn(listNovaConversations);
  const openFn = useServerFn(getNovaConversation);
  const qc = useQueryClient();

  const { data: conversations } = useQuery({
    queryKey: ["nova", "conversations"],
    queryFn: () => listFn(),
  });

  // useNavContext resolves after first paint, so the initial state above can be
  // the wrong greeting for a moment. Swap it only while the thread is still
  // just the greeting — never once somebody has started talking.
  useEffect(() => {
    setMessages((m) =>
      m.length === 1 && m[0].role === "assistant" && m[0].text !== greeting.text
        ? [greeting]
        : m,
    );
  }, [greeting]);

  const openConversation = async (id: string) => {
    const history = await openFn({ data: { conversationId: id } });
    setConversationId(id);
    setMessages([
      greeting,
      ...history.map((m) => ({ role: m.role, text: m.content })),
    ]);
  };

  const newConversation = () => {
    setConversationId(null);
    setMessages([greeting]);
  };

  const sendMutation = useMutation({
    // History lives on the server now, so only the new message travels. The
    // client used to replay the entire transcript on every turn, which meant
    // the conversation was only as long as the page had been open.
    mutationFn: (text: string) =>
      askFn({ data: { message: text, conversationId: conversationId ?? undefined } }),
    onSuccess: (res, text) => {
      setConversationId(res.conversationId);
      setMessages((m) => [...m, { role: "user", text }, { role: "assistant", text: res.reply }]);
      qc.invalidateQueries({ queryKey: ["nova", "conversations"] });
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
            {audience === "staff"
              ? "Your back-office co-pilot for the contracting queue, licensing and carrier chasing."
              : "Your sales co-pilot for objections, scripts, and pipeline strategy."}
          </p>
        </div>
      </div>

      {/* Hub tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="assistant"><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Assistant</TabsTrigger>
          <TabsTrigger value="automations"><Zap className="h-3.5 w-3.5 mr-1.5" /> Automations</TabsTrigger>
          <TabsTrigger value="activity"><Activity className="h-3.5 w-3.5 mr-1.5" /> Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="assistant" className="mt-4">
      {/* Chat surface */}
      <div className="rounded-2xl border border-border bg-gradient-to-b from-surface-2/40 to-transparent overflow-hidden shadow-sm flex flex-col min-h-[70vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/70 bg-surface-2/30">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-success shadow-[0_0_8px] shadow-success/60" />
            <span className="text-sm font-medium">Nova</span>
            <span className="text-xs text-muted-foreground">online</span>
          </div>
          <div className="flex items-center gap-1">
            {(conversations?.length ?? 0) > 0 && (
              <Select value={conversationId ?? "new"} onValueChange={(v) => (v === "new" ? newConversation() : openConversation(v))}>
                <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue placeholder="Past conversations" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New conversation</SelectItem>
                  {conversations!.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={newConversation}
              title="Start a new conversation"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="text-xs">New</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setTab("automations")}
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="text-xs">Automations</span>
            </Button>
          </div>
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
            {chips.map((c) => (
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
        </TabsContent>

        <TabsContent value="automations" className="mt-4">
          <NovaAutomationsPanel />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <NovaActivityPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
