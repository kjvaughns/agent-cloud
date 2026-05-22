import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MOCK_CLIENTS } from "@/lib/mock-data";
import { fmtCurrency, fmtPhone } from "@/lib/format";
import { Phone, PhoneCall, MessageSquare, Wallet, Settings, List, Plus, Send, ArrowUpRight, ArrowDownLeft, Delete } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/phone")({
  head: () => ({ meta: [
    { title: "Phone & SMS — Agent Cloud" },
    { name: "description", content: "Call, text, and manage your communication wallet." },
  ]}),
  component: PhonePage,
});

function PhonePage() {
  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Phone & SMS</h1>
        <p className="text-sm text-muted-foreground">Make calls, send texts, manage dial lists and wallet.</p>
      </div>
      <Tabs defaultValue="phone">
        <TabsList>
          <TabsTrigger value="phone"><Phone className="h-4 w-4" /> Phone</TabsTrigger>
          <TabsTrigger value="sms"><MessageSquare className="h-4 w-4" /> SMS</TabsTrigger>
          <TabsTrigger value="dial"><List className="h-4 w-4" /> Dial Lists</TabsTrigger>
          <TabsTrigger value="wallet"><Wallet className="h-4 w-4" /> Wallet</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="h-4 w-4" /> Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="phone" className="mt-4"><Keypad /></TabsContent>
        <TabsContent value="sms" className="mt-4"><SmsView /></TabsContent>
        <TabsContent value="dial" className="mt-4"><DialLists /></TabsContent>
        <TabsContent value="wallet" className="mt-4"><WalletView /></TabsContent>
        <TabsContent value="settings" className="mt-4"><PhoneSettings /></TabsContent>
      </Tabs>
    </div>
  );
}

