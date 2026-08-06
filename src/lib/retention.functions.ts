import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scopeSchema, type Scope } from "@/lib/scope";
import { resolveScopeAgentIds } from "@/lib/scope.functions";

type Ctx = { supabase: any; userId: string };

/**
 * Retention queue.
 *
 * Reads through the RLS-bound client throughout, so retention_cases' policy
 * decides visibility — the writing agent, the assignee, an org owner, or a
 * manager over their downline.
 */

export type RetentionCase = {
  id: string;
  policy_id: string;
  agent_id: string;
  assigned_to: string | null;
  risk_reason: string;
  risk_score: number;
  status: "open" | "working" | "saved" | "lost" | "no_action";
  outcome_note: string | null;
  premium_at_risk: number | null;
  opened_at: string;
  contacted_at: string | null;
  resolved_at: string | null;
  policy_number?: string | null;
  client_name?: string | null;
  agent_name?: string | null;
  assignee_name?: string | null;
};

const SELECT =
  "id, policy_id, agent_id, assigned_to, risk_reason, risk_score, status, outcome_note, premium_at_risk, opened_at, contacted_at, resolved_at";

/**
 * Restrict a retention query to the agents a scope covers.
 *
 * Explicitly, rather than dropping the filter and letting the RLS policy
 * decide — for an org owner "no filter" quietly means the whole agency, which
 * would make their Team view and their Agency view the same rows under
 * different labels.
 */
async function narrowByScope(supabase: any, q: any, userId: string, scope: Scope) {
  if (scope === "mine") return q.eq("agent_id", userId);
  return q.in("agent_id", await resolveScopeAgentIds(supabase, scope));
}

export const listRetentionCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.enum(["all", "live", "open", "working", "saved", "lost", "no_action"]).default("live"),
      assigned: z.enum(["all", "me", "unassigned"]).default("all"),
      scope: scopeSchema.default("mine"),
    }).parse(d ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    let q = supabase.from("retention_cases").select(SELECT).limit(300);

    // Narrowed on agent_id — who wrote the policy — and never on assigned_to.
    // The page already has its own assigned filter; if scope narrowed on the
    // same column the two controls would mean the same thing in one
    // combination and different things in another.
    q = await narrowByScope(supabase, q, userId, data.scope);

    if (data.status === "live") q = q.in("status", ["open", "working"]);
    else if (data.status !== "all") q = q.eq("status", data.status);

    if (data.assigned === "me") q = q.eq("assigned_to", userId);
    if (data.assigned === "unassigned") q = q.is("assigned_to", null);

    q = q.order("risk_score", { ascending: false }).order("opened_at", { ascending: true });

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const cases = (rows ?? []) as RetentionCase[];
    if (cases.length === 0) return { cases: [] };

    // Decorate with policy, client and people names.
    const policyIds = Array.from(new Set(cases.map((c) => c.policy_id)));
    const personIds = Array.from(new Set(cases.flatMap((c) => [c.agent_id, c.assigned_to]).filter(Boolean) as string[]));

    const [{ data: policies }, { data: people }] = await Promise.all([
      supabase.from("policies")
        .select("id, policy_number, monthly_premium, clients(first_name, last_name)")
        .in("id", policyIds),
      supabase.from("profiles").select("id, first_name, last_name").in("id", personIds),
    ]);

    const polById = new Map((policies ?? []).map((p: any) => [p.id, p]));
    const nameById = new Map<string, string>(
      (people ?? []).map((p: any) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]),
    );

    return {
      cases: cases.map((c) => {
        const p: any = polById.get(c.policy_id);
        const cl = p?.clients;
        return {
          ...c,
          policy_number: p?.policy_number ?? null,
          client_name: cl ? `${cl.first_name ?? ""} ${cl.last_name ?? ""}`.trim() : null,
          agent_name: nameById.get(c.agent_id) ?? null,
          assignee_name: c.assigned_to ? (nameById.get(c.assigned_to) ?? null) : null,
        };
      }),
    };
  });

export const getRetentionStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ scope: scopeSchema.default("mine") }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    // Same scope as the list below it, or the tiles describe a different set
    // of cases than the rows they sit above.
    const { data: rows, error } = await narrowByScope(
      supabase,
      supabase.from("retention_cases").select("status, premium_at_risk, resolved_at"),
      userId,
      data.scope,
    );
    if (error) return { live: 0, atRisk: 0, saved: 0, lost: 0, saveRate: null as number | null };

    const all = rows ?? [];
    const live = all.filter((c: any) => c.status === "open" || c.status === "working");
    const saved = all.filter((c: any) => c.status === "saved").length;
    const lost = all.filter((c: any) => c.status === "lost").length;
    const decided = saved + lost;

    return {
      live: live.length,
      atRisk: live.reduce((a: number, c: any) => a + Number(c.premium_at_risk ?? 0), 0),
      saved,
      lost,
      saveRate: decided > 0 ? saved / decided : null,
    };
  });

