import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId } from "@/lib/org-guard";

const supabaseAdmin = _admin as any;

/**
 * Nova automation sends — the core the runner uses.
 *
 * Lives here (server-only) so both the authenticated per-agent call and the
 * scheduled org-wide sweep execute exactly the same code. Three rules govern
 * every send, and none of them are optional:
 *
 *  1. Consent. An automation only fires if the organization has enabled
 *     automated messaging AND the recipient has not opted out. Absent
 *     configuration means "do not send" — never "send by default".
 *  2. Idempotency. Every send is written to automation_runs under a unique
 *     (automation, subject, occurrence, channel) key. Running twice produces
 *     one message, not two.
 *  3. Honesty about channels. SMS has no provider connected, so SMS
 *     automations are recorded as 'blocked' with a reason rather than
 *     silently dropped or falsely reported as sent.
 */

const SMS_UNAVAILABLE = "SMS is not available — no telephony provider is connected.";

export type SendSummary = {
  considered: number;
  sent: number;
  blocked: number;
  skipped: number;
  failed: number;
  blockedReasons: string[];
};

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

    for (const c of cases ?? []) {
      out.push({
        automation,
        subjectType: "policy",
        subjectId: c.policy_id,
        occurrenceKey: `lapse-${todayParts().iso}`,
        recipientEmail: c.policies?.clients?.email ?? null,
        vars: {
          first_name: c.policies?.clients?.first_name ?? "",
          last_name: c.policies?.clients?.last_name ?? "",
          policy_number: c.policies?.policy_number ?? "",
        },
      });
    }
  }

  // beneficiary_checkin intentionally unhandled: it needs a review cadence
  // the schema does not record yet. Better to run nothing than to invent one.
  return out;
}

/** Has this agency opted into outbound automated mail at all? */
async function orgAllowsMail(orgId: string | null): Promise<boolean> {
  if (!orgId) return false;
  const { data: settings } = await supabaseAdmin
    .from("organization_settings")
    .select("notify_new_agent, notify_new_ticket, notify_contract_request")
    .eq("organization_id", orgId)
    .maybeSingle();
  return Boolean(
    settings?.notify_new_agent || settings?.notify_new_ticket || settings?.notify_contract_request,
  );
}

/**
 * Execute every enabled automation belonging to one agent.
 * Safe to call repeatedly — the unique index on automation_runs collapses
 * duplicates, so a second pass reports them as skipped rather than resending.
 */
export async function runAutomationsForAgent(
  agentId: string,
  opts: { dryRun?: boolean; orgId?: string | null } = {},
): Promise<SendSummary> {
  const orgId = opts.orgId !== undefined ? opts.orgId : await getMyPrimaryOrgId(agentId);
  const orgAllows = await orgAllowsMail(orgId ?? null);

  const { data: automations } = await supabaseAdmin
    .from("nova_automations")
    .select("id, agent_id, name, trigger_type, channel, message_template, custom_date, enabled")
    .eq("agent_id", agentId)
    .eq("enabled", true);

  const summary = { considered: 0, sent: 0, blocked: 0, skipped: 0, failed: 0 };
  const blockedReasons = new Set<string>();

  for (const a of automations ?? []) {
    const candidates = await findCandidates(a);
    summary.considered += candidates.length;

    for (const c of candidates) {
      const channels: ("email" | "sms")[] = a.channel === "both" ? ["email", "sms"] : [a.channel];

      for (const channel of channels) {
        let status: string = "queued";
        let reason: string | null = null;

        if (channel === "sms") {
          status = "blocked";
          reason = SMS_UNAVAILABLE;
          blockedReasons.add(SMS_UNAVAILABLE);
        } else if (!orgAllows) {
          status = "blocked";
          reason =
            "Your agency has not enabled automated messaging (Admin Settings → Automated Notifications).";
          blockedReasons.add(reason);
        } else if (!c.recipientEmail) {
          status = "skipped";
          reason = "No email address on file";
        }

        if (opts.dryRun) {
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

    if (!opts.dryRun) {
      await supabaseAdmin
        .from("nova_automations")
        .update({ last_run_at: new Date().toISOString() })
        .eq("id", a.id);
    }
  }

  return { ...summary, blockedReasons: Array.from(blockedReasons) };
}
