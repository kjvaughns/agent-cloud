import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, PlayCircle, Send, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@/hooks/use-server-fn";
import { getSetupState } from "@/lib/self-serve.functions";
import { getAllisonChat, sendAllisonChat } from "@/lib/allison/chat.functions";
import { helpVideoKey, shouldRedirectToSetup } from "@/lib/onboarding/setup";
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

/** "Watch how it works" for the current page. */
export function HelpVideoButton() {
  const { pathname } = useLocation();
  const key = helpVideoKey(pathname);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["help-video", key],
    enabled: !!key,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const [{ data: video }, { data: dismissed }] = await Promise.all([
        supabase.from("help_videos").select("title, video_url").eq("page_key", key!).maybeSingle(),
        supabase.from("help_video_dismissals").select("page_key").eq("page_key", key!).eq("user_id", auth.user?.id ?? "").maybeSingle(),
      ]);
      return { video, dismissed: !!dismissed, userId: auth.user?.id };
    },
  });
  if (!key || !data?.video || data.dismissed) return null;

  async function dismiss() {
    if (!data?.userId) return;
    await supabase.from("help_video_dismissals").insert({ user_id: data.userId, page_key: key! });
    qc.invalidateQueries({ queryKey: ["help-video", key] });
  }

  return (
    <>
      <div className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card px-1 py-1 shadow-lg sm:bottom-5">
        <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setOpen(true)}>
          <PlayCircle className="mr-1.5 h-4 w-4 text-primary" /> Watch how it works
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" aria-label="Hide video tip" onClick={dismiss}><X className="h-3.5 w-3.5" /></Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{data.video.title}</DialogTitle></DialogHeader>
          {data.video.video_url ? (
            <video src={data.video.video_url} controls autoPlay className="w-full rounded-md" />
          ) : (
            <div className="grid aspect-video place-items-center rounded-md bg-muted text-sm text-muted-foreground">Video coming soon — ask Allison in the meantime.</div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Allison chat bubble on every signed-in page. */
export function AllisonBubble() {
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
        <Button onClick={() => setOpen(true)} variant="ink" className="fixed bottom-5 left-5 z-40 h-12 rounded-full px-4 shadow-lg" aria-label="Chat with Allison">
          <MessageCircle className="mr-1.5 h-5 w-5" /> Help
        </Button>
      )}
      {open && (
        <div className="fixed bottom-5 left-5 z-50 flex h-[32rem] max-h-[80vh] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-2xl" role="dialog" aria-label="Allison support chat">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div><div className="text-sm font-semibold">Allison</div><div className="text-xs text-muted-foreground">Agent Cloud support</div></div>
            <Button size="icon" variant="ghost" aria-label="Close chat" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {messages.length === 0 && <p className="text-muted-foreground">Hi! I'm Allison. Ask me anything about setting up or using Agent Cloud.</p>}
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
