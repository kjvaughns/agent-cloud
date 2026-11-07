import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@/hooks/use-server-fn";
import { getSetupState } from "@/lib/self-serve.functions";
import { getAllisonChat, sendAllisonChat } from "@/lib/allison/chat.functions";
import { shouldRedirectToSetup } from "@/lib/onboarding/setup";
import { useAccessState } from "@/components/read-only-gate";

/** Sends owners with unfinished setup to the wizard. */
export function SetupRedirect() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const getState = useServerFn(getSetupState);
  const { data } = useQuery({ queryKey: ["setup-state"], queryFn: () => getState(), staleTime: 60_000 });
  useEffect(() => {
    if (data && shouldRedirectToSetup(data.needsSetup, pathname)) navigate({ to: "/setup" });
  }, [data, pathname, navigate]);
  return null;
}

/** Owners who built a workspace but never paid go back to the launch/checkout screen. */
export function PaywallRedirect() {
  const { data } = useAccessState();
  useEffect(() => {
    const d = data as any;
    if (d && d.mode === "read_only" && d.reason === "no_plan" && d.isOwner && d.neverPaid) window.location.assign("/start");
  }, [data]);
  return null;
}

/** Support chat bubble on every signed-in page. */
export function SupportBubble() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const qc = useQueryClient();
  const getChat = useServerFn(getAllisonChat);
  const send = useServerFn(sendAllisonChat);
  const { data: messages = [] } = useQuery({ queryKey: ["allison-chat"], queryFn: () => getChat(), enabled: open });
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages, open]);

  async function submit() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    qc.setQueryData(["allison-chat"], (m: any[] = []) => [...m, { id: `tmp-${Date.now()}`, sender: "user", body }]);
    try {
      const r = await send({ data: { body, page: pathname } });
      qc.setQueryData(["allison-chat"], (m: any[] = []) => [...m, { id: `tmp-a-${Date.now()}`, sender: "allison", body: r.reply }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {!open && (
        <Button onClick={() => setOpen(true)} variant="ink" className="fixed bottom-5 left-5 z-40 h-12 rounded-full px-4 shadow-lg" aria-label="Chat with support">
          <MessageCircle className="mr-1.5 h-5 w-5" /> Support
        </Button>
      )}
      {open && (
        <div className="fixed bottom-5 left-5 z-50 flex h-[32rem] max-h-[80vh] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-2xl" role="dialog" aria-label="Support chat">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div><div className="text-sm font-semibold">Agent Cloud Support</div><div className="text-xs text-muted-foreground">We typically reply in a few minutes</div></div>
            <Button size="icon" variant="ghost" aria-label="Close chat" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {messages.length === 0 && <p className="text-muted-foreground">Hi! This is the Agent Cloud support team. Ask us anything about setting up or using Agent Cloud.</p>}
            {messages.map((m: any) => (
              <div key={m.id} className={m.sender === "user" ? "ml-8 rounded-lg bg-primary px-3 py-2 text-primary-foreground" : "mr-8 whitespace-pre-wrap rounded-lg bg-muted px-3 py-2"}>{m.body}</div>
            ))}
            {sending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <div ref={end} />
          </div>
          <form className="flex gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <Textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your question…" className="min-h-0 resize-none"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
            <Button type="submit" size="icon" aria-label="Send" disabled={sending || !text.trim()}><Send className="h-4 w-4" /></Button>
          </form>
        </div>
      )}
    </>
  );
}
