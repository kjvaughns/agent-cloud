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
const NOTHING_STAFF = "This staff member's agency has no contracting records yet.";

/**
 * Which picture to build.
 *
 * A back-office coordinator opening Nova got the agent one: their own pipeline,
 * their own book, their own policies at risk — all empty, because they do not
 * sell — and a persona telling the model it was "talking to one agent about
 * their own business". They were then offered an objection coach. Everything
 * they actually manage lives one table over.
 */
export type NovaAudience = "agent" | "staff";

export async function resolveNovaAudience(ctx: Ctx): Promise<NovaAudience> {
  const { supabase, userId } = ctx;
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  // Same precedence `getMyAccess` uses: somebody holding staff *and* a higher
  // role is that higher role, and gets the producer picture.
  const held = new Set((roles ?? []).map((r: any) => String(r.role)));
  const outranks = ["super_admin", "agency_owner", "admin", "manager"].some((r) => held.has(r));
  return held.has("staff") && !outranks ? "staff" : "agent";
}

/**
 * The picture and who it is of, resolved together.
 *
 * Callers need both — `novaSystemPrompt` takes the audience — and asking for
 * them separately means resolving the role twice and, worse, allows the two to
 * disagree if one call is edited and the other is not.
 */
export async function buildNovaTurn(ctx: Ctx): Promise<{ audience: NovaAudience; context: string }> {
  const audience = await resolveNovaAudience(ctx);
  const context = audience === "staff" ? await buildStaffContext(ctx) : await buildAgentContext(ctx);
  return { audience, context };
}

export async function buildNovaContext(ctx: Ctx): Promise<string> {
  return (await buildNovaTurn(ctx)).context;
}

