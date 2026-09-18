import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Ask AI where a carrier's public pages are.
 *
 * Setting a carrier up means hunting down five links on a carrier website that
 * was last redesigned in 2011. This does the hunting and hands back
 * suggestions — nothing is saved, and every field comes back to the owner as a
 * draft they can accept, edit or clear.
 *
 * A field it cannot establish comes back null rather than invented: a wrong
 * agent portal link sends an agent somewhere they cannot sign in, which is
 * worse than an empty field somebody fills in from the carrier email.
 */
const Suggestion = z.object({
  website: z.string().nullable().optional(),
  agent_portal_url: z.string().nullable().optional(),
  training_url: z.string().nullable().optional(),
  contracting_email: z.string().nullable().optional(),
  support_email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  business_hours: z.string().nullable().optional(),
  pay_frequency: z.string().nullable().optional(),
  contracting_speed_days: z.number().nullable().optional(),
  product_types: z.array(z.string()).nullable().optional(),
});

export type CarrierSuggestion = z.infer<typeof Suggestion>;

/** A url only counts if it is one. The model occasionally answers in prose. */
function cleanUrl(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function cleanEmail(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

function cleanText(v: unknown, max: number): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || /^(unknown|n\/?a|none|not found)$/i.test(s)) return null;
  return s.slice(0, max);
}

export const lookupCarrierDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().trim().min(2).max(120),
      website: z.string().trim().max(300).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    // Imported inside the handler: this module is imported by the Carriers tab,
    // so the gateway helper must not be reachable from the client bundle.
    const { callAiJson } = await import("@/lib/ai-gateway");

    // The token ceiling matters more than it looks: this model thinks before it
    // answers, and at 800 the answer was being cut off mid-object — so the JSON
    // never closed and every lookup came back as a JSON error. Room to finish,
    // and "no prose, no explanation" so the budget goes on the answer.
    const raw = await callAiJson<Record<string, unknown>>({
      model: "google/gemini-3.8-flash",
      temperature: 0,
      maxTokens: 4000,
      messages: [
        {
          role: "system",
          content: [
            "You help an insurance agency fill in a carrier's public contact details.",
            "Answer only with facts you are confident about for the named US life insurance carrier.",
            "Use null for anything you are not sure of. Never guess a URL, email, or phone number.",
            "Reply with one JSON object and nothing else — no prose, no explanation, no markdown.",
            "Keep every value short. Use exactly these keys:",
            "website, agent_portal_url, training_url, contracting_email, support_email,",
            "phone, business_hours, pay_frequency, contracting_speed_days, product_types.",
            "pay_frequency is a short phrase such as 'Weekly', 'Monthly', 'Twice a month', or null.",
            "contracting_speed_days is a number of days or null.",
            "product_types is an array of product names (e.g. Final Expense, Term Life) or null.",
            "business_hours is a short string such as 'Mon-Fri 8am-6pm ET'.",
          ].join(" "),
        },
        {
          role: "user",
          content: data.website
            ? `Carrier: ${data.name}. Their website appears to be ${data.website}.`
            : `Carrier: ${data.name}.`,
        },
      ],
    });

    const speed = Number(raw.contracting_speed_days);

    const suggestion: CarrierSuggestion = {
      website: cleanUrl(raw.website),
      agent_portal_url: cleanUrl(raw.agent_portal_url),
      training_url: cleanUrl(raw.training_url),
      contracting_email: cleanEmail(raw.contracting_email),
      support_email: cleanEmail(raw.support_email),
      phone: cleanText(raw.phone, 40),
      business_hours: cleanText(raw.business_hours, 120),
      pay_frequency: cleanText(raw.pay_frequency, 60),
      contracting_speed_days:
        Number.isFinite(speed) && speed >= 0 && speed <= 365 ? Math.round(speed) : null,
      product_types: Array.isArray(raw.product_types)
        ? (raw.product_types as unknown[])
            .map((p) => cleanText(p, 60))
            .filter((p): p is string => Boolean(p))
            .slice(0, 20)
        : null,
    };

    return { suggestion };
  });
