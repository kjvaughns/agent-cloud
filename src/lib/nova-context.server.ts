type Ctx = { supabase: any; userId: string };

/**
 * What Nova knows about the person she is talking to.
 *
 * The system prompt used to be one sentence — "you are an AI assistant for
 * life insurance agents" — so she could not answer the questions an agent
 * actually opens her for. "How am I doing this month", "what should I work
 * next", "which of my policies are at risk" all got a generic essay about
 * life insurance rather than an answer about *their* book.
 *
 * This assembles a small, current picture and puts it in front of her. It is
 * not retrieval and it is not tool use — she cannot go and look something up
 * mid-answer, which is the next step and a larger one. It is the handful of
 * numbers that make the difference between a chatbot and an assistant.
 *
 * Everything reads through the caller's own client, so what Nova can see is
 * exactly what the agent can see. A model with wider reach than the person
 * asking is a data leak with a friendly voice.
 */

const NOTHING = "This agent has no data in the platform yet.";

export async function buildNovaContext(ctx: Ctx): Promise<string> {
  const { supabase, userId } = ctx;
  const today = new Date();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    .toISOString();

  const [profileRes, leadsRes, policiesRes, riskRes, contractsRes, tasksRes] = await Promise.all([
    supabase.from("profiles").select("first_name, status, npn_number").eq("id", userId).maybeSingle(),
    supabase.from("clients").select("stage, temperature, last_opened_at, created_at").eq("agent_id", userId).limit(2000),
    supabase.from("policies").select("status, monthly_premium, annual_premium, posted_at, carriers(name)").eq("agent_id", userId).limit(2000),
    supabase.from("retention_cases").select("status, risk_reason, premium_at_risk").eq("agent_id", userId).in("status", ["open", "working"]).limit(200),
    supabase.from("contract_requests").select("status, carriers(name)").eq("agent_id", userId).limit(200),
    supabase.from("tasks").select("title, due_date, status").eq("assigned_to", userId).neq("status", "done").limit(50),
  ]);

  const lines: string[] = [];
  const profile = profileRes.data;
  if (profile?.first_name) lines.push(`Agent: ${profile.first_name}.`);

  // ── Pipeline ──
  const leads = (leadsRes.data ?? []) as any[];
  const open = leads.filter((c) => c.stage !== "sold");
  if (leads.length) {
    const hot = open.filter((c) => c.temperature === "hot").length;
    const quietBefore = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const quiet = open.filter((c) => (c.last_opened_at ?? c.created_at) < quietBefore).length;
    lines.push(
      `Pipeline: ${open.length} open leads, ${hot} hot, ${quiet} not touched in 14+ days. ${leads.length - open.length} sold.`,
    );
  }

  // ── Book ──
  const policies = (policiesRes.data ?? []) as any[];
  if (policies.length) {
    const active = policies.filter((p) => p.status === "active");
    const monthly = active.reduce((a, p) => a + Number(p.monthly_premium ?? 0), 0);
    const thisMonth = policies.filter((p) => p.posted_at && p.posted_at >= monthStart).length;
    const pending = policies.filter((p) => ["issued_not_paid", "in_review"].includes(p.status)).length;
    const carriers = [...new Set(active.map((p) => p.carriers?.name).filter(Boolean))];
    lines.push(
      `Book: ${active.length} active policies, $${Math.round(monthly)}/mo premium, ${pending} awaiting issue, ${thisMonth} placed this month.`,
    );
    if (carriers.length) lines.push(`Carriers they write: ${carriers.slice(0, 12).join(", ")}.`);
  }

  // ── At risk ──
  const risk = (riskRes.data ?? []) as any[];
  if (risk.length) {
    const atRisk = risk.reduce((a, c) => a + Number(c.premium_at_risk ?? 0), 0);
    const reasons = [...new Set(risk.map((c) => c.risk_reason).filter(Boolean))].slice(0, 4);
    lines.push(
      `Retention: ${risk.length} policies at risk, $${Math.round(atRisk)} premium at stake${reasons.length ? ` (${reasons.join("; ")})` : ""}.`,
    );
  }

  // ── Contracting ──
  const contracts = (contractsRes.data ?? []) as any[];
  if (contracts.length) {
    const activeC = contracts.filter((c) => c.status === "active");
    const waiting = contracts.filter((c) => !["active", "rejected"].includes(c.status));
    lines.push(`Contracting: appointed with ${activeC.length} carriers, ${waiting.length} still in progress.`);
    if (waiting.length) {
      lines.push(
        `In progress: ${waiting.slice(0, 8).map((c) => `${c.carriers?.name ?? "carrier"} (${c.status})`).join(", ")}.`,
      );
    }
  }

  // ── Today ──
  const tasks = (tasksRes.data ?? []) as any[];
  const todayIso = today.toISOString().slice(0, 10);
  const overdue = tasks.filter((t) => t.due_date && t.due_date < todayIso);
  if (tasks.length) {
    lines.push(
      `Tasks: ${tasks.length} open${overdue.length ? `, ${overdue.length} overdue` : ""}.` +
        (overdue.length ? ` Overdue: ${overdue.slice(0, 5).map((t) => t.title).join("; ")}.` : ""),
    );
  }

  if (profile?.status === "pending") {
    lines.push(
      "This agent is not activated yet — they have no clients or commissions, and are working through licensing and contracting. Answer accordingly.",
    );
  }

  return lines.length ? lines.join("\n") : NOTHING;
}

/** The instructions, with the picture above folded in. */
export function novaSystemPrompt(context: string): string {
  return [
    "You are Nova, the assistant inside Agent Cloud — a platform life insurance agents use to run their book.",
    "",
    "You are talking to one agent about their own business. Here is their current position:",
    "",
    context,
    "",
    "How to answer:",
    "- Use the numbers above when they are relevant. Say them plainly.",
    "- If something is not in the picture above, say you cannot see it rather than guessing. You do not have live lookup.",
    "- Be concrete and short. An agent between calls wants the answer, not an essay.",
    "- You may help with objection handling, scripts, product questions and next actions.",
    "- Never invent a premium, a commission rate, a carrier rule or a policy status.",
  ].join("\n");
}
