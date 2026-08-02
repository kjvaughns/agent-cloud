import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LifeBuoy, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { submitTicket, listMyTickets, getTicketThread } from "@/lib/support.functions";
import { AiHelpSearch } from "@/components/ai/ai-help-search";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { FaqPanel } from "@/components/account/faq-panel";

const TABS = ["kb", "faq", "ticket", "my-tickets"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_authenticated/account/help")({
  head: () => ({
    meta: [
      { title: "Help Center — Agent Cloud" },
      { name: "description", content: "Get help with Agent Cloud — articles, contact support, and live chat." },
    ],
  }),
  // ?tab= lets the old /account/faq link land on the FAQ rather than dumping
  // people on the knowledge base and making them hunt.
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => {
    const t = s.tab;
    return TABS.includes(t as Tab) ? { tab: t as Tab } : {};
  },
  component: HelpPage,
});

/**
 * What Ask AI is actually reading, linked so you can read it yourself.
 *
 * This replaces six topic cards that announced article counts ("12 articles")
 * for a knowledge base that does not exist — there is no article table
 * anywhere in the schema — and could not be clicked. Every entry below is a
 * route that renders content today.
 */
const SOURCES = [
  { title: "New agent guide", desc: "Licensing, contracting, first policy", to: "/resources/new-agent-guide" },
  { title: "Agent handbook", desc: "How the agency runs and what's expected", to: "/resources/agent-handbook" },
  { title: "Scripts", desc: "Openers, objections, closes", to: "/resources/scripts" },
  { title: "Academy", desc: "Courses and training", to: "/resources/agent-academy" },
  { title: "State licensing", desc: "Requirements state by state", to: "/resources/state-licenses" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  // `pending`, not `in_progress` — the latter was the only status listed here
  // that nothing in the app has ever written, so a ticket the agency had
  // picked up rendered with no colour at all.
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  resolved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  closed: "bg-muted text-muted-foreground",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-primary/10 text-primary",
  high: "bg-amber-100 text-amber-700",
  urgent: "bg-red-100 text-red-700",
};

function HelpPage() {
  const { tab } = Route.useSearch();
  // Controlled so "Still stuck? → Submit a ticket" can move you there. An
  // uncontrolled Tabs has no way to be told.
  const [active, setTab] = useState<Tab>(tab ?? "kb");
  return (
    <PageShell>
      <div className="max-w-5xl mx-auto space-y-6">
      <HeroBand
        title={<span className="flex items-center gap-2"><LifeBuoy className="h-6 w-6" /> Help Center</span>}
        subtitle="Ask a question, read the FAQ, or open a support ticket."
      />

      <Tabs value={active} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="kb">Knowledge Base</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
          <TabsTrigger value="ticket">Submit Ticket</TabsTrigger>
          <TabsTrigger value="my-tickets">My Tickets</TabsTrigger>
        </TabsList>

        <TabsContent value="kb" className="mt-4 space-y-4">
          <AiHelpSearch />

          <div>
            <div className="text-sm font-semibold mb-2">Or read it yourself</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SOURCES.map((s) => (
                <Link key={s.to} to={s.to}>
                  <Panel className="h-full hover:border-primary/40 transition">
                    <div className="font-semibold">{s.title}</div>
                    <div className="text-sm text-muted-foreground mt-1">{s.desc}</div>
                  </Panel>
                </Link>
              ))}
            </div>
          </div>

          {/* The three cards that were here offered Live Chat, an email
              address and a phone number, none of which exist. The button that
              routes a question to a person who will answer it is the ticket
              form, so that is what this points at. */}
          <Panel className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold">Still stuck?</div>
              <div className="text-sm text-muted-foreground">
                Open a ticket and your agency will pick it up. They can pass it to Agent Cloud if it's ours.
              </div>
            </div>
            <Button variant="outline" onClick={() => setTab("ticket")}>Submit a ticket</Button>
          </Panel>
        </TabsContent>

        {/* FAQ was its own sidebar entry; it belongs with the other
            self-service answers. */}
        <TabsContent value="faq" className="mt-4">
          <FaqPanel />
        </TabsContent>

        <TabsContent value="ticket" className="mt-4">
          <SubmitTicketForm />
        </TabsContent>

        <TabsContent value="my-tickets" className="mt-4">
          <MyTicketsList />
        </TabsContent>
      </Tabs>
      </div>
    </PageShell>
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
              {ticket.escalated_at && (
                <Badge variant="outline" className="text-xs">With Agent Cloud</Badge>
              )}
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
