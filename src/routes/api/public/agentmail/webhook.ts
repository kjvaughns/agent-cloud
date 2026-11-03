import { createFileRoute } from "@tanstack/react-router";
import { SUPPORT_INBOX } from "@/lib/allison/rules";

function b64ToBytes(b64: string) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Svix-style signature check (AgentMail signs webhooks with Svix). */
async function verify(req: Request, body: string, secret: string) {
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sigs = req.headers.get("svix-signature");
  if (!id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", b64ToBytes(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return sigs.split(" ").some((s) => {
    const v = s.split(",")[1] ?? "";
    if (v.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < v.length; i++) diff |= v.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

type Msg = { inbox_id?: string; thread_id?: string; message_id?: string; from?: string; subject?: string; text?: string; extracted_text?: string };

function parseFrom(from: string) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1]!.trim() || null, email: m[2]!.trim().toLowerCase() } : { name: null, email: from.trim().toLowerCase() };
}

/** Inbound mail to support@useagentcloud.com → Allison conversation. */
export const Route = createFileRoute("/api/public/agentmail/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["AGENTMAIL_WEBHOOK_SECRET"];
        const body = await request.text();
        if (!secret || !(await verify(request, body, secret))) return new Response("Invalid signature", { status: 401 });

        const evt = JSON.parse(body) as { event_type?: string; message?: Msg };
        const m = evt.message;
        if (evt.event_type !== "message.received" || !m?.from || !m.message_id) return new Response("ignored");
        if (m.inbox_id && m.inbox_id !== SUPPORT_INBOX) return new Response("ignored");
        const { name, email } = parseFrom(m.from);
        if (email === SUPPORT_INBOX) return new Response("ignored");

        const text = (m.extracted_text || m.text || "").trim().slice(0, 8000) || "(empty email)";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { nextReplyAt } = await import("@/lib/allison/allison.server");
        const db = supabaseAdmin as any;

        const { data: dupe } = await db.from("allison_messages").select("id").eq("email_message_id", m.message_id).maybeSingle();
        if (dupe) return new Response("duplicate");

        let t = m.thread_id ? (await db.from("allison_threads").select("id,escalated").eq("thread_id", m.thread_id).maybeSingle()).data : null;
        if (!t) {
          const { data: created, error } = await db.from("allison_threads").insert({
            email, name, subject: (m.subject || "Agent Cloud").slice(0, 150),
            thread_id: m.thread_id ?? null, last_message_id: m.message_id, reply_after: nextReplyAt(),
          }).select("id,escalated").single();
          if (error) return new Response("error", { status: 500 });
          t = created;
        } else {
          await db.from("allison_threads").update({
            last_message_id: m.message_id, status: t.escalated ? "escalated" : "open",
            reply_after: t.escalated ? null : nextReplyAt(), updated_at: new Date().toISOString(),
          }).eq("id", t.id);
        }
        await db.from("allison_messages").insert({ thread_ref: t.id, sender: "lead", body: text, email_message_id: m.message_id });
        return new Response("ok");
      },
    },
  },
});
