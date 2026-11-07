import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { guardPublicEndpoint } from "@/lib/rate-limit";

const Schema = z.object({
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(30).optional().nullable(),
  persona: z.enum(["solo", "agency_owner", "recruit", "other"]).optional(),
  source: z.string().trim().max(40).optional(),
  utm: z.record(z.string(), z.string()).optional(),
  hp: z.string().max(0).optional(),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function sendWaitlistEmail(
  supabaseAdmin: any,
  recipient: string,
  first_name: string,
) {
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const key = `waitlist-confirm-${recipient.toLowerCase()}`;
  const log = async (status: "sent" | "suppressed" | "failed", reason?: string) => {
    const { error } = await supabaseAdmin.from("email_send_log").insert({
      message_id: key, template_name: "waitlist-confirmation",
      recipient_email: recipient, status, error_message: reason ?? null,
    });
    if (error && error.code !== "23505") console.error("waitlist email log failed", { code: error.code, message: error.message });
  };
  try {
    const result = await sendTemplateEmail("waitlist-confirmation", recipient, {
      templateData: { first_name }, idempotencyKey: key,
    });
    await log(result.sent ? "sent" : "suppressed", result.sent ? undefined : result.reason);
    return result;
  } catch (error) {
    await log("failed", error instanceof Error ? error.message.slice(0, 1000) : "Email send failed");
    return { sent: false, reason: "send_failed" };
  }
}

export const Route = createFileRoute("/api/public/waitlist-signup")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const limited = await guardPublicEndpoint(request, "waitlist-signup", { perIp: 5, global: 300, headers: { "Access-Control-Allow-Origin": "*" } });
        if (limited) return limited;
        const parsed = Schema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "invalid" }), {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        const d = parsed.data;
        if (d.hp) {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const email = d.email.toLowerCase();

        // Detect first-time vs. repeat signup so we only email on the first join.
        const { data: existing } = await supabaseAdmin
          .from("waitlist_signups")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        const { error } = await supabaseAdmin
          .from("waitlist_signups")
          .upsert(
            {
              first_name: d.first_name,
              last_name: d.last_name,
              email,
              phone: d.phone || null,
              persona: d.persona || null,
              source: d.source || "landing",
              utm: d.utm || null,
            },
            { onConflict: "email" }
          );

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }

        // Only send the expected confirmation on first join.
        if (!existing) {
          try {
            await sendWaitlistEmail(supabaseAdmin, d.email, d.first_name);
          } catch (e) {
            console.error("waitlist email send failed", e);
          }
        }

        const { data: countRow } = await supabaseAdmin.rpc("waitlist_count");

        return new Response(
          JSON.stringify({ ok: true, count: Number(countRow ?? 0) }),
          { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
        );
      },
    },
  },
});
