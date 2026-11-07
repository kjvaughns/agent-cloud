import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { TEMPLATES } from "@/lib/email-templates/registry";
import type { EmailBrand } from "@/lib/email-templates/layout";
import { EXEMPT_CATEGORIES, type EmailCategory } from "@/lib/email/categories";

const supabaseAdmin = _admin as any;

const SITE_NAME = "Agent Cloud";
export { APP_ORIGIN } from "@/lib/hosts";
import { APP_ORIGIN } from "@/lib/hosts";

export interface SendEmailArgs {
  /** Registered template name (see src/lib/email-templates/registry.ts). */
  template: string;
  /** Explicit recipient. Optional when `profileId` is given. */
  to?: string | null;
  /** Reply address for this event; does not change the verified noreply sender. */
  replyTo?: string;
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

/**
 * Nothing sends from a local dev server unless explicitly enabled, and a
 * global kill switch is always available. Preview deployments are additionally
 * protected by org-level consent, which is OFF until an owner turns it on.
 */
function environmentBlocked(): string | null {
  if (process.env.EMAILS_DISABLED === "true") return "emails_disabled";
  const liveOverride = process.env.EMAILS_LIVE === "true";
  const isDevServer = import.meta.env.DEV;
  if (isDevServer && !liveOverride) return "non_production_environment";
  return null;
}

async function logDecision(
  status: "suppressed" | "failed" | "sent",
  args: { key: string; template: string; recipient: string | null; reason?: string },
) {
  try {
    const { error } = await supabaseAdmin.from("email_send_log").insert({
      message_id: args.key,
      send_key: args.key,
      template_name: args.template,
      recipient_email: args.recipient ?? "unknown",
      status,
      error_message: args.reason ?? null,
    });
    if (error && error.code !== "23505") {
      console.error("[email] failed to write send log", { code: error.code, message: error.message });
    }
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
 * recipient consent → managed send. Never throws: a failed email must
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

    // --- the sample agency does not send real email ---
    //
    // Before idempotency, so a refused demo send does not burn the key that a
    // real send of the same event would need. Checked two ways because the
    // caller may know the org, the recipient, or only one of them: a
    // notification about a demo policy carries orgId, an account email carries
    // profileId. Exempt categories are gated too — the exemption exists so a
    // password reset survives an org that has not opted in, not so the demo can
    // mail somebody.
    const { refusedForDemo, isDemoUser } = await import("@/lib/demo.server");
    if ((await refusedForDemo(args.orgId, "send email")) || (await isDemoUser(args.profileId))) {
      return { sent: false, reason: "demo_org" };
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

    // Managed delivery is the authority for bounce/complaint/unsubscribe suppression.
    const brand = await resolveBrand(orgId);
    const templateData = { appUrl: APP_ORIGIN, ...(args.data ?? {}), ...(brand ? { brand } : {}) };
    try {
      const result = await sendTemplateEmail(templateName, recipient, {
        templateData,
        idempotencyKey: key,
        replyTo: args.replyTo,
      });
      await logDecision(result.sent ? "sent" : "suppressed", {
        key, template: templateName, recipient,
        reason: result.sent ? undefined : result.reason,
      });
      if (!result.sent) return result;
    } catch (error) {
      await logDecision("failed", {
        key, template: templateName, recipient,
        reason: error instanceof Error ? error.message.slice(0, 1000) : "Email send failed",
      });
      console.error("[email] send failed", { templateName, recipient: redact(recipient), key });
      return { sent: false, reason: "send_failed" };
    }
    console.log("[email] sent", { templateName, recipient: redact(recipient), key });
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
