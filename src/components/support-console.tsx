import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Panel } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Send, Loader2, LifeBuoy, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  listAgencyTickets, getTicketThread, replyToTicket, setTicketStatus, assignTicket,
  escalateTicket,
} from "@/lib/support.functions";
import { listOrgMembers } from "@/lib/permissions.functions";

/**
 * Agency support console.
 *
 * The server functions for this shipped in Phase 2 — listAgencyTickets,
 * assignTicket, replyToTicket, setTicketStatus — and nothing ever called
 * them. Agents could raise tickets that no one in the agency could see.
 *
 * Visibility is decided by support_tickets' own RLS: your own tickets,
 * tickets assigned to you, and — for anyone the agency has put on ticket
 * duty — the whole org. There is no cross-agency view.
 *
 * What a queue-runner could not do until now is escalate. Some questions are
 * not the agency's to answer — a billing charge, a bug, a platform outage —
 * and the only options were to answer wrongly or to leave the ticket open.
 */

const STATUS: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const PRIORITY_TONE: Record<string, string> = {
  urgent: "text-destructive",
  high: "text-warning",
  normal: "text-muted-foreground",
  low: "text-text-dim",
};

export function SupportConsole() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId
    ? <TicketThread id={openId} onBack={() => setOpenId(null)} />
    : <TicketQueue onOpen={setOpenId} />;
}

