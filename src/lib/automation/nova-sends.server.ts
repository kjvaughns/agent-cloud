import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId } from "@/lib/org-guard";
import { queueEmail } from "@/lib/email/send.server";
import { trackNovaUsage } from "@/lib/billing.functions";
import { TELEPHONY_UNAVAILABLE } from "@/lib/telephony";

const supabaseAdmin = _admin as any;

/**
 * Nova automation sends — the core the runner uses.
 *
 * Lives here (server-only) so both the authenticated per-agent call and the
 * scheduled org-wide sweep execute exactly the same code. Three rules govern
 * every send, and none of them are optional:
 *
 *  1. Consent. Owned entirely by the mailer, which checks the agency switch,
 *     the per-category switch, address-level suppression, and attaches the
 *     unsubscribe token. This module used to pre-check consent itself, against
 *     the wrong three columns — internal notification flags standing in for
 *     outbound marketing consent. Two gates that disagree is worse than one.
 *  2. Idempotency. Every send claims a row in automation_runs under a unique
 *     (automation, subject, occurrence, channel) key BEFORE the message goes
 *     out. Running twice produces one message, not two.
 *  3. Honesty. A run is only marked 'sent' once the mailer has accepted it.
 *     Anything refused records the mailer's own reason. Until now this module
 *     rendered the message, wrote 'sent', and never called the mailer at all —
 *     so every birthday and anniversary it believed it had delivered was
 *     composed and thrown away.
 */

const SMS_UNAVAILABLE = TELEPHONY_UNAVAILABLE;

/**
 * A refusal from the mailer is not the same as a breakage.
 *
 * Consent, suppression and an unset environment are the system working — they
 * belong under 'blocked', where somebody reading the ledger understands there
 * is a switch to flip. Only an actual malfunction is a failure.
 */
function refusalStatusFor(reason: string): "blocked" | "failed" {
  const malfunctions = ["enqueue_failed", "log_write_failed", "unexpected_error", "template_not_registered"];
  return malfunctions.includes(reason) ? "failed" : "blocked";
}

/** The mailer's reasons are identifiers. This is the sentence for a person. */
function explain(reason: string): string {
  switch (reason) {
    case "org_emails_disabled":
      return "Your agency has email turned off (Settings → Agency settings → Email).";
    case "org_category_off":
      return "Messages to clients are switched off for your agency (Settings → Agency settings → Email).";
    case "address_suppressed":
      return "One or more recipients previously unsubscribed or bounced.";
    case "non_production_environment":
      return "Email does not send outside production.";
    case "emails_disabled":
      return "Email is disabled platform-wide.";
    case "duplicate_event":
      return "Already sent for this occurrence.";
    default:
      return `Email was not sent (${reason}).`;
  }
}

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

  if (automation.trigger_type === "custom_date") {
    // Accepted by the form and by the CHECK constraint since the day the table
    // was written, and never handled here — so anybody who built one watched
    // it sit at "never run" forever.
    //
    // A custom date means one date. It fires on the day, to every client with
    // an address, and the year in the occurrence key means a date that comes
    // round again next year fires again rather than being deduped away.
    if (!automation.custom_date) return out;
    const when = new Date(automation.custom_date + "T00:00:00Z");
    if (when.getUTCMonth() + 1 !== t.month || when.getUTCDate() !== t.day) return out;

    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id, first_name, last_name, email")
      .eq("agent_id", automation.agent_id)
      .not("email", "is", null)
      .limit(2000);

    for (const c of clients ?? []) {
      out.push({
        automation,
        subjectType: "client",
        subjectId: c.id,
        occurrenceKey: `custom-${automation.custom_date}-${t.year}`,
        recipientEmail: c.email ?? null,
        vars: { first_name: c.first_name ?? "", last_name: c.last_name ?? "" },
      });
    }
  }

  // beneficiary_checkin intentionally unhandled: it needs a review cadence
  // the schema does not record yet. Better to run nothing than to invent one.
  return out;
}

/**
 * What the client sees in their inbox.
 *
 * The automation carries a body, not a subject — so one is derived from what
 * the automation is for. "Birthday emails", the name the agent gave it, is a
 * label for them and would be a strange thing to receive.
 */
function subjectFor(automation: any, vars: Record<string, string>): string {
  const name = vars.first_name?.trim();
  switch (automation.trigger_type) {
    case "birthday":
      return name ? `Happy birthday, ${name}!` : "Happy birthday!";
    case "policy_anniversary":
      return vars.years
        ? `${vars.years} ${vars.years === "1" ? "year" : "years"} of coverage`
        : "Your policy anniversary";
    case "lapse_follow_up":
      return "About your policy";
    default:
      return automation.name || "A note from your agent";
  }
}

