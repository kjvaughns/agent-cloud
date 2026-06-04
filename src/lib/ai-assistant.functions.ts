import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const msgSchema = z.array(z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
}));

export const askAiAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ messages: msgSchema }).parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI service not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are an AI assistant for life insurance agents. Help with policy questions, client management, objection handling, sales coaching, scripts, and prospecting. Be concise and practical.",
          },
          ...data.messages,
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
    return { reply };
  });
