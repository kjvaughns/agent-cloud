// Server-only: import dynamically inside server handlers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callAiJson } from "@/lib/ai-gateway";
import { agentCloudFacts } from "./knowledge";
import { ESCALATION_REPLY, SIGNATURE, SUPPORT_INBOX, forcedEscalation, replyDelayMs } from "./rules";

const GATEWAY = "https://connector-gateway.lovable.dev/udc_agentmail";
const db = supabaseAdmin as any;

async function agentmail(path: string, body: unknown) {
  const lov = process.env["LOVABLE_API_KEY"];
  const key = process.env["UDC_AGENTMAIL_API_KEY"];
  if (!lov || !key) throw new Error("AgentMail is not connected");
  const res = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`AgentMail request failed [${res.status}]: ${t}`);
    throw new Error(`AgentMail request failed [${res.status}]: ${t}`);
  }
  return (await res.json()) as { message_id?: string; thread_id?: string };
}

const inbox = encodeURIComponent(SUPPORT_INBOX);
export const sendNewEmail = (to: string, subject: string, text: string) =>
  agentmail(`/v0/inboxes/${inbox}/messages/send`, { to: [to], subject, text });
const replyEmail = (messageId: string, text: string) =>
  agentmail(`/v0/inboxes/${inbox}/messages/${encodeURIComponent(messageId)}/reply`, { text });

export const nextReplyAt = () => new Date(Date.now() + replyDelayMs()).toISOString();

type Thread = {
  id: string; demo_request_id: string | null; email: string; name: string | null; subject: string;
  thread_id: string | null; last_message_id: string | null; escalated: boolean;
};

/** Open an Allison conversation for a new demo request; first email goes out after the human-feeling delay. */
export async function startDemoThread(lead: { id: string; first_name: string; last_name: string; email: string; [k: string]: unknown }) {
  const { data: t } = await db.from("allison_threads").insert({
    demo_request_id: lead.id, email: lead.email.toLowerCase(), name: `${lead.first_name} ${lead.last_name}`.trim(),
    subject: "Your Agent Cloud demo", reply_after: nextReplyAt(),
  }).select("id").single();
  const details = ["agency_name", "agent_count", "current_tools", "primary_challenge", "preferred_time", "phone"]
    .filter((k) => lead[k]).map((k) => `${k.replace(/_/g, " ")}: ${lead[k]}`).join("\n");
  if (t) await db.from("allison_messages").insert({ thread_ref: t.id, sender: "lead", body: `(Demo request form)\n${details || "No extra details given."}` });
}

async function deliver(t: Thread, text: string) {
  if (t.last_message_id) {
    const r = await replyEmail(t.last_message_id, text);
    return { message_id: r.message_id ?? null, thread_id: r.thread_id ?? t.thread_id };
  }
  const r = await sendNewEmail(t.email, t.subject, text);
  return { message_id: r.message_id ?? null, thread_id: r.thread_id ?? null };
}

type Decision = { reply: string; escalate: boolean; reason: string };

async function askAllison(t: Thread, thread: { sender: string; body: string }[]): Promise<Decision> {
  const convo = thread.map((m) => `${m.sender === "lead" ? "Prospect" : m.sender === "allison" ? "Allison" : "Agent Cloud team"}: ${m.body}`).join("\n\n");
  return callAiJson<Decision>({
    model: "openai/gpt-6-astra",
    temperature: 0.4,
    maxTokens: 1200,
    messages: [
      {
        role: "system",
        content: `You are Allison, the official assistant at Agent Cloud. You handle demo requests by email: welcome people, answer questions about Agent Cloud, collect what the team needs for the demo, and help new customers get set up. Write like a real person: short, warm, plain English, no markdown, ask at most 2–3 questions at a time, don't re-ask what you already know. Greet by first name. Sign off exactly as:\n${SIGNATURE}\n\nOnly use the facts below. Never promise discounts, refunds, features that aren't listed, or a booked meeting time; never claim to have changed an account. If you can't confidently answer, or it's billing, account access, legal, a complaint, or a request for a human, set escalate=true. Reply with JSON {"reply": string, "escalate": boolean, "reason": string}.\n\nAGENT CLOUD FACTS:${agentCloudFacts()}`,
      },
      { role: "user", content: `Prospect: ${t.name ?? "unknown"} <${t.email}>\nSubject: ${t.subject}\n\nConversation so far:\n${convo}\n\nWrite Allison's next email.` },
    ],
  });
}

