import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  MessageSquare, Wallet, Settings as SettingsIcon, List, Plus, Send, Paperclip,
  Image as ImageIcon, Delete, X, User as UserIcon, MoreVertical,
  Mic, MicOff, Keyboard, Volume2, Pause, PhoneForwarded, Bot, ArrowLeft,
  Trash2, Play, Voicemail as VoicemailIcon, Loader2, Check, CheckCheck,
} from "lucide-react";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { phone as fmtPhone } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import {
  getPhoneOverview, updatePhoneSettings,
  listConversations, listMessages, markConversationRead,
  sendSms, startConversation, searchClientsForPhone,
  listRecents, logCall,
  listDialLists, getDialList, createDialList, deleteDialList, recordDialOutcome,
  type Conversation, type SmsMessage, type CallLog, type DialListSummary, type DialListEntry,
} from "@/lib/phone.functions";

const TabSchema = z.object({
  tab: z.enum(["phone", "sms", "dial"]).default("phone").catch("phone"),
});

export const Route = createFileRoute("/_authenticated/phone")({
  validateSearch: TabSchema,
  head: () => ({
    meta: [
      { title: "My Phone — Agent Cloud" },
      { name: "description", content: "Browser VoIP, SMS messaging, power dialer, and wallet for life insurance agents." },
    ],
  }),
  component: PhonePage,
});

