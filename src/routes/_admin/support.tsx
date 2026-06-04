import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  adminListTickets,
  adminGetTicketThread,
  adminReplyToTicket,
} from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Send, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_admin/support")({
  component: AdminSupport,
  head: () => ({ meta: [{ title: "Support — Agent Cloud Admin" }] }),
});

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-600",
  high: "bg-amber-500/15 text-amber-600",
  normal: "bg-slate-500/15 text-slate-500",
  low: "bg-emerald-500/15 text-emerald-600",
};

const STATUS_TABS = ["open", "in_progress", "resolved", "all"];

function AdminSupport() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [statusTab, setStatusTab] = useState("open");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [newStatus, setNewStatus] = useState("");

  async function loadTickets() {
    setLoading(true);
    const res = await adminListTickets();
    setTickets(res.tickets);
    setLoading(false);
  }

  async function openTicket(ticket: any) {
    setSelected(ticket);
    setThreadLoading(true);
    setMessages([]);
    setNewStatus(ticket.status);
    const res = await adminGetTicketThread({ data: { ticket_id: ticket.id } });
    setMessages(res.messages);
    setThreadLoading(false);
  }

  useEffect(() => { loadTickets(); }, []);

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      await adminReplyToTicket({
        data: {
          ticket_id: selected.id,
          body: reply.trim(),
          new_status: newStatus !== selected.status ? newStatus : undefined,
        },
      });
      setReply("");
      if (newStatus !== selected.status) {
        setSelected({ ...selected, status: newStatus });
        setTickets((prev) => prev.map((t) => t.id === selected.id ? { ...t, status: newStatus } : t));
      }
      const res = await adminGetTicketThread({ data: { ticket_id: selected.id } });
      setMessages(res.messages);
      toast.success("Reply sent");
    } catch (e: any) {
      toast.error(e.message);
    }
    setSending(false);
  }

  const filtered = tickets.filter((t) => {
    const matchTab = statusTab === "all" || t.status === statusTab;
    const matchPriority = priorityFilter === "all" || t.priority === priorityFilter;
    const name = `${t.profiles?.first_name} ${t.profiles?.last_name}`.toLowerCase();
    const matchSearch = !search || t.subject.toLowerCase().includes(search.toLowerCase()) || name.includes(search.toLowerCase());
    return matchTab && matchPriority && matchSearch;
  });

  return (
    <div className="h-[calc(100vh-0px)] flex overflow-hidden">
      {/* Ticket list */}
      <div className="w-1/3 border-r border-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border space-y-3">
          <h1 className="text-lg font-bold">Support Tickets</h1>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusTab(s)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md capitalize transition-colors",
                  statusTab === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {s === "all" ? "All" : s.replace("_", " ")}
              </button>
            ))}
          </div>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">No tickets</div>
          ) : filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => openTicket(t)}
              className={cn(
                "w-full text-left p-4 hover:bg-muted/30 transition-colors",
                selected?.id === t.id && "bg-muted/40"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium truncate flex-1 mr-2">{t.subject}</p>
                <Badge className={cn("text-[10px] shrink-0", PRIORITY_COLORS[t.priority])}>{t.priority}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{t.profiles?.first_name} {t.profiles?.last_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Thread panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <LifeBuoy className="h-10 w-10 opacity-30" />
            <p className="text-sm">Select a ticket to view the thread</p>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-border">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">{selected.subject}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {selected.profiles?.first_name} {selected.profiles?.last_name} · {selected.profiles?.email}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={cn("text-xs", PRIORITY_COLORS[selected.priority])}>{selected.priority}</Badge>
                  <Badge className="text-xs capitalize">{selected.status}</Badge>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {threadLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No messages yet</p>
              ) : messages.map((m) => (
                <div key={m.id} className={cn("flex", m.sender_role === "support" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[70%] rounded-lg px-4 py-2.5 text-sm",
                      m.sender_role === "support"
                        ? "bg-[#C9A227] text-black"
                        : "bg-muted text-foreground"
                    )}
                  >
                    <p className="text-xs font-medium mb-1 opacity-70">
                      {m.profiles?.first_name} {m.profiles?.last_name} · {m.sender_role}
                    </p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className="text-xs mt-1 opacity-60">{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-border space-y-3">
              <div className="flex items-center gap-2">
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                {newStatus !== selected.status && (
                  <span className="text-xs text-amber-600">Status will change on send</span>
                )}
              </div>
              <div className="flex gap-2">
                <Textarea
                  placeholder="Write a reply..."
                  className="min-h-[80px] resize-none"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply(); }}
                />
                <Button
                  className="shrink-0 self-end"
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
