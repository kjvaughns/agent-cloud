import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * Owner-facing email visibility.
 *
 * email_send_log records one row per state transition, so every read here is
 * deduplicated by send_key/message_id down to the latest status — otherwise a
 * single email looks like two.
 */

export type EmailLogRow = {
  id: string;
  message_id: string | null;
  template_name: string | null;
  recipient_email: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

async function assertEmailViewer(supabase: any, userId: string) {
  // `limit(1)`, not `maybeSingle()`. A founder holds both `agency_owner` and
  // `super_admin`, and maybeSingle() treats two matching rows as an error —
  // so the people most entitled to read the log were the only ones refused.
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["super_admin", "admin", "agency_owner"])
    .limit(1);
  if (!data?.length) throw new Error("Forbidden");
}


export const listEmailSends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        days: z.number().int().min(1).max(90).default(7),
        template: z.string().max(120).nullable().optional(),
        status: z.string().max(40).nullable().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await assertEmailViewer(supabase, userId);

    const since = new Date(Date.now() - data.days * 86400000).toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = (supabaseAdmin as any)
      .from("email_send_log")
      .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.template) q = q.eq("template_name", data.template);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Latest row per event.
    const latest = new Map<string, EmailLogRow>();
    for (const r of (rows ?? []) as EmailLogRow[]) {
      const k = r.message_id ?? r.id;
      if (!latest.has(k)) latest.set(k, r);
    }
    let list = Array.from(latest.values());
    if (data.status) list = list.filter((r) => r.status === data.status);

    const stats = { total: list.length, sent: 0, failed: 0, suppressed: 0, pending: 0 };
    for (const r of list) {
      if (r.status === "sent") stats.sent++;
      else if (r.status === "dlq" || r.status === "failed" || r.status === "bounced") stats.failed++;
      else if (r.status === "suppressed") stats.suppressed++;
      else stats.pending++;
    }

    const templates = Array.from(
      new Set(((rows ?? []) as EmailLogRow[]).map((r) => r.template_name).filter(Boolean) as string[]),
    ).sort();

    return { rows: list.slice(0, 200), stats, templates };
  });

export const listEmailTemplateNames = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    await assertEmailViewer(supabase, userId);
    const { TEMPLATES } = await import("@/lib/email-templates/registry");
    return {
      templates: Object.entries(TEMPLATES).map(([name, t]: [string, any]) => ({
        name,
        displayName: t.displayName ?? name,
      })),
    };
  });

/** Renders a registered template with its preview data, for in-app review. */
export const previewEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await assertEmailViewer(supabase, userId);

    const [{ TEMPLATES }, { render }, React] = await Promise.all([
      import("@/lib/email-templates/registry"),
      import("@react-email/render"),
      import("react"),
    ]);
    const entry = (TEMPLATES as any)[data.name];
    if (!entry) throw new Error("Unknown template");

    const props = entry.previewData ?? {};
    const html = await render(React.createElement(entry.component, props));
    const subject = typeof entry.subject === "function" ? entry.subject(props) : entry.subject;
    return { html, subject };
  });
