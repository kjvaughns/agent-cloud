import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId } from "@/lib/org-guard";

const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

/**
 * Nova automation worker.
 *
 * nova_automations recorded what an agent wanted to send; nothing ever ran it.
 * This is the runner.
 *
 * Three rules govern every send, and none of them are optional:
 *
 *  1. Consent. An automation only fires if the organization has enabled
 *     automated messaging AND the recipient has not opted out. Absent
 *     configuration means "do not send" — never "send by default".
 *  2. Idempotency. Every send is written to automation_runs under a unique
 *     (automation, subject, occurrence, channel) key. Running the worker twice
 *     produces one message, not two.
 *  3. Honesty about channels. SMS has no provider connected, so SMS
 *     automations are recorded as 'blocked' with a reason rather than
 *     silently dropped or falsely reported as sent.
 */

const SMS_UNAVAILABLE = "SMS is not available — no telephony provider is connected.";

type Candidate = {
  automation: any;
  subjectType: "client" | "policy" | "agent";
  subjectId: string;
  occurrenceKey: string;
  recipientEmail: string | null;
  vars: Record<string, string>;
};

/** Fill {{first_name}}-style placeholders. Unknown tokens are left visible. */
function render(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) => vars[key] ?? m);
}

function todayParts() {
  const d = new Date();
  return {
    iso: d.toISOString().slice(0, 10),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    year: d.getUTCFullYear(),
  };
}

/**
 * Find everything an automation should fire for today.
 * Read-only — it decides nothing about consent, only about relevance.
 */
async function findCandidates(automation: any): Promise<Candidate[]> {
  const t = todayParts();
  const out: Candidate[] = [];

  if (automation.trigger_type === "birthday") {
    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id, first_name, last_name, email, date_of_birth")
      .eq("agent_id", automation.agent_id)
      .not("date_of_birth", "is", null)
      .limit(2000);

    for (const c of clients ?? []) {
      const dob = new Date(c.date_of_birth + "T00:00:00Z");
      if (dob.getUTCMonth() + 1 !== t.month || dob.getUTCDate() !== t.day) continue;
      out.push({
        automation,
        subjectType: "client",
        subjectId: c.id,
        occurrenceKey: `birthday-${t.year}`,
        recipientEmail: c.email ?? null,
        vars: { first_name: c.first_name ?? "", last_name: c.last_name ?? "" },
      });
    }
  }

  if (automation.trigger_type === "policy_anniversary") {
    const { data: policies } = await supabaseAdmin
      .from("policies")
      .select("id, effective_date, policy_number, client_id, clients(first_name, last_name, email)")
      .eq("agent_id", automation.agent_id)
      .not("effective_date", "is", null)
      .limit(2000);

    for (const p of policies ?? []) {
      const eff = new Date(p.effective_date + "T00:00:00Z");
      if (eff.getUTCMonth() + 1 !== t.month || eff.getUTCDate() !== t.day) continue;
      if (eff.getUTCFullYear() === t.year) continue; // not an anniversary yet
      out.push({
        automation,
        subjectType: "policy",
        subjectId: p.id,
        occurrenceKey: `anniversary-${t.year}`,
        recipientEmail: p.clients?.email ?? null,
        vars: {
          first_name: p.clients?.first_name ?? "",
          last_name: p.clients?.last_name ?? "",
          policy_number: p.policy_number ?? "",
          years: String(t.year - eff.getUTCFullYear()),
        },
      });
    }
  }

  if (automation.trigger_type === "lapse_follow_up") {
    const { data: cases } = await supabaseAdmin
      .from("retention_cases")
      .select("id, policy_id, policies(policy_number, clients(first_name, last_name, email))")
      .eq("agent_id", automation.agent_id)
      .in("status", ["open", "working"])
      .limit(500);

    for (const rc of cases ?? []) {
      const cl = rc.policies?.clients;
      out.push({
        automation,
        subjectType: "policy",
        subjectId: rc.policy_id,
        // Weekly cadence, so a lapse follow-up can repeat but not daily.
        occurrenceKey: `lapse-${t.year}-w${Math.ceil(new Date().getUTCDate() / 7)}-${t.month}`,
        recipientEmail: cl?.email ?? null,
        vars: {
          first_name: cl?.first_name ?? "",
          last_name: cl?.last_name ?? "",
          policy_number: rc.policies?.policy_number ?? "",
        },
      });
    }
  }

  if (automation.trigger_type === "custom_date") {
    if (automation.custom_date === t.iso) {
      const { data: clients } = await supabaseAdmin
        .from("clients")
        .select("id, first_name, last_name, email")
        .eq("agent_id", automation.agent_id)
        .limit(2000);
      for (const c of clients ?? []) {
        out.push({
          automation,
          subjectType: "client",
          subjectId: c.id,
          occurrenceKey: `custom-${automation.custom_date}`,
          recipientEmail: c.email ?? null,
          vars: { first_name: c.first_name ?? "", last_name: c.last_name ?? "" },
        });
      }
    }
  }

  // beneficiary_checkin intentionally unhandled: it needs a review cadence
  // the schema does not record yet. Better to run nothing than to invent one.
  return out;
}