/** Opens a case for every at-risk policy that does not already have a live one. */
export const syncRetentionCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase.rpc("sync_retention_cases", { _org: null });
    if (error) throw new Error(error.message);
    return { opened: Number(data ?? 0) };
  });

export const updateRetentionCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["open", "working", "saved", "lost", "no_action"]).optional(),
      assigned_to: z.string().uuid().nullable().optional(),
      outcome_note: z.string().trim().max(1000).nullable().optional(),
      markContacted: z.boolean().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { id, markContacted, ...rest } = data;

    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    );
    if (markContacted) patch.contacted_at = new Date().toISOString();
    if (Object.keys(patch).length === 0) return { ok: true };

    // resolved_at and updated_at are handled by touch_retention_case.
    const { error } = await supabase.from("retention_cases").update(patch).eq("id", id);
    if (error) throw new Error(error.message);

    if (rest.assigned_to) {
      const { data: row } = await supabase
        .from("retention_cases")
        .select("client_name, reason")
        .eq("id", id)
        .maybeSingle();
      const { queueEmail, APP_ORIGIN } = await import("@/lib/email/send.server");
      await queueEmail({
        template: "retention-case-assigned",
        profileId: rest.assigned_to,
        category: "policy_at_risk",
        key: `retention-assigned:${id}:${rest.assigned_to}`,
        data: {
          clientName: (row as any)?.client_name ?? undefined,
          reason: (row as any)?.reason ?? undefined,
          appUrl: `${APP_ORIGIN}/retention`,
        },
      });
    }

    return { ok: true };

  });

// ── Placement and persistency ───────────────────────────────────────────────

export type PersistencyBand = {
  months: 4 | 7 | 13;
  /** Policies old enough to be measured at this duration. */
  eligible: number;
  /** Of those, how many are still in force. */
  inForce: number;
  pct: number | null;
};

export type PlacementStats = {
  submitted: number;
  placed: number;
  placementPct: number | null;
  activated: number;
  activationPct: number | null;
  persistency: PersistencyBand[];
};

/** Still paying: active, or issued and awaiting first draft. */
const IN_FORCE = ["active", "issued_not_paid"];
/** Reached the carrier and got a decision one way or the other. */
const DECIDED = [
  "active", "issued_not_paid", "lapse_pending", "lapsed",
  "cancelled", "withdrawn", "not_taken", "postponed",
];

/**
 * Placement, activation and 4 / 7 / 13-month persistency.
 *
 * Persistency is measured the way carriers do it: of the policies that have
 * *had the chance* to reach a duration, what share are still in force. A
 * policy written last month is not counted against 13-month persistency —
 * including it would drag the number down for no reason other than the
 * business being new.
 *
 * A band with no eligible policies returns null rather than 0%, so an agency
 * without 13 months of history sees "—" instead of a number implying total
 * failure.
 */
export const getPersistency = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;

    const { data: rows, error } = await supabase
      .from("policies")
      .select("status, effective_date, posted_at")
      .limit(20000);

    if (error) {
      return {
        submitted: 0, placed: 0, placementPct: null,
        activated: 0, activationPct: null,
        persistency: [4, 7, 13].map((m) => ({ months: m as 4 | 7 | 13, eligible: 0, inForce: 0, pct: null })),
      } as PlacementStats;
    }

    const all = rows ?? [];
    const decided = all.filter((p: any) => DECIDED.includes(p.status));
    const placed = all.filter((p: any) => IN_FORCE.includes(p.status)).length;
    // Activated = actually paid at least once, so issued_not_paid is excluded.
    const activated = all.filter((p: any) => p.status === "active").length;

    const now = Date.now();
    const monthsSince = (iso: string | null) => {
      if (!iso) return null;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      return (now - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    };

    const persistency = ([4, 7, 13] as const).map((months) => {
      // Only policies written at least `months` ago can be judged at `months`.
      const eligible = all.filter((p: any) => {
        const age = monthsSince(p.effective_date ?? p.posted_at);
        return age !== null && age >= months && DECIDED.includes(p.status);
      });
      const inForce = eligible.filter((p: any) => IN_FORCE.includes(p.status)).length;
      return {
        months,
        eligible: eligible.length,
        inForce,
        pct: eligible.length > 0 ? (inForce / eligible.length) * 100 : null,
      };
    });

    return {
      submitted: decided.length,
      placed,
      placementPct: decided.length > 0 ? (placed / decided.length) * 100 : null,
      activated,
      activationPct: decided.length > 0 ? (activated / decided.length) * 100 : null,
      persistency,
    } as PlacementStats;
  });

