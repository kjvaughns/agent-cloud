import * as React from "react";
import { render } from "@react-email/render";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { TEMPLATES } from "@/lib/email-templates/registry";
import type { EmailBrand } from "@/lib/email-templates/layout";
import { EXEMPT_CATEGORIES, type EmailCategory } from "@/lib/email/categories";

const supabaseAdmin = _admin as any;

const SITE_NAME = "Agent Cloud";
const SENDER_DOMAIN = "notify.useagentcloud.com";
const FROM_DOMAIN = "notify.useagentcloud.com";

export const APP_ORIGIN = process.env.APP_ORIGIN || "https://useagentcloud.com";

export interface SendEmailArgs {
  /** Registered template name (see src/lib/email-templates/registry.ts). */
  template: string;
  /** Explicit recipient. Optional when `profileId` is given. */
  to?: string | null;
  /** Recipient profile — resolves the address and drives may_notify(). */
  profileId?: string | null;
  /** Organization that owns the event; drives org-level consent + branding. */
  orgId?: string | null;
  category: EmailCategory;
  /**
   * Event-level idempotency key. MUST identify the event, not the attempt —
   * e.g. `task-assigned:<task_id>`, not a UUID minted per call.
   */
  key: string;
  data?: Record<string, any>;
}

export type SendEmailResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: string };