/** The signature. A client has a relationship with their agent, not with us. */
async function agentIdentity(agentId: string, orgId: string | null) {
  const [{ data: profile }, { data: org }] = await Promise.all([
    supabaseAdmin.from("profiles").select("first_name, last_name, email, phone").eq("id", agentId).maybeSingle(),
    orgId
      ? supabaseAdmin.from("organizations").select("name").eq("id", orgId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    agentName: `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || undefined,
    agentEmail: profile?.email ?? undefined,
    agentPhone: profile?.phone ?? undefined,
    agencyName: org?.name ?? undefined,
  };
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

  const { data: automations } = await supabaseAdmin
    .from("nova_automations")
    .select("id, agent_id, name, trigger_type, channel, message_template, custom_date, enabled")
    .eq("agent_id", agentId)
    .eq("enabled", true);

  const summary = { considered: 0, sent: 0, blocked: 0, skipped: 0, failed: 0 };
  const blockedReasons = new Set<string>();
  if (!automations?.length) return { ...summary, blockedReasons: [] };

  const identity = await agentIdentity(agentId, orgId ?? null);

  for (const a of automations) {
    const candidates = await findCandidates(a);
    summary.considered += candidates.length;

    for (const c of candidates) {
      const channels: ("email" | "sms")[] = a.channel === "both" ? ["email", "sms"] : [a.channel];

      for (const channel of channels) {
        // Decided before any work: these need no send attempt.
        let refusal: { status: "blocked" | "skipped"; reason: string } | null = null;
        if (channel === "sms") {
          refusal = { status: "blocked", reason: SMS_UNAVAILABLE };
          blockedReasons.add(SMS_UNAVAILABLE);
        } else if (!c.recipientEmail) {
          refusal = { status: "skipped", reason: "No email address on file" };
        }

        if (opts.dryRun) {
          if (refusal?.status === "blocked") summary.blocked++;
          else if (refusal?.status === "skipped") summary.skipped++;
          else summary.sent++;
          continue;
        }

        const rendered = render(a.message_template, c.vars);

        // Claim the occurrence BEFORE sending. The unique index makes this the
        // idempotency check, and doing it first is what stops two overlapping
        // runs from both deciding to send. A duplicate insert means somebody
        // else already has this one.
        const { error: claimError } = await supabaseAdmin.from("automation_runs").insert({
          automation_id: a.id,
          agent_id: a.agent_id,
          subject_type: c.subjectType,
          subject_id: c.subjectId,
          occurrence_key: c.occurrenceKey,
          channel,
          status: refusal ? refusal.status : "queued",
          reason: refusal?.reason ?? null,
          rendered_message: rendered,
        });

        if (claimError) {
          // 23505 = already ran for this occurrence. Expected, not a failure.
          if (claimError.code === "23505") summary.skipped++;
          else summary.failed++;
          continue;
        }

        if (refusal) {
          if (refusal.status === "blocked") summary.blocked++;
          else summary.skipped++;
          continue;
        }

        // The mailer owns consent: the agency switch, the category switch,
        // address suppression, and the unsubscribe token. Whatever it decides
        // is what the ledger records — this module no longer guesses.
        const result = await queueEmail({
          template: "client_message",
          to: c.recipientEmail,
          orgId: orgId ?? null,
          category: "client_messaging",
          key: `nova-automation:${a.id}:${c.subjectId}:${c.occurrenceKey}:${channel}`,
          data: {
            ...identity,
            subject: subjectFor(a, c.vars),
            body: rendered,
          },
        });

        const finished = result.sent
          ? { status: "sent", reason: null, sent_at: new Date().toISOString() }
          : { status: refusalStatusFor(result.reason), reason: result.reason, sent_at: null };

        if (!result.sent) blockedReasons.add(explain(result.reason));

        await supabaseAdmin
          .from("automation_runs")
          .update(finished)
          .eq("automation_id", a.id)
          .eq("subject_id", c.subjectId)
          .eq("occurrence_key", c.occurrenceKey)
          .eq("channel", channel);

        if (finished.status === "sent") {
          summary.sent++;
          // The "Automation executions" meter on Settings → Nova Pro. Counted
          // here and only here, on a run the mailer actually accepted — the
          // number a subscriber is shown against a 200/month allowance has to
          // mean deliveries, not attempts, or the allowance is spent by
          // failures the agent never got the benefit of. Fire-and-forget:
          // a metering failure must not fail a send that already happened.
          trackNovaUsage(a.agent_id, "automations").catch(() => {});
        } else if (finished.status === "failed") summary.failed++;
        else summary.blocked++;
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