// ── The predictive scan ────────────────────────────────────────────────────

/**
 * Score the in-force book for lapse risk.
 *
 * `sync_retention_cases` surfaces policies already in `lapse_pending` or
 * `nsf` — a list of failures. This scores the ones that have not failed yet,
 * which is the whole point: by the time a draft has bounced the conversation
 * is a rescue, and the month before it is where the save is.
 *
 * Deterministic, in `lapse-risk.ts`, with a check script. Deliberately not a
 * model: `getPolicyAiInsight` already asks an LLM for a "score: 0-100" per
 * policy, which costs one call per row, gives two different answers for the
 * same policy on two runs, and cannot be argued with. A ranked call list has
 * to be reproducible or nobody trusts it twice.
 *
 * Read-only. Nothing is written to `retention_cases` from the scan itself —
 * scoring a book should not fill somebody's queue. `createTasksForLapseRisk`
 * below is the action, and it now also opens a case per policy it acts on with
 * `risk_reason = 'predicted'`, which the CHECK constraint accepts as of
 * `20260805...`; before that the closest value, `manual`, would have been a lie
 * about where the row came from.

 */
export const scanLapseRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      scope: scopeSchema.default("mine"),
      band: z.enum(["watch", "high"]).default("watch"),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    // Gated. One free run on the agent's own book, because the output is the
    // argument — a ranked list of their own clients beats any description of
    // one. The run is recorded AFTER the scan produces something, so a scan
    // that fell over on a database error does not cost somebody their look.
    const { checkAccess, recordTrialRun } = await import("@/lib/nova-gate.functions");
    const access = await checkAccess(supabase, userId, "lapse_scan");
    if (!access.allowed) {
      return { queue: [], scanned: 0, missing: [] as any[], access };
    }

    const agentIds = data.scope === "mine"
      ? [userId]
      : await resolveScopeAgentIds(supabase, data.scope);
    if (!agentIds.length) return { queue: [], scanned: 0, missing: [] as any[], access };

    // In force only. A policy already lapse_pending is the existing sweep's
    // job, and listing it here would put the same policy in two queues with
    // two different scores.
    const { data: policies } = await supabase
      .from("policies")
      .select("id, client_id, agent_id, monthly_premium, face_amount, effective_date, premium_mode, policy_number, clients(first_name, last_name)")
      .in("agent_id", agentIds)
      .eq("status", "active")
      .limit(4000);

    const rows = (policies ?? []) as any[];
    if (!rows.length) return { queue: [], scanned: 0, missing: [] as any[], access };

    // Last logged contact per client, in one pass rather than per policy.
    const clientIds = [...new Set(rows.map((p) => p.client_id).filter(Boolean))];
    const lastContact = new Map<string, string>();
    for (let i = 0; i < clientIds.length; i += 500) {
      const { data: contacts } = await supabase
        .from("contact_history")
        .select("client_id, created_at")
        .in("client_id", clientIds.slice(i, i + 500))
        .order("created_at", { ascending: false });
      for (const c of contacts ?? []) {
        // Ordered newest-first, so the first sighting of a client is theirs.
        if (!lastContact.has(c.client_id)) lastContact.set(c.client_id, c.created_at);
      }
    }

    const { scoreLapseRisk, rankLapseRisk, summarise, MISSING_SIGNALS } =
      await import("@/lib/lapse-risk");

    // One `asOf` for the whole scan, so two policies scored in the same run
    // cannot disagree about what day it is.
    const asOf = new Date().toISOString().slice(0, 10);

    const scored = rows.map((p) => {
      const name = p.clients
        ? `${p.clients.first_name ?? ""} ${p.clients.last_name ?? ""}`.trim() || null
        : null;
      const s = scoreLapseRisk({
        policyId: p.id,
        clientId: p.client_id ?? null,
        clientName: name,
        monthlyPremium: p.monthly_premium === null ? null : Number(p.monthly_premium),
        faceAmount: p.face_amount === null ? null : Number(p.face_amount),
        effectiveDate: p.effective_date ?? null,
        premiumMode: p.premium_mode ?? null,
        lastContactAt: p.client_id ? lastContact.get(p.client_id) ?? null : null,
        asOf,
      });
      return {
        ...s,
        clientId: p.client_id ?? null,
        clientName: name,
        agentId: p.agent_id ?? null,
        policyNumber: p.policy_number ?? null,
        reason: summarise(s),
      };
    });

    const queue = rankLapseRisk(scored as any, { minBand: data.band })
      .map((s) => scored.find((x) => x.policyId === s.policyId)!);

    if (access.mode === "trial") await recordTrialRun(supabase, userId, "lapse_scan");

    return { queue, scanned: rows.length, missing: [...MISSING_SIGNALS], access };
  });

