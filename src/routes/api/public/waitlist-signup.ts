import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import * as React from "react";
import { render } from "@react-email/render";

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

const SITE_NAME = "Agent Cloud";
const SENDER_DOMAIN = "notify.useagentcloud.com";
const FROM_DOMAIN = "notify.useagentcloud.com";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function enqueueWaitlistEmail(
  supabaseAdmin: any,
  recipient: string,
  first_name: string,
) {
  const normalized = recipient.toLowerCase();

  // Suppression check
  const { data: suppressed } = await supabaseAdmin
    .from("suppressed_emails")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();
  if (suppressed) return { skipped: "suppressed" as const };

  // Unsubscribe token (get or create)
  let unsubscribeToken: string;
  const { data: existing } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", normalized)
    .maybeSingle();

  if (existing && !existing.used_at) {
    unsubscribeToken = existing.token;
  } else if (!existing) {
    unsubscribeToken = generateToken();
    await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .upsert({ token: unsubscribeToken, email: normalized }, { onConflict: "email", ignoreDuplicates: true });
    const { data: stored } = await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", normalized)
      .maybeSingle();
    unsubscribeToken = stored?.token ?? unsubscribeToken;
  } else {
    return { skipped: "suppressed" as const };
  }

  const { TEMPLATES } = await import("@/lib/email-templates/registry");
  const template = TEMPLATES["waitlist-confirmation"];
  if (!template) return { skipped: "no_template" as const };

  const element = React.createElement(template.component, { first_name });
  const html = await render(element);
  const text = await render(element, { plainText: true });
  const subject =
    typeof template.subject === "function" ? template.subject({ first_name }) : template.subject;

  const messageId = crypto.randomUUID();
  const idempotencyKey = `waitlist-confirm-${normalized}`;

  await supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: "waitlist-confirmation",
    recipient_email: recipient,
    status: "pending",
  });

  const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: recipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: "transactional",
      label: "waitlist-confirmation",
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  });

  if (enqueueError) {
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "waitlist-confirmation",
      recipient_email: recipient,
      status: "failed",
      error_message: enqueueError.message,
    });
    return { skipped: "enqueue_failed" as const };
  }

  return { ok: true };
}

export const Route = createFileRoute("/api/public/waitlist-signup")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
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

        // Only email on first join. Do it in the background so the response is fast.
        if (!existing) {
          try {
            await enqueueWaitlistEmail(supabaseAdmin, d.email, d.first_name);
          } catch (e) {
            console.error("waitlist email enqueue failed", e);
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