async function buildAgentContext(ctx: Ctx): Promise<string> {
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

/**
 * The queue a back-office coordinator manages, rather than a book they do not
 * have.
 *
 * Reads go through the caller's own client for the same reason the agent
 * picture does: what Nova can see must be exactly what the person asking can
 * see. For staff that means RLS's `can_view_contracting` decides, so a
 * coordinator without the flag gets an honest blank rather than the agency's
 * roster.
 */
async function buildStaffContext(ctx: Ctx): Promise<string> {
  const { supabase, userId } = ctx;
  const todayIso = new Date().toISOString().slice(0, 10);
  const in45 = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);

  const [profileRes, requestsRes, licensesRes, reviewsRes, tasksRes, carriersRes] = await Promise.all([
    supabase.from("profiles").select("first_name").eq("id", userId).maybeSingle(),
    supabase.from("contracting_requests")
      .select("id, reference, status, contract_type, readiness_state, is_overdue, due_date, assigned_to, created_at, org_carriers ( carriers ( name ) ), profiles:agent_id ( first_name, last_name )")
      .limit(500),
    supabase.from("state_licenses")
      .select("state_code, expires_date, status, profiles:agent_id ( first_name, last_name )")
      .lte("expires_date", in45)
      .limit(500),
    supabase.from("pdb_reviews").select("agent_id, status, next_review_date").limit(500),
    supabase.from("tasks").select("title, due_date, status").eq("assigned_to", userId).neq("status", "done").limit(50),
    supabase.from("org_carriers")
      .select("id, carriers ( name ), org_carrier_methods ( id )")
      .limit(200),
  ]);

  const lines: string[] = [];
  if (profileRes.data?.first_name) lines.push(`Staff member: ${profileRes.data.first_name}.`);
  lines.push("Their job is back-office contracting and licensing for the agency. They do not sell.");

  const name = (p: any) => `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "an agent";

  // ── The queue ──
  const requests = (requestsRes.data ?? []) as any[];
  const settled = ["approved", "writing_number_issued", "declined", "cancelled", "closed"];
  const openRequests = requests.filter((r) => !settled.includes(r.status));
  if (requests.length) {
    const overdue = openRequests.filter((r) => r.is_overdue);
    const unassigned = openRequests.filter((r) => !r.assigned_to);
    const mine = openRequests.filter((r) => r.assigned_to === userId);
    const ready = openRequests.filter((r) => r.status === "ready_to_submit");
    const nigo = openRequests.filter((r) => r.status === "nigo");
    lines.push(
      `Contracting queue: ${openRequests.length} open requests — ${mine.length} assigned to them, ` +
      `${unassigned.length} unassigned, ${ready.length} ready to submit, ${nigo.length} not in good order, ` +
      `${overdue.length} overdue.`,
    );
    if (overdue.length) {
      lines.push(
        `Overdue: ${overdue.slice(0, 8).map((r) => `${name(r.profiles)} / ${r.org_carriers?.carriers?.name ?? "carrier"} (${r.status}${r.due_date ? `, due ${r.due_date}` : ""})`).join("; ")}.`,
      );
    }
    if (ready.length) {
      lines.push(
        `Ready to submit: ${ready.slice(0, 8).map((r) => `${name(r.profiles)} / ${r.org_carriers?.carriers?.name ?? "carrier"}`).join("; ")}.`,
      );
    }

    // Turnaround, measured rather than estimated. Only settled requests can
    // answer it, and saying nothing beats inventing a number staff will quote
    // to a carrier.
    const done = requests.filter((r) => r.status === "approved" || r.status === "writing_number_issued");
    if (done.length >= 3) {
      const days = done
        .map((r) => Math.round((Date.now() - new Date(r.created_at).getTime()) / 86_400_000))
        .filter((d) => d >= 0);
      const avg = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
      lines.push(`Average age at approval across ${done.length} completed requests: about ${avg} days.`);
    }
  }

  // ── Licensing ──
  const licenses = (licensesRes.data ?? []) as any[];
  const expired = licenses.filter((l) => l.expires_date && l.expires_date < todayIso);
  const expiring = licenses.filter((l) => l.expires_date && l.expires_date >= todayIso);
  if (licenses.length) {
    lines.push(`Licences: ${expired.length} expired, ${expiring.length} expiring within 45 days.`);
    const soon = [...expiring].sort((a, b) => a.expires_date.localeCompare(b.expires_date)).slice(0, 8);
    if (soon.length) {
      lines.push(
        `Soonest: ${soon.map((l) => `${name(l.profiles)} ${l.state_code} expires ${l.expires_date}`).join("; ")}.`,
      );
    }
    if (expired.length) {
      lines.push(
        `Already expired: ${expired.slice(0, 8).map((l) => `${name(l.profiles)} ${l.state_code} (${l.expires_date})`).join("; ")}.`,
      );
    }
  }

  // ── PDB ──
  const reviews = (reviewsRes.data ?? []) as any[];
  if (reviews.length) {
    const stale = reviews.filter((r) => r.next_review_date && r.next_review_date < todayIso);
    const pending = reviews.filter((r) => ["pending", "in_review"].includes(r.status));
    lines.push(`PDB reports: ${stale.length} out of date, ${pending.length} waiting on review.`);
  }

  // ── Carrier setup ──
  const carriers = (carriersRes.data ?? []) as any[];
  if (carriers.length) {
    const noMethod = carriers.filter((c) => (c.org_carrier_methods ?? []).length === 0);
    lines.push(
      `Carriers: ${carriers.length} set up${noMethod.length ? `, ${noMethod.length} with no submission method recorded (${noMethod.slice(0, 6).map((c) => c.carriers?.name ?? "carrier").join(", ")})` : ""}.`,
    );
  }

  // ── Today ──
  const tasks = (tasksRes.data ?? []) as any[];
  const overdueTasks = tasks.filter((t) => t.due_date && t.due_date < todayIso);
  if (tasks.length) {
    lines.push(
      `Tasks: ${tasks.length} open${overdueTasks.length ? `, ${overdueTasks.length} overdue` : ""}.` +
        (overdueTasks.length ? ` Overdue: ${overdueTasks.slice(0, 5).map((t) => t.title).join("; ")}.` : ""),
    );
  }

  return lines.length > 2 ? lines.join("\n") : NOTHING_STAFF;
}

/** The instructions, with the picture above folded in. */
export function novaSystemPrompt(context: string, audience: NovaAudience = "agent"): string {
  if (audience === "staff") {
    return [
      "You are Nova, the assistant inside Agent Cloud — a platform life insurance agencies use to run their business.",
      "",
      "You are talking to a back-office staff member who runs contracting and licensing for their agency.",
      "They do not sell, have no book of business and no commissions of their own. They work a queue.",
      "Here is what is on it:",
      "",
      context,
      "",
      "How to answer:",
      "- Use the numbers above when they are relevant. Say them plainly, and name agents and carriers.",
      "- If something is not in the picture above, say you cannot see it rather than guessing. You do not have live lookup.",
      "- Be concrete and short. Somebody working a queue wants the next action, not an essay.",
      "- You may help with: what to work next, chasing carriers, licence renewals and PDB cadence, what a request is",
      "  waiting on, drafting an email to a carrier or an agent, and explaining a contracting status.",
      "- Do not offer sales coaching, objection handling or prospecting plans. That is not this person's job.",
      "- Never invent a writing number, a carrier rule, a comp level, a licence date or a request status.",
    ].join("\n");
  }

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