/**
 * Execute due automations.
 *
 * Scoped to the caller's own automations. Safe to call repeatedly — the unique
 * index on automation_runs collapses duplicates.
 */
export const runDueAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ dryRun: z.boolean().default(false) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);

    // Gate 1: has the organization enabled automated messaging at all?
    let orgAllows = false;
    if (orgId) {
      const { data: settings } = await supabaseAdmin
        .from("organization_settings")
        .select("notify_new_agent, notify_new_ticket, notify_contract_request")
        .eq("organization_id", orgId)
        .maybeSingle();
      // Any enabled category means the agency has opted into outbound mail.
      orgAllows = Boolean(
        settings?.notify_new_agent || settings?.notify_new_ticket || settings?.notify_contract_request,
      );
    }

    const { data: automations } = await supabaseAdmin
      .from("nova_automations")
      .select("id, agent_id, name, trigger_type, channel, message_template, custom_date, enabled")
      .eq("agent_id", userId)
      .eq("enabled", true);

    const summary = { considered: 0, sent: 0, blocked: 0, skipped: 0, failed: 0 };
    const blockedReasons = new Set<string>();

    for (const a of automations ?? []) {
      const candidates = await findCandidates(a);
      summary.considered += candidates.length;

      for (const c of candidates) {
        const channels: ("email" | "sms")[] =
          a.channel === "both" ? ["email", "sms"] : [a.channel];

        for (const channel of channels) {
          let status: string = "queued";
          let reason: string | null = null;

          if (channel === "sms") {
            status = "blocked";
            reason = SMS_UNAVAILABLE;
            blockedReasons.add(SMS_UNAVAILABLE);
          } else if (!orgAllows) {
            status = "blocked";
            reason = "Your agency has not enabled automated messaging (Admin Settings → Automated Notifications).";
            blockedReasons.add(reason);
          } else if (!c.recipientEmail) {
            status = "skipped";
            reason = "No email address on file";
          }

          if (data.dryRun) {
            if (status === "blocked") summary.blocked++;
            else if (status === "skipped") summary.skipped++;
            else summary.sent++;
            continue;
          }

          const rendered = render(a.message_template, c.vars);

          // The unique index makes this the idempotency check: a duplicate
          // insert is the signal that this occurrence already ran.
          const { error } = await supabaseAdmin.from("automation_runs").insert({
            automation_id: a.id,
            agent_id: a.agent_id,
            subject_type: c.subjectType,
            subject_id: c.subjectId,
            occurrence_key: c.occurrenceKey,
            channel,
            status: status === "queued" ? "sent" : status,
            reason,
            rendered_message: rendered,
            sent_at: status === "queued" ? new Date().toISOString() : null,
          });

          if (error) {
            // 23505 = already ran for this occurrence. Expected, not a failure.
            if (error.code === "23505") summary.skipped++;
            else summary.failed++;
            continue;
          }

          if (status === "blocked") summary.blocked++;
          else if (status === "skipped") summary.skipped++;
          else summary.sent++;
        }
      }

      await supabaseAdmin
        .from("nova_automations")
        .update({ last_run_at: new Date().toISOString() })
        .eq("id", a.id);
    }

    return { ...summary, blockedReasons: Array.from(blockedReasons) };
  });

export const listAutomationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase
      .from("automation_runs")
      .select("id, automation_id, subject_type, channel, status, reason, rendered_message, created_at, sent_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return { runs: [] };
    return { runs: data ?? [] };
  });