export async function processDueThreads(): Promise<{ processed: number; paused?: string }> {
  const now = new Date().toISOString();
  const { data: lock } = await db.from("allison_job_lock")
    .update({ locked_until: new Date(Date.now() + 120_000).toISOString() })
    .eq("name", "replies").lt("locked_until", now).select("paused_reason").maybeSingle();
  if (!lock) return { processed: 0 };
  if (lock.paused_reason) return { processed: 0, paused: lock.paused_reason };

  const { data: due } = await db.from("allison_threads").select("*")
    .lte("reply_after", now).eq("escalated", false).neq("status", "closed").order("reply_after").limit(10);
  let processed = 0;
  try {
    for (const t of (due ?? []) as Thread[]) {
      await db.from("allison_threads").update({ reply_after: null }).eq("id", t.id);
      try {
        const { data: msgs } = await db.from("allison_messages").select("sender,body").eq("thread_ref", t.id).eq("internal", false).order("created_at");
        const thread = (msgs ?? []) as { sender: string; body: string }[];
        const leadText = thread.filter((m) => m.sender === "lead").map((m) => m.body).join("\n");
        const forced = forcedEscalation(leadText);
        const decision: Decision = forced ? { reply: "", escalate: true, reason: forced } : await askAllison(t, thread);
        const text = decision.escalate || !decision.reply?.trim() ? ESCALATION_REPLY(t.name) : decision.reply;
        const escalate = decision.escalate || !decision.reply?.trim();
        const sent = await deliver(t, text);
        await db.from("allison_messages").insert({ thread_ref: t.id, sender: "allison", body: text, email_message_id: sent.message_id });
        await db.from("allison_threads").update({
          status: escalate ? "escalated" : "answered", escalated: escalate,
          escalation_reason: escalate ? decision.reason || "Needs a person" : null,
          thread_id: sent.thread_id, last_message_id: sent.message_id ?? t.last_message_id, updated_at: new Date().toISOString(),
        }).eq("id", t.id);
        if (escalate) await notifyTeam(t, decision.reason || "Needs a person", thread);
        processed++;
      } catch (err) {
        await db.from("allison_threads").update({ reply_after: new Date(Date.now() + 5 * 60_000).toISOString() }).eq("id", t.id);
        throw err;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/credits exhausted/i.test(msg)) await db.from("allison_job_lock").update({ paused_reason: msg }).eq("name", "replies");
    console.error("allison job error", msg);
  } finally {
    await db.from("allison_job_lock").update({ locked_until: new Date().toISOString() }).eq("name", "replies");
  }
  return { processed };
}

async function notifyTeam(t: Thread, reason: string, thread: { sender: string; body: string }[]) {
  const note = `Allison handed off a conversation.\nFrom: ${t.name ?? ""} <${t.email}>\nReason: ${reason}\n\n${thread.map((m) => `${m.sender}: ${m.body}`).join("\n\n")}\n\nReply to them directly from ${SUPPORT_INBOX}.`;
  await sendNewEmail(SUPPORT_INBOX, `[Needs you] ${t.subject} — ${t.name ?? t.email}`, note).catch((e) => console.error("handoff email failed", e));
  const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "super_admin");
  for (const a of admins ?? []) {
    await db.from("notifications").insert({ user_id: a.user_id, title: "Allison needs you", description: `${t.name ?? t.email}: ${reason}`, type: "sales" });
  }
}
