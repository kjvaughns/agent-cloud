import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiJson } from "@/lib/ai-gateway";
import {
  CARRIER_REPORT_SYSTEM,
  validateCarrierReport,
  type CarrierReportRaw,
} from "@/lib/import-carrier-ai";

/**
 * Read a carrier report the deterministic path could not.
 *
 * Statements, debt reports and certificate listings arrive as PDFs printed from
 * a carrier's admin system, and their text layer has the columns stripped out.
 * The pages therefore go up as images, where the layout is still there to read.
 * The result is proposals for a human to approve — this never writes a record.
 */
export const extractCarrierReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        images: z.array(z.string().min(32).max(12_000_000)).max(12).nullable().optional(),
        text: z.string().max(200_000).nullable().optional(),
        file_name: z.string().max(255),
        /** What routing already believes it is, when it believes anything. */
        expected_kind: z.string().max(60).nullable().optional(),
      })
      .refine((v) => (v.images?.length ?? 0) > 0 || Boolean(v.text), {
        message: "Nothing readable in that file",
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const pages = data.images ?? [];

    const out = await callAiJson<CarrierReportRaw>({
      // A statement's detail can run to a couple of hundred lines, and a JSON
      // reply truncated mid-array either fails to parse or — worse — parses as a
      // shorter statement that looks complete.
      maxTokens: 12_000,
      messages: [
        { role: "system", content: CARRIER_REPORT_SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Read this carrier report: ${data.file_name}.`,
                pages.length > 1
                  ? `It has ${pages.length} pages; rows continue across them, so return every row you find.`
                  : "",
                data.expected_kind && data.expected_kind !== "unknown"
                  ? `The columns suggest it is a ${data.expected_kind.replace(/_/g, " ")}, but decide for yourself.`
                  : "",
              ]
                .filter(Boolean)
                .join(" "),
            },
            ...(data.text ? [{ type: "text" as const, text: data.text.slice(0, 150_000) }] : []),
            ...pages.map((url) => ({ type: "image_url" as const, image_url: { url } })),
          ],
        },
      ],
    });

    return validateCarrierReport(out);
  });
