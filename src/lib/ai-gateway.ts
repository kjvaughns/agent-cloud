// Shared helper for calling the Lovable AI Gateway from server functions.
// Server-only — do not import from client code.

/**
 * Content is either plain text or OpenAI-style multimodal parts. The parts
 * form is what lets us hand the model a photographed or scanned commission
 * grid — the gateway proxies the same schema.
 */
export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMsg = {
  role: "system" | "user" | "assistant";
  content: string | ChatPart[];
};

export type AiCallOpts = {
  messages: ChatMsg[];
  model?: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** A completion plus why the model stopped — `"length"` means it was cut off. */
export type AiResult = { text: string; finishReason: string | null };

export async function callAi(opts: AiCallOpts): Promise<string> {
  return (await callAiFull(opts)).text;
}

/**
 * The same call, with the stop reason kept.
 *
 * Callers that transcribe a document need this: a reply cut off at the token
 * limit still parses as JSON often enough that a half-read table was being
 * reported as a complete one. `finish_reason: "length"` is the only honest
 * signal that happened.
 */
export async function callAiFull(opts: AiCallOpts): Promise<AiResult> {
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
  const choice = j?.choices?.[0];
  return {
    text: (choice?.message?.content ?? "").toString(),
    finishReason: choice?.finish_reason ? String(choice.finish_reason) : null,
  };
}

export async function callAiJson<T = unknown>(opts: AiCallOpts): Promise<T> {
  return (await callAiJsonFull<T>(opts)).value;
}

/** JSON plus whether the reply was cut off before the model finished. */
export async function callAiJsonFull<T = unknown>(
  opts: AiCallOpts,
): Promise<{ value: T; truncated: boolean }> {
  const { text: raw, finishReason } = await callAiFull({ ...opts, json: true });
  const truncated = finishReason === "length";
  const parse = (s: string): T => JSON.parse(s) as T;
  try {
    return { value: parse(raw), truncated };
  } catch {
    // Fallback: try to extract a JSON object
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return { value: parse(m[0]), truncated };
      } catch {
        /* fall through to the error below */
      }
    }
    if (truncated) {
      throw new Error("The document was too large to read in one pass — try fewer pages at a time.");
    }
    throw new Error("AI returned malformed JSON");
  }
}