function redact(email?: string | null): string {
  if (!email) return "***";
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local[0]}***@${domain}`;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Nothing sends from a local dev server unless explicitly enabled, and a
 * global kill switch is always available. Preview deployments are additionally
 * protected by org-level consent, which is OFF until an owner turns it on.
 */
function environmentBlocked(): string | null {
  if (process.env.EMAILS_DISABLED === "true") return "emails_disabled";
  const liveOverride = process.env.EMAILS_LIVE === "true";
  const isDevServer = Boolean((import.meta as any)?.env?.DEV);
  if (isDevServer && !liveOverride) return "non_production_environment";
  return null;
}

async function logDecision(
  status: "suppressed" | "failed" | "pending",
  args: { key: string; template: string; recipient: string | null; reason?: string },
) {
  try {
    await supabaseAdmin.from("email_send_log").insert({
      message_id: args.key,
      send_key: args.key,
      template_name: args.template,
      recipient_email: args.recipient ?? "unknown",
      status,
      error_message: args.reason ?? null,
    });
  } catch (err) {
    console.error("[email] failed to write send log", err);
  }
}

/** Resolve white-label branding for an organization (white_label plan only). */
export async function resolveBrand(orgId?: string | null): Promise<EmailBrand | undefined> {
  if (!orgId) return undefined;
  try {
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name, logo_url, accent_color, plan_type")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) return undefined;
    if (org.plan_type !== "white_label") return undefined;
    return {
      name: org.name || SITE_NAME,
      logoUrl: org.logo_url || null,
      accentColor: org.accent_color || null,
      siteUrl: APP_ORIGIN,
    };
  } catch {
    return undefined;
  }
}

/**
 * The single way Agent Cloud sends email.
 *
 * Gate order: environment → idempotency → recipient → org consent →
 * recipient consent → suppression → enqueue. Never throws: a failed email must
 * not break the operation that triggered it, and the in-app notification still
 * stands on its own. Every refusal is logged with its reason.
 */
export async function sendTransactionalEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const { template: templateName, category, key } = args;
  const exempt = EXEMPT_CATEGORIES.includes(category);

  try {
    const blocked = environmentBlocked();
    if (blocked) {
      console.log("[email] blocked by environment", { templateName, reason: blocked });
      return { sent: false, reason: blocked };
    }

    const template = TEMPLATES[templateName];
    if (!template) {
      console.error("[email] template not registered", { templateName });
      return { sent: false, reason: "template_not_registered" };
    }

    // --- idempotency: one email per event, regardless of retries/workers ---
    const { data: existing } = await supabaseAdmin
      .from("email_send_log")
      .select("id, status")
      .eq("send_key", key)
      .neq("status", "failed")
      .maybeSingle();
    if (existing) {
      return { sent: false, reason: "duplicate_event" };
    }

    // --- recipient ---
    let recipient = args.to ?? null;
    if (!recipient && args.profileId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", args.profileId)
        .maybeSingle();
      recipient = profile?.email ?? null;
    }
    recipient = template.to || recipient;
    if (!recipient) {
      console.warn("[email] no recipient resolved", { templateName, key });
      return { sent: false, reason: "no_recipient" };
    }
    const normalized = recipient.toLowerCase();

    // Org consent applies even when the caller didn't know the org — resolve it
    // from the recipient's membership so no call site can skip the gate.
    let orgId = args.orgId ?? null;
    if (!exempt && !orgId && args.profileId) {
      const { data: membership } = await supabaseAdmin
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", args.profileId)
        .limit(1)
        .maybeSingle();
      orgId = membership?.organization_id ?? null;
    }

    // --- consent layer 1: the organization opts in ---
    if (!exempt && orgId) {

      const { data: settings } = await supabaseAdmin
        .from("organization_settings")
        .select("emails_enabled, email_categories")
        .eq("organization_id", orgId)
        .maybeSingle();

      // Absence of configuration means do not send.
      if (!settings?.emails_enabled) {
        await logDecision("suppressed", {
          key,
          template: templateName,
          recipient,
          reason: "org_emails_disabled",
        });
        return { sent: false, reason: "org_emails_disabled" };
      }
      const categories = (settings.email_categories ?? {}) as Record<string, boolean>;
      if (categories[category] === false) {
        await logDecision("suppressed", {
          key,
          template: templateName,
          recipient,
          reason: `org_category_off:${category}`,
        });
        return { sent: false, reason: "org_category_off" };
      }
    }

    // --- consent layer 2: the individual can opt out ---
    if (!exempt && args.profileId) {
      const { data: allowed, error: consentError } = await supabaseAdmin.rpc("may_notify", {
        _profile: args.profileId,
        _category: category,
      });
      if (consentError) {
        // fail closed — we cannot prove consent
        await logDecision("suppressed", {
          key,
          template: templateName,
          recipient,
          reason: "consent_check_failed",
        });
        return { sent: false, reason: "consent_check_failed" };
      }
      if (allowed === false) {
        await logDecision("suppressed", {
          key,
          template: templateName,
          recipient,
          reason: `recipient_opted_out:${category}`,
        });
        return { sent: false, reason: "recipient_opted_out" };
      }
    }

    // --- suppression (bounces, complaints, unsubscribes) ---
    const { data: suppressed, error: suppressionError } = await supabaseAdmin
      .from("suppressed_emails")
      .select("id")
      .eq("email", normalized)
      .maybeSingle();
    if (suppressionError) {
      await logDecision("failed", {
        key,
        template: templateName,
        recipient,
        reason: "suppression_check_failed",
      });
      return { sent: false, reason: "suppression_check_failed" };
    }
    if (suppressed) {
      await logDecision("suppressed", {
        key,
        template: templateName,
        recipient,
        reason: "address_suppressed",
      });
      return { sent: false, reason: "address_suppressed" };
    }

    // --- unsubscribe token (one per address; reused across sends) ---
    let unsubscribeToken: string | null = null;
    const { data: existingToken } = await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .select("token, used_at")
      .eq("email", normalized)
      .maybeSingle();
    if (existingToken?.token && !existingToken.used_at) {
      unsubscribeToken = existingToken.token;
    } else if (!existingToken) {
      const token = generateToken();
      await supabaseAdmin
        .from("email_unsubscribe_tokens")
        .upsert({ token, email: normalized }, { onConflict: "email", ignoreDuplicates: true });
      const { data: stored } = await supabaseAdmin
        .from("email_unsubscribe_tokens")
        .select("token")
        .eq("email", normalized)
        .maybeSingle();
      unsubscribeToken = stored?.token ?? token;
    }

    // --- render ---
    const brand = await resolveBrand(orgId);
    const templateData = { appUrl: APP_ORIGIN, ...(args.data ?? {}), ...(brand ? { brand } : {}) };
    const element = React.createElement(template.component, templateData);
    const html = await render(element);
    const text = await render(element, { plainText: true });
    const subject =
      typeof template.subject === "function" ? template.subject(templateData) : template.subject;

    // Log pending (also claims the idempotency key) BEFORE enqueue.
    const { error: logError } = await supabaseAdmin.from("email_send_log").insert({
      message_id: key,
      send_key: key,
      template_name: templateName,
      recipient_email: recipient,
      status: "pending",
    });
    if (logError) {
      // Unique violation = another worker already claimed this event.
      if ((logError as any).code === "23505") {
        return { sent: false, reason: "duplicate_event" };
      }
      console.error("[email] failed to claim send key", logError);
      return { sent: false, reason: "log_write_failed" };
    }

    const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: key,
        to: recipient,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: "transactional",
        label: templateName,
        idempotency_key: key,
        // Exempt (security/billing-failure) mail carries no unsubscribe link.
        ...(exempt ? {} : { unsubscribe_token: unsubscribeToken }),
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error("[email] enqueue failed", {
        templateName,
        recipient: redact(recipient),
        error: enqueueError,
      });
      await supabaseAdmin
        .from("email_send_log")
        .update({ status: "failed", error_message: "Failed to enqueue email" })
        .eq("send_key", key);
      return { sent: false, reason: "enqueue_failed" };
    }

    console.log("[email] queued", { templateName, recipient: redact(recipient), key });
    return { sent: true, messageId: key };
  } catch (err) {
    // Rule 6: email failure must never break the caller.
    console.error("[email] unexpected failure", { templateName, key, err });
    return { sent: false, reason: "unexpected_error" };
  }
}

/**
 * Fire-and-forget wrapper for call sites that already wrote their in-app
 * notification and must not be delayed or broken by mail.
 */
export function queueEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  return sendTransactionalEmail(args).catch((err) => {
    console.error("[email] queueEmail swallowed error", err);
    return { sent: false, reason: "unexpected_error" } as SendEmailResult;
  });
}
