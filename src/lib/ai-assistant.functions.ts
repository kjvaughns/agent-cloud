import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { trackNovaUsage } from "@/lib/billing.functions";
import { buildNovaContext, novaSystemPrompt } from "@/lib/nova-context.server";

type Ctx = { supabase: any; userId: string };

/**
 * Nova's chat.
 *
 * Two things were missing and both are here now: the conversation survives
 * leaving the page, and she can see the agent's own book rather than
 * answering from general knowledge about life insurance.
 *
 * How much history goes to the model is capped. A conversation that ran all
 * afternoon should not send an afternoon of tokens on every message, and the
 * last twenty turns is more than enough to hold a thread.
 */

const HISTORY_TURNS = 20;

export type NovaMessage = { role: "user" | "assistant"; content: string; created_at?: string };

/** A thread needs a name before anybody has thought of one. */
function titleFrom(question: string): string {
  const clean = question.trim().replace(/\s+/g, " ");
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean || "New conversation";
}

export const listNovaConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data } = await supabase
      .from("nova_conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);
    return (data ?? []) as { id: string; title: string; updated_at: string }[];
  });

export const getNovaConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: messages } = await supabase
      .from("nova_messages")
      .select("role, content, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    return (messages ?? []) as NovaMessage[];
  });

export const deleteNovaConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase
      .from("nova_conversations").delete().eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const askAiAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      message: z.string().trim().min(1).max(4000),
      conversationId: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI service not configured");

    // Start a thread or continue one. Row-level security decides whether a
    // supplied id is actually theirs — somebody else's simply finds nothing.
    let conversationId = data.conversationId ?? null;
    if (conversationId) {
      const { data: existing } = await supabase
        .from("nova_conversations").select("id").eq("id", conversationId).maybeSingle();
      if (!existing) conversationId = null;
    }
    if (!conversationId) {
      const { data: created, error } = await supabase
        .from("nova_conversations")
        .insert({ agent_id: userId, title: titleFrom(data.message) })
        .select("id")
        .maybeSingle();
      if (error || !created) throw new Error(error?.message ?? "Could not start a conversation");
      conversationId = created.id;
    }

    const [{ data: prior }, novaContext] = await Promise.all([
      supabase
        .from("nova_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_TURNS),
      buildNovaContext({ supabase, userId }),
    ]);

    const history = ((prior ?? []) as NovaMessage[]).reverse();

    // The question is recorded before the model is called. If the call fails,
    // what they asked is still there when they come back — losing somebody's
    // words because a gateway had a bad minute is its own small betrayal.
    await supabase.from("nova_messages").insert({
      conversation_id: conversationId, role: "user", content: data.message,
    });

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: novaSystemPrompt(novaContext) },
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: data.message },
        ],
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("AI assistant error", res.status, text);
      if (res.status === 429) throw new Error("Rate limit reached — try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Contact your admin.");
      throw new Error("AI assistant unavailable. Please try again.");
    }

    const j = await res.json();
    const reply: string = j?.choices?.[0]?.message?.content ?? "";

    if (reply) {
      await supabase.from("nova_messages").insert({
        conversation_id: conversationId, role: "assistant", content: reply,
      });
    }

    // Nova Pro usage metering (no-op for non-Pro users)
    trackNovaUsage(userId, "ai_queries").catch(() => {});
    return { reply, conversationId };
  });
