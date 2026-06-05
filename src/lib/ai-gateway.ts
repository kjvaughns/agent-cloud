// Shared helper for calling the Lovable AI Gateway from server functions.
// Server-only — do not import from client code.

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export type AiCallOpts = {
  messages: ChatMsg[];
  model?: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export async function callAi(opts: AiCallOpts): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI service not configured");
  const body: Record<string, unknown> = {
    model: opts.model ?? "google/gemini-3-flash-preview",
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 1024,
  };
  if (opts.json) body.response_format = { type: "json_object" };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("AI gateway error", res.status, text);
    if (res.status === 429) throw new Error("AI rate limit reached — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please contact your admin.");
    throw new Error("AI service unavailable. Please try again.");
  }
  const j = await res.json();
  return (j?.choices?.[0]?.message?.content ?? "").toString();
}

export async function callAiJson<T = unknown>(opts: AiCallOpts): Promise<T> {
  const raw = await callAi({ ...opts, json: true });
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Fallback: try to extract a JSON object
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("AI returned malformed JSON");
  }
}