/**
 * Follow-up tasks for the top of the queue.
 *
 * The scan is re-run here rather than accepting a list from the client, for
 * the same reason the reconciliation findings are: otherwise a request could
 * put any sentence it liked, against any policy it liked, into somebody's task
 * list.
 *
 * Capped, and the cap is stated in what comes back. Turning a four-hundred
 * policy book into four hundred tasks is a way of burying the top twenty.
 */
export const createTasksForLapseRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      scope: scopeSchema.default("mine"),
      limit: z.number().int().min(1).max(50).default(20),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const { queue } = await (async () => {
      // Same computation, same guarantees. Kept inline rather than calling the
      // server function above, which would not carry the middleware context.
      const agentIds = data.scope === "mine"
        ? [userId]
        : await resolveScopeAgentIds(supabase, data.scope);
      if (!agentIds.length) return { queue: [] as any[] };

      const { data: policies } = await supabase
        .from("policies")
        .select("id, client_id, agent_id, monthly_premium, face_amount, effective_date, clients(first_name, last_name)")
        .in("agent_id", agentIds)
        .eq("status", "active")
        .limit(4000);
      const rows = (policies ?? []) as any[];
      if (!rows.length) return { queue: [] as any[] };

      const clientIds = [...new Set(rows.map((p) => p.client_id).filter(Boolean))];
      const lastContact = new Map<string, string>();
      for (let i = 0; i < clientIds.length; i += 500) {
        const { data: contacts } = await supabase
          .from("contact_history")
          .select("client_id, created_at")
          .in("client_id", clientIds.slice(i, i + 500))
          .order("created_at", { ascending: false });
        for (const c of contacts ?? []) {
          if (!lastContact.has(c.client_id)) lastContact.set(c.client_id, c.created_at);
        }
      }

      const { scoreLapseRisk, rankLapseRisk, summarise } = await import("@/lib/lapse-risk");
      const asOf = new Date().toISOString().slice(0, 10);
      const scored = rows.map((p) => {
        const name = p.clients
          ? `${p.clients.first_name ?? ""} ${p.clients.last_name ?? ""}`.trim() || null
          : null;
        const s = scoreLapseRisk({
          policyId: p.id, clientId: p.client_id ?? null, clientName: name,
          monthlyPremium: p.monthly_premium === null ? null : Number(p.monthly_premium),
          faceAmount: p.face_amount === null ? null : Number(p.face_amount),
          effectiveDate: p.effective_date ?? null,
          lastContactAt: p.client_id ? lastContact.get(p.client_id) ?? null : null,
          asOf,
        });
        return { ...s, clientId: p.client_id, clientName: name, reason: summarise(s), factors: s.factors };
      });
      return { queue: rankLapseRisk(scored as any, { minBand: "high" }).map((s) => scored.find((x) => x.policyId === s.policyId)!) };
    })();

    const top = queue.slice(0, data.limit);
    if (!top.length) return { created: 0, skipped: 0 };

    // A task per client, not per policy: two at-risk policies on one person is
    // one phone call, and two tasks would have the agent ring them twice.
    const seen = new Set<string>();
    const rows: any[] = [];
    for (const q of top) {
      const key = String(q.clientId ?? q.policyId);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        title: `Retention call: ${q.clientName ?? "unnamed client"}`,
        description:
          `Lapse risk ${q.score}/100 — ${q.reason}.\n\n` +
          q.factors.map((f: any) => `• ${f.detail}`).join("\n"),
        assigned_to: userId,
        created_by: userId,
        priority: "high",
        related_type: q.clientId ? "client" : "policy",
        related_id: q.clientId ?? q.policyId,
      });
    }

    const { error } = await supabase.from("tasks").insert(rows);
    if (error) throw new Error(error.message);
    return { created: rows.length, skipped: queue.length - rows.length };
  });
