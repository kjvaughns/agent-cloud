import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Read an uploaded compliance document so nobody has to type it in.
 *
 * Every field on these cards — the E&O carrier, the policy number, the AML
 * provider, the expiry — is already printed on the certificate the agent just
 * uploaded. Asking them to transcribe it is the reason these fields sit empty.
 *
 * The file itself never comes here: the browser has already turned it into text
 * (or page images, for a scan) with `document-extract`. We send that, ask for
 * the handful of fields the card holds, and return only what was actually
 * found. Nothing is guessed — a missing value comes back null and the field
 * stays empty rather than confidently wrong.
 */

const DOC_TYPES = [
  "pdb_report", "eo_certificate", "aml_certificate",
  "government_id", "voided_check", "background_questionnaire", "w9", "other_document",
] as const;

const Input = z.object({
  doc_type: z.enum(DOC_TYPES),
  text: z.string().max(200_000).nullable().optional(),
  images: z.array(z.string()).max(4).nullable().optional(),
});

/** What to look for, per document. Kept in prose because that is what the model reads. */
const ASK: Record<string, string> = {
  eo_certificate:
    "carrier_name (the E&O insurer), policy_number, coverage_amount (per-occurrence limit, digits only), start_date (effective date), expiration_date",
  aml_certificate:
    "provider_name (who ran the training, e.g. LIMRA), certificate_number, start_date (the completion date)",
  pdb_report:
    "start_date (the report date). Leave everything else null.",
  government_id:
    "expiration_date. Leave everything else null.",
  w9: "start_date (the date signed). Leave everything else null.",
  voided_check: "nothing — return all nulls.",
  background_questionnaire: "start_date (the date signed). Leave everything else null.",
  other_document: "start_date and expiration_date if the document clearly states them.",
};

export type ReadDocumentResult = {
  carrier_name: string | null;
  policy_number: string | null;
  coverage_amount: string | null;
  provider_name: string | null;
  certificate_number: string | null;
  start_date: string | null;
  expiration_date: string | null;
};

const EMPTY: ReadDocumentResult = {
  carrier_name: null, policy_number: null, coverage_amount: null,
  provider_name: null, certificate_number: null, start_date: null, expiration_date: null,
};

const clean = (v: unknown, max = 120): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "n/a") return null;
  return s.slice(0, max);
};

/** Dates go into `date` columns, so anything that is not ISO is dropped rather than coerced. */
const cleanDate = (v: unknown): string | null => {
  const s = clean(v, 10);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export const readProducerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<ReadDocumentResult> => {
    const hasContent = Boolean(data.text?.trim() || data.images?.length);
    if (!hasContent) return EMPTY;

    const { callAiJson } = await import("./ai-gateway");

    const wanted = ASK[data.doc_type] ?? ASK["other_document"];
    const system =
      "You read insurance compliance documents and return their key fields as JSON. " +
      "Return exactly these keys, using null for anything the document does not clearly state: " +
      "carrier_name, policy_number, coverage_amount, provider_name, certificate_number, start_date, expiration_date. " +
      "Dates must be YYYY-MM-DD. coverage_amount is digits only, no currency symbol or commas. " +
      "Never invent or infer a value — a wrong value is worse than a missing one.";

    const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
      { type: "text", text: `Document type: ${data.doc_type}. Look for: ${wanted}` },
    ];
    if (data.text?.trim()) {
      parts.push({ type: "text", text: data.text.slice(0, 60_000) });
    }
    for (const url of data.images ?? []) parts.push({ type: "image_url", image_url: { url } });

    try {
      const out = await callAiJson<Record<string, unknown>>({
        messages: [
          { role: "system", content: system },
          { role: "user", content: parts },
        ],
        maxTokens: 512,
        temperature: 0,
      });

      return {
        carrier_name: clean(out.carrier_name),
        policy_number: clean(out.policy_number, 80),
        coverage_amount: clean(String(out.coverage_amount ?? "").replace(/[^0-9.]/g, ""), 40),
        provider_name: clean(out.provider_name),
        certificate_number: clean(out.certificate_number, 80),
        start_date: cleanDate(out.start_date),
        expiration_date: cleanDate(out.expiration_date),
      };
    } catch (e) {
      // Reading is a convenience. A failure here must never look like a failed
      // upload — the document is already stored.
      console.error("[document-intake] could not read document:", (e as Error)?.message);
      return EMPTY;
    }
  });