function Keypad() {
  const [num, setNum] = useState("");
  const keys = ["1","2","3","4","5","6","7","8","9","*","0","#"];
  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-6">
      <Card><CardContent className="p-6">
        <Input value={num} onChange={(e) => setNum(e.target.value)} placeholder="+1 (555) 000-0000" className="text-center text-2xl h-14 mb-4 font-mono" />
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <Button key={k} variant="outline" className="h-14 text-xl font-semibold" onClick={() => setNum((n) => n + k)}>{k}</Button>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <Button className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white"><PhoneCall className="h-5 w-5" /> Call</Button>
          <Button variant="outline" className="h-12" onClick={() => setNum((n) => n.slice(0, -1))}><Delete className="h-5 w-5" /></Button>
        </div>
      </CardContent></Card>
      <Card><CardContent className="p-6">
        <h3 className="font-semibold mb-3">Recent calls</h3>
        <div className="space-y-2">
          {MOCK_CLIENTS.slice(0, 8).map((c, i) => (
            <div key={c.id} className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-lg">
              <div className={cn("h-8 w-8 rounded-full grid place-items-center", i % 3 === 0 ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500")}>
                {i % 3 === 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{c.first_name} {c.last_name}</div>
                <div className="text-xs text-muted-foreground">{fmtPhone(c.phone)}</div>
              </div>
              <div className="text-xs text-muted-foreground">{(i + 1) * 3}m</div>
            </div>
          ))}
        </div>
      </CardContent></Card>
    </div>
  );
}

function SmsView() {
  const [active, setActive] = useState(MOCK_CLIENTS[0]);
  const [draft, setDraft] = useState("");
  const threads = MOCK_CLIENTS.slice(0, 12);
  const messages = [
    { from: "them", body: "Hi, is this the agent who called me?", time: "10:24 AM" },
    { from: "me", body: "Yes! Thanks for getting back to me. Want to set up a quick 15-min call?", time: "10:26 AM" },
    { from: "them", body: "Sure, Friday works.", time: "10:31 AM" },
  ];
  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-0 border rounded-xl overflow-hidden h-[calc(100vh-12rem)]">
      <div className="border-r overflow-y-auto bg-card">
        {threads.map((t) => (
          <button key={t.id} onClick={() => setActive(t)} className={cn("w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 border-b", active.id === t.id && "bg-muted")}>
            <Avatar className="h-9 w-9"><AvatarFallback className="text-xs bg-primary/10 text-primary">{t.first_name[0]}{t.last_name[0]}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{t.first_name} {t.last_name}</div>
              <div className="text-xs text-muted-foreground truncate">Sure, Friday works.</div>
            </div>
          </button>
        ))}
      </div>
      <div className="flex flex-col bg-background">
        <div className="border-b p-3 flex items-center gap-3">
          <Avatar className="h-9 w-9"><AvatarFallback className="text-xs bg-primary/10 text-primary">{active.first_name[0]}{active.last_name[0]}</AvatarFallback></Avatar>
          <div>
            <div className="font-medium text-sm">{active.first_name} {active.last_name}</div>
            <div className="text-xs text-muted-foreground">{fmtPhone(active.phone)}</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.from === "me" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-md rounded-2xl px-3 py-2 text-sm", m.from === "me" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {m.body}
                <div className={cn("text-[10px] mt-1 opacity-70")}>{m.time}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t p-3 flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message..." />
          <Button onClick={() => setDraft("")}><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}

function DialLists() {
  const lists = [
    { name: "New leads — this week", count: 42, last: "2 hours ago" },
    { name: "Follow-ups overdue", count: 18, last: "Yesterday" },
    { name: "Renewal reminders", count: 67, last: "3 days ago" },
    { name: "Lost — 90 day reactivation", count: 24, last: "Last week" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button><Plus className="h-4 w-4" /> New Dial List</Button></div>
      <div className="grid md:grid-cols-2 gap-3">
        {lists.map((l) => (
          <Card key={l.name}><CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{l.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{l.count} contacts · last used {l.last}</div>
            </div>
            <Button size="sm" variant="outline">Start dialing</Button>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}

function WalletView() {
  const txns = [
    { type: "Top-up", amount: 50, date: "May 20", method: "Visa ****4242" },
    { type: "SMS", amount: -0.04, date: "May 22", method: "Outbound to (214) 555-0199" },
    { type: "Voice", amount: -0.18, date: "May 22", method: "Outbound 3:24" },
    { type: "Top-up", amount: 25, date: "May 14", method: "Visa ****4242" },
    { type: "Voice", amount: -0.42, date: "May 13", method: "Outbound 8:01" },
  ];
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1"><CardContent className="p-6">
        <div className="text-sm text-muted-foreground">Wallet balance</div>
        <div className="text-4xl font-bold mt-2">{fmtCurrency(74.21)}</div>
        <div className="text-xs text-muted-foreground mt-1">Auto-reload at $10.00</div>
        <Button className="w-full mt-4">Top up $25</Button>
        <Button variant="outline" className="w-full mt-2">Manage payment method</Button>
      </CardContent></Card>
      <Card className="lg:col-span-2"><CardContent className="p-6">
        <h3 className="font-semibold mb-3">Transactions</h3>
        <div className="divide-y">
          {txns.map((t, i) => (
            <div key={i} className="py-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{t.type}</div>
                <div className="text-xs text-muted-foreground">{t.method} · {t.date}</div>
              </div>
              <div className={cn("font-mono font-semibold", t.amount > 0 ? "text-emerald-600" : "text-foreground")}>
                {t.amount > 0 ? "+" : ""}{fmtCurrency(t.amount, { maximumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>
      </CardContent></Card>
    </div>
  );
}

function PhoneSettings() {
  return (
    <Card><CardContent className="p-6 space-y-4 max-w-xl">
      <div>
        <label className="text-sm font-medium">Caller ID number</label>
        <Input defaultValue="+1 (214) 555-0144" className="mt-1" />
      </div>
      <div>
        <label className="text-sm font-medium">Voicemail greeting</label>
        <Textarea defaultValue="Hi, you've reached your insurance advisor. Leave a message and I'll call you right back." className="mt-1" />
      </div>
      <Button>Save settings</Button>
    </CardContent></Card>
  );
}