function PhonePage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  const overviewFn = useServerFn(getPhoneOverview);
  const overview = useQuery({
    queryKey: ["phone", "overview"],
    queryFn: () => overviewFn(),
  });

  const [settingsOpen, setSettingsOpen] = useState(false);

  // realtime invalidation for SMS
  useEffect(() => {
    const ch = supabase
      .channel("phone-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "sms_messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["phone"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sms_conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["phone"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const number = overview.data?.settings.phone_number;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">My Phone</h1>
            <p className="text-sm text-muted-foreground">Browser calls, SMS, and power dialer.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Your number</div>
              <div className="text-sm font-medium flex items-center gap-2">
                {number ? fmtPhone(number) : <span className="text-muted-foreground">Not provisioned</span>}
                <span className={cn("h-2 w-2 rounded-full", number ? "bg-emerald-500" : "bg-muted-foreground/40")} />
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button variant="outline" size="sm" disabled className="cursor-not-allowed opacity-60">
                    <Wallet className="h-4 w-4 mr-2" /> Wallet
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Coming soon</TooltipContent>
            </Tooltip>
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon className="h-4 w-4 mr-2" /> Settings
            </Button>
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => navigate({ search: { tab: v as "phone" | "sms" | "dial" } })}
        >
          <TabsList>
            <TabsTrigger value="phone"><Phone className="h-4 w-4 mr-1.5" /> Telephone</TabsTrigger>
            <TabsTrigger value="sms" className="gap-1.5">
              <MessageSquare className="h-4 w-4" /> SMS
              {overview.data && overview.data.unreadTotal > 0 && (
                <Badge variant="default" className="h-5 px-1.5 text-[10px]">{overview.data.unreadTotal}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="dial"><List className="h-4 w-4 mr-1.5" /> Dial Lists</TabsTrigger>
          </TabsList>

          <TabsContent value="phone" className="mt-4"><TelephonePanel /></TabsContent>
          <TabsContent value="sms" className="mt-4"><SmsPanel /></TabsContent>
          <TabsContent value="dial" className="mt-4"><DialListsPanel /></TabsContent>
        </Tabs>

        <PhoneSettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={overview.data?.settings ?? null}
        />
      </div>
    </TooltipProvider>
  );
}

/* ===================================================================== */
/* TELEPHONE                                                             */
/* ===================================================================== */

type SubTab = "keypad" | "recents" | "voicemail";

function TelephonePanel() {
  const [sub, setSub] = useState<SubTab>("keypad");
  const [number, setNumber] = useState("");
  const [callState, setCallState] = useState<null | {
    phone: string;
    startedAt: number;
    status: "ringing" | "connected";
  }>(null);
  const recentsFn = useServerFn(listRecents);
  const recents = useQuery({ queryKey: ["phone", "recents"], queryFn: () => recentsFn() });

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-6">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {callState ? (
            <ActiveCall call={callState} onEnd={() => setCallState(null)} />
          ) : sub === "keypad" ? (
            <Dialer
              value={number}
              onChange={setNumber}
              onCall={(p) => setCallState({ phone: p, startedAt: Date.now(), status: "ringing" })}
            />
          ) : sub === "recents" ? (
            <Recents
              data={recents.data ?? []}
              isLoading={recents.isLoading}
              onPick={(p) => { setNumber(fmtPhone(p)); setSub("keypad"); }}
            />
          ) : (
            <Voicemail />
          )}

          {!callState && (
            <div className="grid grid-cols-3 border-t bg-muted/30">
              <SubTabBtn icon={PhoneCall} label="Recents" active={sub === "recents"} onClick={() => setSub("recents")} />
              <SubTabBtn icon={VoicemailIcon} label="Voicemail" active={sub === "voicemail"} onClick={() => setSub("voicemail")} />
              <SubTabBtn icon={Keyboard} label="Keypad" active={sub === "keypad"} onClick={() => setSub("keypad")} />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="hidden lg:block">
        <Card>
          <CardContent className="p-4">
            <div className="font-medium mb-3 flex items-center gap-2">
              <PhoneCall className="h-4 w-4" /> Recent Calls
            </div>
            <RecentsList data={(recents.data ?? []).slice(0, 12)} onPick={(p) => setNumber(fmtPhone(p))} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SubTabBtn({ icon: Icon, label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 py-3 text-xs transition-colors",
        active ? "text-primary bg-background" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function formatTyping(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function Dialer({
  value, onChange, onCall,
}: {
  value: string;
  onChange: (v: string) => void;
  onCall: (phone: string) => void;
}) {
  const keys: Array<[string, string?]> = [
    ["1"], ["2", "ABC"], ["3", "DEF"],
    ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
    ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
    ["*"], ["0", "+"], ["#"],
  ];

  const handleKey = (k: string) => onChange(formatTyping(value.replace(/\D/g, "") + k));
  const handleBack = () => onChange(formatTyping(value.replace(/\D/g, "").slice(0, -1)));
  const digits = value.replace(/\D/g, "");

  return (
    <div className="p-4 md:p-6">
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(formatTyping(e.target.value))}
          placeholder="Enter a number"
          className="text-2xl h-14 text-center font-medium tracking-wide pr-10"
        />
        {value && (
          <button
            onClick={handleBack}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Backspace"
          >
            <Delete className="h-5 w-5" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-6">
        {keys.map(([k, sub]) => (
          <button
            key={k}
            onClick={() => handleKey(k)}
            className="h-16 rounded-full bg-muted hover:bg-muted/80 active:scale-95 transition-all flex flex-col items-center justify-center"
          >
            <span className="text-2xl font-light leading-none">{k}</span>
            {sub && <span className="text-[10px] tracking-wider text-muted-foreground mt-0.5">{sub}</span>}
          </button>
        ))}
      </div>
      <div className="mt-6 flex justify-center">
        <button
          onClick={() => digits.length >= 7 && onCall(digits)}
          disabled={digits.length < 7}
          className="h-16 w-16 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-lg transition-all active:scale-95"
          aria-label="Call"
        >
          <Phone className="h-7 w-7" />
        </button>
      </div>
    </div>
  );
}

function ActiveCall({
  call, onEnd,
}: {
  call: { phone: string; startedAt: number; status: "ringing" | "connected" };
  onEnd: () => void;
}) {
  const [, force] = useState(0);
  const [status, setStatus] = useState(call.status);
  const [mute, setMute] = useState(false);
  const [hold, setHold] = useState(false);
  const queryClient = useQueryClient();
  const logCallFn = useServerFn(logCall);

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (status === "ringing") {
      const t = setTimeout(() => setStatus("connected"), 1500);
      return () => clearTimeout(t);
    }
  }, [status]);

  const elapsedSec = Math.max(0, Math.floor((Date.now() - call.startedAt - 1500) / 1000));
  const duration = status === "connected" ? elapsedSec : 0;
  const mm = String(Math.floor(duration / 60));
  const ss = String(duration % 60).padStart(2, "0");

  const handleEnd = async () => {
    try {
      await logCallFn({
        data: {
          phone_number: call.phone,
          direction: "outbound",
          duration_seconds: duration,
          outcome: status === "connected" ? "connected" : "no_answer",
        },
      });
      queryClient.invalidateQueries({ queryKey: ["phone", "recents"] });
    } catch (e) {
      console.error(e);
    }
    onEnd();
  };

  return (
    <div className="p-8 flex flex-col items-center text-center min-h-[480px]">
      <Avatar className="h-20 w-20 mb-4">
        <AvatarFallback className="text-xl bg-primary/10 text-primary">
          <UserIcon className="h-8 w-8" />
        </AvatarFallback>
      </Avatar>
      <div className="text-xl font-semibold">{fmtPhone(call.phone)}</div>
      <div className="text-sm text-muted-foreground mt-1">
        {status === "ringing" ? "Calling…" : `Connected · ${mm}:${ss}`}
      </div>

      <div className="mt-8 grid grid-cols-3 gap-3 w-full max-w-[280px]">
        <CallBtn icon={mute ? MicOff : Mic} label="Mute" active={mute} onClick={() => setMute(!mute)} />
        <CallBtn icon={Keyboard} label="Keypad" />
        <CallBtn icon={Volume2} label="Speaker" />
        <CallBtn icon={PhoneForwarded} label="Transfer" />
        <CallBtn icon={Pause} label="Hold" active={hold} onClick={() => setHold(!hold)} />
        <button
          onClick={handleEnd}
          className="h-14 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex flex-col items-center justify-center transition-colors"
        >
          <Phone className="h-5 w-5 rotate-[135deg]" />
        </button>
      </div>
    </div>
  );
}

function CallBtn({ icon: Icon, label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-14 rounded-full flex flex-col items-center justify-center transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70",
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] mt-0.5">{label}</span>
    </button>
  );
}

function Recents({
  data, isLoading, onPick,
}: {
  data: CallLog[]; isLoading: boolean; onPick: (phone: string) => void;
}) {
  return (
    <div className="p-4 min-h-[420px]">
      <div className="font-medium text-sm mb-3 px-1">Recents</div>
      {isLoading ? (
        <Loading />
      ) : data.length === 0 ? (
        <EmptyState icon={PhoneCall} title="No recent calls" />
      ) : (
        <RecentsList data={data} onPick={onPick} />
      )}
    </div>
  );
}

function RecentsList({ data, onPick }: { data: CallLog[]; onPick: (phone: string) => void }) {
  if (!data.length) return <EmptyState icon={PhoneCall} title="No recent calls" />;
  return (
    <ul className="divide-y">
      {data.map((c) => {
        const Icon =
          c.outcome === "no_answer" && c.direction === "inbound" ? PhoneMissed :
          c.direction === "outbound" ? PhoneOutgoing : PhoneIncoming;
        const missed = c.outcome === "no_answer" && c.direction === "inbound";
        const dur = c.duration_seconds ?? 0;
        const name = [c.client_first_name, c.client_last_name].filter(Boolean).join(" ");
        return (
          <li key={c.id}>
            <button
              onClick={() => onPick(c.phone_number)}
              className="w-full flex items-center gap-3 py-2.5 px-2 hover:bg-muted/50 rounded text-left"
            >
              <Icon className={cn("h-4 w-4 shrink-0", missed ? "text-rose-500" : "text-muted-foreground")} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{name || fmtPhone(c.phone_number)}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.direction === "outbound" ? "Outbound" : "Inbound"}
                  {dur > 0 && ` · ${Math.floor(dur / 60)}m ${dur % 60}s`}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground shrink-0">
                {new Date(c.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Voicemail() {
  return (
    <div className="p-4 min-h-[420px]">
      <div className="font-medium text-sm mb-3 px-1">Voicemail</div>
      <EmptyState icon={VoicemailIcon} title="No voicemails" subtitle="New voicemails appear here." />
    </div>
  );
}

/* ===================================================================== */
/* SMS                                                                    */
/* ===================================================================== */

function SmsPanel() {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [search, setSearch] = useState("");

  const listFn = useServerFn(listConversations);
  const conversations = useQuery({
    queryKey: ["phone", "conversations", filter],
    queryFn: () => listFn({ data: { filter } }),
  });

  const filtered = useMemo(() => {
    const rows = conversations.data ?? [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((c) =>
      (c.client_first_name ?? "").toLowerCase().includes(q) ||
      (c.client_last_name ?? "").toLowerCase().includes(q) ||
      c.phone_number.includes(q),
    );
  }, [conversations.data, search]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-260px)] min-h-[520px]">
      <Card className="overflow-hidden flex flex-col">
        <div className="p-3 border-b flex items-center justify-between gap-2">
          <div className="font-semibold">Messages</div>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        </div>
        <div className="px-3 py-2 border-b space-y-2">
          <div className="flex gap-1">
            <Button
              size="sm" variant={filter === "all" ? "secondary" : "ghost"}
              onClick={() => setFilter("all")}
            >All</Button>
            <Button
              size="sm" variant={filter === "unread" ? "secondary" : "ghost"}
              onClick={() => setFilter("unread")}
            >Unread</Button>
          </div>
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
        </div>
        <ScrollArea className="flex-1">
          {conversations.isLoading ? (
            <Loading />
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No conversations yet
            </div>
          ) : (
            <ul>
              {filtered.map((c) => (
                <ConversationRow
                  key={c.id}
                  c={c}
                  active={c.id === activeId}
                  onClick={() => setActiveId(c.id)}
                />
              ))}
            </ul>
          )}
        </ScrollArea>
      </Card>

      <Card className="overflow-hidden flex flex-col">
        {activeId ? (
          <MessageThread
            conversationId={activeId}
            conversation={(conversations.data ?? []).find((c) => c.id === activeId)}
            onBack={() => setActiveId(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <div className="font-semibold">Select a conversation</div>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Pick a thread from the left, or start a new conversation.
            </p>
            <Button className="mt-4" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Message
            </Button>
          </div>
        )}
      </Card>

      <NewMessageDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) => { setActiveId(id); setNewOpen(false); }}
      />
    </div>
  );
}

function initialsOf(c: Conversation) {
  const f = (c.client_first_name ?? "").trim();
  const l = (c.client_last_name ?? "").trim();
  if (f || l) return `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase() || "?";
  const d = c.phone_number.replace(/\D/g, "");
  return d.slice(-2) || "#";
}

function ConversationRow({
  c, active, onClick,
}: { c: Conversation; active: boolean; onClick: () => void }) {
  const name = [c.client_first_name, c.client_last_name].filter(Boolean).join(" ") || fmtPhone(c.phone_number);
  const unread = (c.unread_count ?? 0) > 0;
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "w-full px-3 py-2.5 flex gap-3 text-left hover:bg-muted/60 border-l-2 border-transparent transition-colors",
          active && "bg-muted/70 border-l-primary",
        )}
      >
        <Avatar className="h-9 w-9">
          <AvatarFallback className="text-xs bg-primary/15 text-primary">
            {initialsOf(c)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className={cn("text-sm truncate", unread && "font-semibold")}>{name}</div>
            <div className="text-[10px] text-muted-foreground shrink-0">
              {timeAgo(c.last_message_at)}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className={cn(
              "text-xs truncate flex-1",
              unread ? "text-foreground font-medium" : "text-muted-foreground",
            )}>
              {c.last_message_direction === "outbound" && "You: "}
              {c.last_message_preview ?? "No messages yet"}
            </div>
            {unread && (
              <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

function MessageThread({
  conversationId, conversation, onBack,
}: { conversationId: string; conversation?: Conversation; onBack: () => void }) {
  const queryClient = useQueryClient();
  const listMsgFn = useServerFn(listMessages);
  const sendFn = useServerFn(sendSms);
  const markReadFn = useServerFn(markConversationRead);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const msgs = useQuery({
    queryKey: ["phone", "messages", conversationId],
    queryFn: () => listMsgFn({ data: { conversationId } }),
  });

  useEffect(() => {
    if (conversation && (conversation.unread_count ?? 0) > 0) {
      markReadFn({ data: { id: conversationId } }).then(() =>
        queryClient.invalidateQueries({ queryKey: ["phone"] }),
      );
    }
  }, [conversationId, conversation, markReadFn, queryClient]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.data?.length]);

  const send = useMutation({
    mutationFn: async () => sendFn({ data: { conversationId, body: text.trim() } }),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["phone"] });
    },
  });

  const name = conversation
    ? [conversation.client_first_name, conversation.client_last_name].filter(Boolean).join(" ") || fmtPhone(conversation.phone_number)
    : "";

  return (
    <>
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs bg-primary/15 text-primary">
            {conversation ? initialsOf(conversation) : "?"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{name}</div>
          {conversation && (
            <div className="text-xs text-muted-foreground">{fmtPhone(conversation.phone_number)}</div>
          )}
        </div>
        <Button variant="ghost" size="icon">
          <Phone className="h-4 w-4" />
        </Button>
        {conversation?.client_id && (
          <Button variant="ghost" size="icon" asChild>
            <Link to="/pipeline"><UserIcon className="h-4 w-4" /></Link>
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        {msgs.isLoading ? (
          <Loading />
        ) : (msgs.data ?? []).length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            Start the conversation with a message below.
          </div>
        ) : (
          <div className="space-y-2">
            {(msgs.data ?? []).map((m) => <MessageBubble key={m.id} m={m} />)}
            <div ref={endRef} />
          </div>
        )}
      </ScrollArea>

      <div className="border-t p-3 flex items-end gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={-1}>
              <Button variant="ghost" size="icon" disabled className="cursor-not-allowed opacity-50">
                <Paperclip className="h-4 w-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Attach photo</TooltipContent>
        </Tooltip>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim() && !send.isPending) send.mutate();
            }
          }}
          placeholder="Type a message..."
          rows={1}
          className="resize-none min-h-[40px] max-h-[120px]"
        />
        <div className="flex flex-col items-end gap-1">
          {text.length > 140 && (
            <span className="text-[10px] text-muted-foreground">{text.length}/1600</span>
          )}
          <Button
            onClick={() => send.mutate()}
            disabled={!text.trim() || send.isPending}
            size="icon"
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </>
  );
}

function MessageBubble({ m }: { m: SmsMessage }) {
  const out = m.direction === "outbound";
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[75%]", out ? "items-end" : "items-start", "flex flex-col gap-1")}>
        {m.is_auto && (
          <div className="text-[10px] text-muted-foreground flex items-center gap-1 px-1">
            <Bot className="h-3 w-3" /> Nova
          </div>
        )}
        <div className={cn(
          "rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
          out ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md",
        )}>
          {m.body}
          {m.media_url && (
            <a href={m.media_url} target="_blank" rel="noreferrer" className="block mt-2">
              <img src={m.media_url} alt="" className="rounded-lg max-h-48" />
            </a>
          )}
        </div>
        <div className={cn(
          "text-[10px] text-muted-foreground flex items-center gap-1 px-1",
          out && "flex-row-reverse",
        )}>
          {out && (m.status === "delivered" ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
          {new Date(m.sent_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

function NewMessageDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [phone, setPhone] = useState("");
  const searchFn = useServerFn(searchClientsForPhone);
  const startFn = useServerFn(startConversation);
  const queryClient = useQueryClient();

  const results = useQuery({
    queryKey: ["phone", "search-clients", q],
    queryFn: () => searchFn({ data: { q } }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async (vars: { clientId?: string; phoneNumber: string }) =>
      startFn({ data: vars }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["phone"] });
      onCreated(r.id);
      setQ(""); setPhone("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
          <DialogDescription>Search a client or enter a phone number.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Search clients..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="max-h-48 overflow-y-auto border rounded">
            {(results.data ?? []).length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">No results</div>
            ) : (
              <ul>
                {(results.data ?? []).map((c: any) => (
                  <li key={c.id}>
                    <button
                      onClick={() => c.phone && create.mutate({ clientId: c.id, phoneNumber: c.phone })}
                      disabled={!c.phone}
                      className="w-full text-left px-3 py-2 hover:bg-muted/60 disabled:opacity-50 flex justify-between"
                    >
                      <span>{c.first_name} {c.last_name}</span>
                      <span className="text-xs text-muted-foreground">{c.phone ? fmtPhone(c.phone) : "no phone"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t pt-3">
            <Label className="text-xs">Or enter a phone number</Label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="(555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Button
                onClick={() => phone.replace(/\D/g, "").length >= 10 && create.mutate({ phoneNumber: phone })}
                disabled={phone.replace(/\D/g, "").length < 10 || create.isPending}
              >
                Start
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ===================================================================== */
/* DIAL LISTS                                                             */
/* ===================================================================== */

function DialListsPanel() {
  const listFn = useServerFn(listDialLists);
  const lists = useQuery({ queryKey: ["phone", "dial-lists"], queryFn: () => listFn() });
  const [editorOpen, setEditorOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const deleteFn = useServerFn(deleteDialList);

  const remove = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["phone", "dial-lists"] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Power Dialer</h2>
          <p className="text-sm text-muted-foreground">Create dial lists and power through your calls.</p>
        </div>
        <Button onClick={() => setEditorOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New List
        </Button>
      </div>

      {lists.isLoading ? (
        <Loading />
      ) : (lists.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <Phone className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <div className="font-semibold">No Dial Lists Yet</div>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Create a list to power dial through your contacts efficiently.
            </p>
            <Button className="mt-4" onClick={() => setEditorOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create Your First List
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(lists.data ?? []).map((l) => (
            <DialListCard
              key={l.id}
              list={l}
              onStart={() => setSessionId(l.id)}
              onDelete={() => confirm(`Delete "${l.name}"?`) && remove.mutate(l.id)}
            />
          ))}
        </div>
      )}

      <DialListEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["phone", "dial-lists"] })}
      />

      {sessionId && (
        <DialingSession listId={sessionId} onClose={() => {
          setSessionId(null);
          queryClient.invalidateQueries({ queryKey: ["phone"] });
        }} />
      )}
    </div>
  );
}

function DialListCard({
  list, onStart, onDelete,
}: { list: DialListSummary; onStart: () => void; onDelete: () => void }) {
  const pct = list.total > 0 ? Math.round((list.called / list.total) * 100) : 0;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{list.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {list.total} contact{list.total === 1 ? "" : "s"} · Created {new Date(list.created_at).toLocaleDateString()}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Progress</span>
            <span>{list.called}/{list.total} ({pct}%)</span>
          </div>
          <Progress value={pct} />
        </div>
        <Button className="w-full mt-4" onClick={onStart} disabled={list.total === 0}>
          <Play className="h-4 w-4 mr-1" /> Start Dialing
        </Button>
      </CardContent>
    </Card>
  );
}

function DialListEditor({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Array<{ id: string; first_name: string; last_name: string; phone: string | null; stage: string }>>([]);
  const [q, setQ] = useState("");
  const searchFn = useServerFn(searchClientsForPhone);
  const createFn = useServerFn(createDialList);

  const results = useQuery({
    queryKey: ["phone", "search-clients-dial", q],
    queryFn: () => searchFn({ data: { q } }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async () => createFn({ data: { name, clientIds: selected.map((s) => s.id) } }),
    onSuccess: () => {
      onCreated();
      onOpenChange(false);
      setName(""); setSelected([]); setQ("");
    },
  });

  const toggle = (c: any) => {
    setSelected((cur) => cur.some((s) => s.id === c.id)
      ? cur.filter((s) => s.id !== c.id)
      : [...cur, c]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Dial List</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>List name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Follow-Up May 2026" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Add contacts</Label>
              <Input
                placeholder="Search by name or phone..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="mt-1"
              />
              <div className="mt-2 border rounded max-h-64 overflow-y-auto">
                {(results.data ?? []).map((c: any) => {
                  const on = selected.some((s) => s.id === c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => c.phone && toggle(c)}
                      disabled={!c.phone}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-muted/60 flex justify-between disabled:opacity-50",
                        on && "bg-primary/10",
                      )}
                    >
                      <span>{c.first_name} {c.last_name}</span>
                      <span className="text-xs text-muted-foreground">{c.phone ? fmtPhone(c.phone) : "no phone"}</span>
                    </button>
                  );
                })}
                {(results.data ?? []).length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground text-center">No clients</div>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs">Selected ({selected.length})</Label>
              <div className="mt-1 border rounded max-h-72 overflow-y-auto">
                {selected.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground text-center">Pick clients from the left</div>
                ) : selected.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm border-b last:border-0">
                    <div>
                      <div>{s.first_name} {s.last_name}</div>
                      <div className="text-xs text-muted-foreground">{s.phone ? fmtPhone(s.phone) : ""}</div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => toggle(s)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!name.trim() || selected.length === 0 || create.isPending}
          >
            {create.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save List
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialingSession({ listId, onClose }: { listId: string; onClose: () => void }) {
  const getFn = useServerFn(getDialList);
  const outcomeFn = useServerFn(recordDialOutcome);
  const logFn = useServerFn(logCall);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["phone", "dial-list", listId],
    queryFn: () => getFn({ data: { id: listId } }),
  });
  const [callOpen, setCallOpen] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const entries = data?.entries ?? [];
  const pending = entries.filter((e) => !e.called_at);
  const current: DialListEntry | undefined = pending[0];
  const idx = current ? entries.findIndex((e) => e.id === current.id) : -1;

  const record = useMutation({
    mutationFn: async (outcome: "connected" | "no_answer" | "voicemail" | "callback" | "removed") => {
      if (!current) return;
      // Log call if we just placed one
      if (startedAt && current.client_phone) {
        const dur = Math.floor((Date.now() - startedAt) / 1000);
        await logFn({
          data: {
            phone_number: current.client_phone,
            client_id: current.client_id,
            direction: "outbound",
            duration_seconds: dur,
            outcome: outcome === "callback" ? "connected" : outcome === "removed" ? "no_answer" : (outcome as any),
          },
        });
      }
      await outcomeFn({ data: { entryId: current.id, outcome } });
    },
    onSuccess: () => {
      setCallOpen(false);
      setStartedAt(null);
      queryClient.invalidateQueries({ queryKey: ["phone", "dial-list", listId] });
      queryClient.invalidateQueries({ queryKey: ["phone", "dial-lists"] });
      queryClient.invalidateQueries({ queryKey: ["phone", "recents"] });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{data?.list?.name ?? "Dialing"}</DialogTitle>
          <DialogDescription>
            {entries.length > 0 && current
              ? `Contact ${idx + 1} of ${entries.length}`
              : "Session"}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? <Loading /> : !current ? (
          <div className="py-8 text-center">
            <Check className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
            <div className="font-semibold">All done</div>
            <p className="text-sm text-muted-foreground mt-1">Every contact in this list has been called.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <Progress value={(idx / Math.max(entries.length, 1)) * 100} />
            <Card>
              <CardContent className="p-4 text-center">
                <Avatar className="h-14 w-14 mx-auto mb-2">
                  <AvatarFallback className="bg-primary/15 text-primary">
                    {(current.client_first_name?.[0] ?? "?") + (current.client_last_name?.[0] ?? "")}
                  </AvatarFallback>
                </Avatar>
                <div className="font-semibold">
                  {current.client_first_name} {current.client_last_name}
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {current.client_phone ? fmtPhone(current.client_phone) : "No phone"}
                </div>
                {current.client_stage && (
                  <Badge variant="secondary" className="mt-2 capitalize">{current.client_stage.replace(/_/g, " ")}</Badge>
                )}
              </CardContent>
            </Card>

            {!callOpen ? (
              <Button
                className="w-full bg-emerald-500 hover:bg-emerald-600"
                onClick={() => { setCallOpen(true); setStartedAt(Date.now()); }}
                disabled={!current.client_phone}
              >
                <Phone className="h-4 w-4 mr-2" /> Call Now
              </Button>
            ) : (
              <div>
                <div className="text-center text-sm text-muted-foreground mb-2">Pick an outcome:</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <OutcomeBtn label="Connected" onClick={() => record.mutate("connected")} />
                  <OutcomeBtn label="No Answer" onClick={() => record.mutate("no_answer")} />
                  <OutcomeBtn label="Voicemail" onClick={() => record.mutate("voicemail")} />
                  <OutcomeBtn label="Callback" onClick={() => record.mutate("callback")} />
                  <OutcomeBtn label="Remove" onClick={() => record.mutate("removed")} />
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>End Session</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OutcomeBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="h-auto py-2">
      {label}
    </Button>
  );
}

/* ===================================================================== */
/* Settings                                                               */
/* ===================================================================== */

function PhoneSettingsSheet({
  open, onOpenChange, settings,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  settings: { phone_number: string | null; forwarding_number: string | null; forwarding_enabled: boolean; sms_registration_status: string } | null;
}) {
  const updateFn = useServerFn(updatePhoneSettings);
  const queryClient = useQueryClient();
  const [forward, setForward] = useState(false);
  const [number, setNumber] = useState("");

  useEffect(() => {
    if (settings) {
      setForward(settings.forwarding_enabled);
      setNumber(settings.forwarding_number ?? "");
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => updateFn({
      data: { forwarding_enabled: forward, forwarding_number: number || null },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["phone", "overview"] });
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Phone Settings</SheetTitle>
          <SheetDescription>Manage your forwarding and number.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">Call forwarding</div>
                <div className="text-xs text-muted-foreground">Forward calls when you're signed out.</div>
              </div>
              <Switch checked={forward} onCheckedChange={setForward} />
            </div>
            <div>
              <Label className="text-xs">Forwarding number</Label>
              <Input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="(555) 123-4567"
                disabled={!forward}
                className="mt-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              When you're signed in with the app open, calls ring in your browser. Otherwise they forward to this number.
            </p>
          </section>

          <section className="space-y-2 border-t pt-4">
            <div className="font-medium text-sm">Your business number</div>
            <div className="text-lg">{settings?.phone_number ? fmtPhone(settings.phone_number) : <span className="text-muted-foreground">Not provisioned</span>}</div>
            <Button variant="outline" size="sm" disabled>Change number</Button>
            <p className="text-xs text-muted-foreground">Contact your admin to set up a dedicated phone number for your account.</p>
          </section>

          <section className="space-y-2 border-t pt-4">
            <div className="font-medium text-sm">SMS Registration</div>
            <div className="flex items-center gap-2 text-sm">
              <span className="capitalize">{settings?.sms_registration_status ?? "pending"}</span>
              {settings?.sms_registration_status === "active" ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Loader2 className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              SMS registration with carriers is handled automatically when your number is provisioned.
            </p>
          </section>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ===================================================================== */
/* Helpers                                                                */
/* ===================================================================== */

function Loading() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="text-center py-10 px-4">
      <Icon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
      <div className="font-medium">{title}</div>
      {subtitle && <div className="text-sm text-muted-foreground mt-1">{subtitle}</div>}
    </div>
  );
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
