import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LifeBuoy, Mail, MessageSquare, Phone, Search, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { submitTicket, listMyTickets, getTicketThread } from "@/lib/support.functions";
import { AiHelpSearch } from "@/components/ai/ai-help-search";

export const Route = createFileRoute("/_authenticated/account/help")({
  head: () => ({
    meta: [
      { title: "Help Center — Agent Cloud" },
      { name: "description", content: "Get help with Agent Cloud — articles, contact support, and live chat." },
    ],
  }),
  component: HelpPage,
});

const TOPICS = [
  { title: "Getting Started", desc: "Set up your account and complete onboarding", count: 8 },
  { title: "Pipeline & CRM", desc: "Managing leads, stages, and the client drawer", count: 12 },
  { title: "Posting Deals", desc: "Submit policies and track commissions", count: 6 },
  { title: "Contracting", desc: "Carrier requests, transfers, commission grids", count: 10 },
  { title: "Phone & SMS", desc: "Twilio setup, wallet, and dial lists", count: 7 },
  { title: "Sophai AI", desc: "Policy recovery, follow-ups, and birthday outreach", count: 5 },
];

const STATUS_COLORS: Record<string, string> = {
  open: "bg-[#C9A227]/10 text-[#C9A227]",
  in_progress: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  resolved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  closed: "bg-muted text-muted-foreground",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-[#C9A227]/10 text-[#C9A227]",
  high: "bg-amber-100 text-amber-700",
  urgent: "bg-red-100 text-red-700",
};

function HelpPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><LifeBuoy className="h-6 w-6" /> Help Center</h1>
        <p className="text-sm text-muted-foreground mt-1">Search the knowledge base, submit a support ticket, or view your ticket history.</p>
      </div>

      <Tabs defaultValue="kb">
        <TabsList>
          <TabsTrigger value="kb">Knowledge Base</TabsTrigger>
          <TabsTrigger value="ticket">Submit Ticket</TabsTrigger>
          <TabsTrigger value="my-tickets">My Tickets</TabsTrigger>
        </TabsList>

        <TabsContent value="kb" className="mt-4 space-y-4">
          <AiHelpSearch />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 h-11" placeholder="Search articles…" />
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TOPICS.map((t) => (
              <Card key={t.title} className="hover:shadow-md transition cursor-pointer">
                <CardContent className="p-5">
                  <div className="font-semibold">{t.title}</div>
                  <div className="text-sm text-muted-foreground mt-1">{t.desc}</div>
                  <div className="text-xs text-muted-foreground mt-3">{t.count} articles</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: MessageSquare, title: "Live Chat", desc: "Mon–Fri, 8a–6p CT", cta: "Start Chat" },
              { icon: Mail, title: "Email", desc: "support@agentcloud.com", cta: "Email Us" },
              { icon: Phone, title: "Phone", desc: "(800) 555-CLOUD", cta: "Call Support" },
            ].map((c) => (
              <Card key={c.title}>
                <CardContent className="p-5 text-center space-y-2">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center text-primary mx-auto"><c.icon className="h-5 w-5" /></div>
                  <div className="font-semibold">{c.title}</div>
                  <div className="text-sm text-muted-foreground">{c.desc}</div>
                  <Button variant="outline" size="sm" className="w-full">{c.cta}</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ticket" className="mt-4">
          <SubmitTicketForm />
        </TabsContent>

        <TabsContent value="my-tickets" className="mt-4">
          <MyTicketsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SubmitTicketForm() {
  const submitFn = useServerFn(submitTicket);
  const qc = useQueryClient();
  const [confirmed, setConfirmed] = useState<{ ticket_number: number } | null>(null);
  const [form, setForm] = useState({ subject: "", category: "", priority: "normal", description: "" });

  const mut = useMutation({
    mutationFn: () => submitFn({ data: { subject: form.subject, category: form.category, priority: form.priority as any, description: form.description } }),
    onSuccess: (res) => {
      setConfirmed({ ticket_number: res.ticket.ticket_number });
      qc.invalidateQueries({ queryKey: ["support", "myTickets"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to submit ticket"),
  });

  if (confirmed) {
    return (
      <Card>
        <CardContent className="p-8 flex flex-col items-center text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <div>
            <h2 className="text-xl font-bold">Ticket Submitted!</h2>
            <p className="text-sm text-muted-foreground mt-1">Your ticket #{confirmed.ticket_number} has been received. We'll respond within 1 business day.</p>
          </div>
          <Button variant="outline" onClick={() => { setConfirmed(null); setForm({ subject: "", category: "", priority: "normal", description: "" }); }}>
            Submit Another
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4 max-w-xl">
        <div className="space-y-1">
          <Label>Subject *</Label>
          <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Brief summary of your issue" maxLength={200} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Category *</Label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="billing">Billing</SelectItem>
                <SelectItem value="technical">Technical Issue</SelectItem>
                <SelectItem value="contracting">Contracting</SelectItem>
                <SelectItem value="commissions">Commissions</SelectItem>
                <SelectItem value="account">Account</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Description * <span className="text-muted-foreground font-normal text-xs">(min 20 characters)</span></Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Describe your issue in detail…"
            rows={5}
            maxLength={5000}
          />
          <div className="text-xs text-muted-foreground text-right">{form.description.length} / 5000</div>
        </div>
        <Button
          disabled={!form.subject.trim() || !form.category || form.description.trim().length < 20 || mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? "Submitting…" : "Submit Ticket"}
        </Button>
      </CardContent>
    </Card>
  );
}

function MyTicketsList() {
  const listFn = useServerFn(listMyTickets);
  const threadFn = useServerFn(getTicketThread);
  const { data: tickets, isLoading } = useQuery({
    queryKey: ["support", "myTickets"],
    queryFn: () => listFn(),
  });
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading tickets…</div>;
  if (!tickets || tickets.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          You haven't submitted any support tickets yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {tickets.map((t: any) => (
        <TicketCard
          key={t.id}
          ticket={t}
          isOpen={openTicketId === t.id}
          onToggle={() => setOpenTicketId(openTicketId === t.id ? null : t.id)}
          threadFn={threadFn}
        />
      ))}
    </div>
  );
}

function TicketCard({ ticket, isOpen, onToggle, threadFn }: { ticket: any; isOpen: boolean; onToggle: () => void; threadFn: any }) {
  const { data: thread } = useQuery({
    queryKey: ["support", "thread", ticket.id],
    queryFn: () => threadFn({ data: { ticket_id: ticket.id } }),
    enabled: isOpen,
  });

  return (
    <Card className="overflow-hidden">
      <button type="button" className="w-full text-left" onClick={onToggle}>
        <CardContent className="p-4 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">#{ticket.ticket_number} — {ticket.subject}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline" className={`text-xs ${STATUS_COLORS[ticket.status] ?? ""}`}>{ticket.status.replace("_", " ")}</Badge>
              <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[ticket.priority] ?? ""}`}>{ticket.priority}</Badge>
              <span className="text-xs text-muted-foreground">{ticket.category}</span>
              <span className="text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
        </CardContent>
      </button>

      {isOpen && (
        <div className="border-t px-4 py-3 space-y-2 bg-muted/20 max-h-80 overflow-y-auto">
          {!thread ? (
            <div className="text-xs text-muted-foreground text-center py-4">Loading…</div>
          ) : thread.messages.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4">No messages yet.</div>
          ) : (
            thread.messages.map((m: any) => (
              <div key={m.id} className={`flex ${m.sender_role === "agent" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.sender_role === "agent" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                  {m.body}
                  <div className="text-xs opacity-60 mt-1">{new Date(m.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}