function TicketQueue({ onOpen }: { onOpen: (id: string) => void }) {
  const [status, setStatus] = useState<"all" | "open" | "pending" | "resolved" | "closed">("open");
  const [assigned, setAssigned] = useState<"all" | "me" | "unassigned">("all");

  const listFn = useServerFn(listAgencyTickets);
  const { data, isLoading } = useQuery({
    queryKey: ["support", "queue", status, assigned],
    queryFn: () => listFn({ data: { status, assigned } }),
  });

  const tickets = ((data as any)?.tickets ?? []) as any[];
  const open = tickets.filter((t) => t.status === "open").length;
  const unassigned = tickets.filter((t) => !t.assigned_to).length;

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="grid grid-cols-3 gap-[var(--gap)]">
        <Panel><StatTile label="Showing" value={String(tickets.length)} /></Panel>
        <Panel><StatTile label="Open" value={String(open)} tone={open ? "gold" : undefined} /></Panel>
        <Panel><StatTile label="Unassigned" value={String(unassigned)} tone={unassigned ? "red" : undefined} /></Panel>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {(["open", "pending", "resolved", "closed", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                status === s
                  ? "border-primary/40 bg-gold-glow text-gold-bright"
                  : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <Select value={assigned} onValueChange={(v) => setAssigned(v as any)}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anyone</SelectItem>
            <SelectItem value="me">Assigned to me</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : tickets.length === 0 ? (
        <Panel>
          <div className="py-14 text-center">
            <LifeBuoy className="mx-auto mb-3 h-9 w-9 text-text-dim" />
            <div className="font-semibold">No tickets here.</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Tickets your agents raise will appear in this queue.
            </p>
          </div>
        </Panel>
      ) : (
        <Panel pad={false} className="overflow-hidden">
          <ul className="divide-y divide-border-soft">
            {tickets.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => onOpen(t.id)}
                  className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{t.subject}</span>
                      <Badge
                        variant={t.status === "open" ? "warning" : t.status === "resolved" ? "success" : "secondary"}
                        className="text-[10px] capitalize"
                      >
                        {t.status}
                      </Badge>
                      {t.priority && t.priority !== "normal" && (
                        <span className={cn("text-[11px] font-medium capitalize", PRIORITY_TONE[t.priority])}>
                          {t.priority}
                        </span>
                      )}
                      {!t.assigned_to && (
                        <Badge variant="outline" className="text-[10px]">Unassigned</Badge>
                      )}
                      {t.scope === "platform" && (
                        <Badge variant="outline" className="text-[10px] border-primary/40 text-gold-bright">
                          {t.escalated_at ? "Escalated" : "Agent Cloud"}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {t.ticket_number && <span className="tnum">#{t.ticket_number}</span>}
                      {t.agent_name && <span>· {t.agent_name}</span>}
                      {t.category && <span>· {t.category}</span>}
                      {t.assignee_name && <span>· with {t.assignee_name}</span>}
                      <span>· {new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function TicketThread({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const threadFn = useServerFn(getTicketThread);
  const replyFn = useServerFn(replyToTicket);
  const statusFn = useServerFn(setTicketStatus);
  const assignFn = useServerFn(assignTicket);
  const escalateFn = useServerFn(escalateTicket);
  const membersFn = useServerFn(listOrgMembers);

  const { data, isLoading } = useQuery({
    queryKey: ["support", "thread", id],
    queryFn: () => threadFn({ data: { ticket_id: id } }),
  });
  const { data: members } = useQuery({
    queryKey: ["org-members", "support"],
    queryFn: () => membersFn(),
    retry: false,
  });

  const [body, setBody] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [note, setNote] = useState("");
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["support", "thread", id] });
    qc.invalidateQueries({ queryKey: ["support", "queue"] });
  };

  const reply = useMutation({
    mutationFn: () => replyFn({ data: { ticket_id: id, body: body.trim(), sender_role: "support" } }),
    onSuccess: () => { setBody(""); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't send"),
  });

  const changeStatus = useMutation({
    mutationFn: (s: string) => statusFn({ data: { ticket_id: id, status: s as any } }),
    onSuccess: () => { toast.success("Status updated"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't update"),
  });

  const assign = useMutation({
    mutationFn: (who: string) =>
      assignFn({ data: { ticket_id: id, assignee_id: who === "__none__" ? null : who } }),
    onSuccess: () => { toast.success("Assigned"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't assign"),
  });

  const escalate = useMutation({
    mutationFn: (note: string) => escalateFn({ data: { ticket_id: id, note: note || undefined } }),
    onSuccess: (r: any) => {
      toast.success(r?.alreadyEscalated ? "Already with Agent Cloud" : "Sent to Agent Cloud support");
      setEscalating(false);
      setNote("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't escalate"),
  });

  if (isLoading) return <Skeleton className="h-[420px]" />;

  const ticket = (data as any)?.ticket;
  const messages = ((data as any)?.messages ?? []) as any[];
  const roster = ((members as any)?.members ?? []) as any[];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <Button variant="ghost" size="sm" className="-ml-2 self-start" onClick={onBack}>
        <ArrowLeft className="mr-1 h-4 w-4" /> All tickets
      </Button>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {ticket?.subject}
            </h2>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {ticket?.ticket_number && <span className="tnum">#{ticket.ticket_number}</span>}
              {ticket?.category && <span>· {ticket.category}</span>}
              {ticket?.priority && <span className="capitalize">· {ticket.priority}</span>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={ticket?.status ?? "open"} onValueChange={(v) => changeStatus.mutate(v)}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>

            {roster.length > 0 && (
              <Select
                value={ticket?.assigned_to ?? "__none__"}
                onValueChange={(v) => assign.mutate(v)}
              >
                <SelectTrigger className="h-8 w-[170px] text-xs">
                  <SelectValue placeholder="Assign to…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {roster.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {`${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {ticket?.description && (
          <p className="mt-4 whitespace-pre-line border-t border-border-soft pt-4 text-sm text-muted-foreground">
            {ticket.description}
          </p>
        )}

        {/* Escalation. Only offered where it means something: a ticket
            already on the platform desk has nowhere further to go. */}
        <div className="mt-4 border-t border-border-soft pt-4">
          {ticket?.scope === "platform" ? (
            <p className="text-xs text-muted-foreground">
              {ticket?.escalated_at
                ? `With Agent Cloud support since ${new Date(ticket.escalated_at).toLocaleDateString()}. You can still reply here — the thread is shared.`
                : "This ticket is with Agent Cloud support."}
            </p>
          ) : escalating ? (
            <div className="space-y-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What do you need Agent Cloud to look at? (optional)"
                className="min-h-[70px]"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => escalate.mutate(note)} disabled={escalate.isPending}>
                  {escalate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send to Agent Cloud"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEscalating(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEscalating(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <ArrowUpRight className="h-3.5 w-3.5" /> Escalate to Agent Cloud
            </button>
          )}
        </div>
      </Panel>

      <Panel title="Conversation">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No replies yet.</p>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className={cn(
                  "rounded-lg border p-3",
                  m.sender_role === "support"
                    ? "border-primary/30 bg-primary/[0.04]"
                    : "border-border bg-surface-2",
                )}
              >
                <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-semibold capitalize text-foreground">
                    {m.sender_role === "support" ? "Agency" : "Agent"}
                  </span>
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-line text-sm">{m.body}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-border-soft pt-4">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a reply…"
            className="min-h-[90px]"
          />
          <Button
            className="mt-2"
            onClick={() => reply.mutate()}
            disabled={!body.trim() || reply.isPending}
          >
            {reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1 h-3.5 w-3.5" /> Send reply</>}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
