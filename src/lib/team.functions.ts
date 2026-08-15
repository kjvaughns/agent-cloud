import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  complianceLevel, daysSince, lifecycleStage, riskFlags,
  type AgentFacts, type ComplianceLevel, type LifecycleStage, type RiskFlag,
} from "@/lib/team-roster";
import { rollUpDownline, ZERO, type Tally } from "@/lib/team/production";
import { inWindow, tallyByAgent } from "@/lib/production/source";

export type TeamAgent = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  upline_id: string | null;
  status: string;
  last_active_at: string | null;
  created_at: string;
  depth_level: number;
  contracts_count: number;
  policies_count: number;
  premium_total: number;
  completion_pct: number;
  missing: string[];
};

export type TeamKpis = {
  total: number;
  direct: number;
  active: number;
  pending: number;
  active_writers: number;
  contracts_total: number;
  contracts_active_pct: number;
  max_depth: number;
  depth_distribution: { level: number; count: number }[];
};

export type TeamAlerts = {
  stale: { id: string; name: string }[];
  lapse: { id: string; name: string }[];
  stuck_contracts: { id: string; agent: string }[];
};

const EMPTY_KPIS: TeamKpis = { total: 0, direct: 0, active: 0, pending: 0, active_writers: 0, contracts_total: 0, contracts_active_pct: 0, max_depth: 0, depth_distribution: [] };
const EMPTY_ALERTS: TeamAlerts = { stale: [], lapse: [], stuck_contracts: [] };

export const getTeamDownline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fullCompany?: boolean } | undefined) =>
    z.object({ fullCompany: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // Default scope: caller's own downline (everyone, including admins).
    // Admins can opt into full-company view via { fullCompany: true }.
    if (data.fullCompany) {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .in("role", ["admin", "manager"])
        .maybeSingle();
      if (roleRow) {
        const { data: root } = await supabase
          .from("profiles")
          .select("id")
          .is("upline_id", null)
          .maybeSingle();
        if (root?.id) {
          const { data: allData } = await supabase.rpc("get_team_downline_for", { p_root_id: root.id });
          // RPC returns jsonb rows; map into TeamAgent shape with safe defaults
          const rows = (allData ?? []) as any[];
          return rows.map((r: any) => ({
            ...r,
            depth_level: r.depth_level ?? 0,
            contracts_count: r.contracts_count ?? 0,
            policies_count: r.policies_count ?? 0,
            premium_total: r.premium_total ?? 0,
            completion_pct: r.completion_pct ?? 0,
            missing: r.missing ?? [],
          })) as TeamAgent[];
        }
      }
    }

    const { data: rpcData, error } = await supabase.rpc("get_team_downline");
    if (error) console.error("[team] get_team_downline:", error.message);
    return (rpcData ?? []) as TeamAgent[];
  });


export type RosterAgent = TeamAgent & {
  stage: LifecycleStage;
  compliance: ComplianceLevel;
  flags: RiskFlag[];
  active_carriers: number;
  days_since_sale: number | null;
  /** The catalog position they hold, null while unassigned. */
  agency_level_id: string | null;
  position_name: string | null;
  position_pct: number | null;
  /** Production inside the requested range. Own is theirs; team is downline-only. */
  own: Tally;
  team: Tally;
  /**
   * Live retention exposure — NOT debt. Per-agent debt needs a carrier
   * debt-report ingestion this product does not have, and a $0 "Debt" column
   * with nothing behind it would read as "nobody owes anything", which is a
   * wrong answer rather than a missing one.
   *
   * `premium_at_risk` on retention_cases is MONTHLY premium, so this number is
   * deliberately not comparable with the annualised production columns; the UI
   * labels it per month.
   */
  at_risk_monthly: number;
  at_risk_cases: number;
  /** True on the caller's own row, which the downline RPC never returns. */
  is_self?: boolean;
};


/**
 * The roster, with the two things the RPC does not carry.
 *
 * `get_team_downline` already returns contracts_count, policies_count,
 * premium_total, completion_pct and missing[] — most of what a useful row needs
 * was on the wire all along, and nothing rendered it. What is missing is
 * compliance (licence and E&O expiry) and when they last submitted.
 *
 * Gathered as one batched query per signal over all agents at once. Deliberately
 * NOT `getAgentOnboarding` in a loop: that is one round trip per agent and eight
 * queries inside each, which on a fifty-agent roster is four hundred queries to
 * paint a list.
 */
export const getTeamRoster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fullCompany?: boolean; rangeStart?: string | null; rangeEnd?: string | null } | undefined) =>
    z.object({
      fullCompany: z.boolean().optional(),
      // Null on either side is an open bound; both null is all time.
      rangeStart: z.string().nullable().optional(),
      rangeEnd: z.string().nullable().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // `get_team_downline_for` returns SETOF jsonb — raw profile rows plus a
    // depth, with none of the aggregate columns `get_team_downline` provides.
    // It also raises 'forbidden' for anyone who is not an admin or manager. So
    // the full-company branch degrades: every agent reads as zero policies and
    // zero premium, which would silently misclassify their lifecycle stage.
    //
    // Rather than present that as real data, the branch falls back to the
    // caller's own downline, which is complete. Nothing in the UI passes
    // `fullCompany` today; this keeps it honest for whenever something does.
    const { data: rows, error } = data.fullCompany
      ? await supabase.rpc("get_team_downline_for", { p_root_id: userId })
      : await supabase.rpc("get_team_downline");

    let source = rows;
    if (error || (data.fullCompany && (rows ?? []).some((r: any) => r?.policies_count === undefined))) {
      const { data: own, error: ownErr } = await supabase.rpc("get_team_downline");
      if (ownErr) throw new Error(ownErr.message);
      source = own;
    }

    const downlineAgents = (source ?? []) as TeamAgent[];

    // The caller's own row. `get_team_downline` starts at the children of
    // auth.uid(), so an agency owner never appeared on their own roster and had
    // nowhere to read or set their own position. Included as depth 0 and
    // flagged, so the UI can label it and the team roll-up can treat it as the
    // root of the tree.
    const { data: me } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, upline_id, status, last_active_at, created_at")
      .eq("id", userId)
      .maybeSingle();

    const selfAgent: TeamAgent | null = me
      ? {
          ...(me as any),
          depth_level: 0,
          contracts_count: 0,
          policies_count: 0,
          premium_total: 0,
          completion_pct: 0,
          missing: [],
          is_self: true,
        }
      : null;

    const agents = selfAgent ? [selfAgent, ...downlineAgents] : downlineAgents;
    const ids = agents.map((a) => a.id);
    if (ids.length === 0) return { rows: [] as RosterAgent[] };


    const today = new Date().toISOString().slice(0, 10);

    const [licences, docs, policies, contracts, placements, retention] = await Promise.all([
      supabase.from("state_licenses")
        .select("agent_id, expires_date, status").in("agent_id", ids),
      // Both spellings. `eo` predates `eo_certificate` and the vocabulary
      // migration deliberately left it alone, so a reader that checks only one
      // reports every legacy agent as having no E&O at all.
      supabase.from("producer_documents")
        .select("agent_id, doc_type, expiration_date")
        .in("agent_id", ids).in("doc_type", ["eo", "eo_certificate"]),
      // `*` rather than a column list: `production_date` arrives with
      // 20260814250000, and naming a column PostgREST does not know yet fails
      // the whole select with 42703 — which would empty the roster's
      // production column rather than degrade it. The windowing happens in
      // TypeScript here, and `productionDate()` already falls back to
      // `posted_at` for a row that has no production date yet.
      supabase.from("policies")
        .select("*").in("agent_id", ids)
        .order("posted_at", { ascending: false }),
      supabase.from("contract_requests")
        .select("agent_id, status, activated_at, requested_at").in("agent_id", ids),
      // `get_team_downline` does not carry the position, and the roster is
      // where positions are read and assigned, so it comes from profiles.
      supabase.from("profiles").select("id, agency_level_id").in("id", ids),
      // Live retention exposure per agent. Open and working only — a saved or
      // lost case is history, not a number anybody should be chasing today.
      supabase.from("retention_cases")
        .select("agent_id, premium_at_risk, status").in("agent_id", ids)
        .in("status", ["open", "working"]),
    ]);

    // Resolve only the positions actually in use. The full catalog is a
    // separate concern — the assignment picker asks listAgencyLevels for it —
    // and loading every position to label a handful would be wasted work.
    const levelIds = Array.from(new Set(
      ((placements.data ?? []) as any[]).map((p) => p.agency_level_id).filter(Boolean),
    ));
    const { data: levelRows } = levelIds.length
      ? await (supabase as any).from("agency_levels").select("id, name, base_pct").in("id", levelIds)
      : { data: [] };
    const levelById = new Map<string, { name: string; base_pct: number }>(
      ((levelRows ?? []) as any[]).map((l) => [l.id, { name: l.name, base_pct: Number(l.base_pct) }]),
    );
    const placedAt = new Map<string, string | null>(
      ((placements.data ?? []) as any[]).map((p) => [p.id, p.agency_level_id ?? null]),
    );

    const nextLicence = new Map<string, string>();
    const liveLicences = new Map<string, number>();
    for (const l of (licences.data ?? []) as any[]) {
      if (l.status === "expired" || l.status === "lapsed") continue;
      if (l.expires_date && l.expires_date < today) continue;
      liveLicences.set(l.agent_id, (liveLicences.get(l.agent_id) ?? 0) + 1);
      if (!l.expires_date) continue;
      const held = nextLicence.get(l.agent_id);
      // Soonest expiry, because that is the one that will bite first.
      if (!held || l.expires_date < held) nextLicence.set(l.agent_id, l.expires_date);
    }

    const eoExpiry = new Map<string, string>();
    const eoPresent = new Set<string>();
    for (const d of (docs.data ?? []) as any[]) {
      eoPresent.add(d.agent_id);
      if (!d.expiration_date) continue;
      const held = eoExpiry.get(d.agent_id);
      // Furthest out, because a renewed certificate supersedes the old one and
      // the old row is usually still sitting there.
      if (!held || d.expiration_date > held) eoExpiry.set(d.agent_id, d.expiration_date);
    }

    const lastSale = new Map<string, string>();
    for (const p of (policies.data ?? []) as any[]) {
      if (!p.posted_at) continue;
      if (!lastSale.has(p.agent_id)) lastSale.set(p.agent_id, p.posted_at);
    }

    const activeCarriers = new Map<string, number>();
    const firstContracted = new Map<string, string>();
    for (const c of (contracts.data ?? []) as any[]) {
      if (c.status !== "active") continue;
      activeCarriers.set(c.agent_id, (activeCarriers.get(c.agent_id) ?? 0) + 1);
      const when = c.activated_at ?? c.requested_at;
      if (!when) continue;
      const held = firstContracted.get(c.agent_id);
      if (!held || when < held) firstContracted.set(c.agent_id, when);
    }

    // Own production inside the range, from the same rows the last-sale scan
    // already walks — through the shared source, so the roster gets the same
    // date column, the same status rule and the same placed premium as
    // get_dashboard_metrics and the leaderboard. Summing it here by hand is
    // how the roster used to be able to disagree with both.
    const ownTally = tallyByAgent(
      ((policies.data ?? []) as any[]).filter((p) =>
        inWindow(p, data.rangeStart ?? null, data.rangeEnd ?? null),
      ),
    );
    const teamTally = rollUpDownline(
      agents.map((a) => ({ id: a.id, upline_id: a.upline_id })),
      ownTally,
    );

    const atRisk = new Map<string, { monthly: number; cases: number }>();
    for (const r of (retention.data ?? []) as any[]) {
      const held = atRisk.get(r.agent_id) ?? { monthly: 0, cases: 0 };
      held.monthly += Number(r.premium_at_risk ?? 0);
      held.cases += 1;
      atRisk.set(r.agent_id, held);
    }

    const now = Date.now();
    return {
      rows: agents.map((a): RosterAgent => {
        const facts: AgentFacts = {
          status: a.status,
          liveLicences: liveLicences.get(a.id) ?? 0,
          nextLicenceExpiry: nextLicence.get(a.id) ?? null,
          eoExpiry: eoExpiry.get(a.id) ?? null,
          eoPresent: eoPresent.has(a.id),
          activeCarriers: activeCarriers.get(a.id) ?? 0,
          policiesCount: Number(a.policies_count ?? 0),
          lastSaleAt: lastSale.get(a.id) ?? null,
          firstContractedAt: firstContracted.get(a.id) ?? null,
          // Persistency is a per-agent computation over the whole book and is
          // not worth 50 extra round trips to paint a list. The Risk tab on the
          // agent page is where it belongs; this leaves the flag unfired rather
          // than guessing at it.
          persistencyPct: null,
        };
        const flags = riskFlags(facts, now);
        const levelId = placedAt.get(a.id) ?? null;
        const level = levelId ? levelById.get(levelId) ?? null : null;
        return {
          ...a,
          stage: lifecycleStage(facts, flags),
          compliance: complianceLevel(facts, now),
          flags,
          active_carriers: facts.activeCarriers,
          days_since_sale: daysSince(facts.lastSaleAt, now),
          agency_level_id: levelId,
          position_name: level?.name ?? null,
          position_pct: level ? level.base_pct : null,
          own: ownTally.get(a.id) ?? ZERO,
          team: teamTally.get(a.id) ?? ZERO,
          at_risk_monthly: atRisk.get(a.id)?.monthly ?? 0,
          at_risk_cases: atRisk.get(a.id)?.cases ?? 0,
        };
      }),
    };
  });

export const getTeamKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_team_kpis");
    if (error) console.error("[team] get_team_kpis:", error.message);
    return (data ?? EMPTY_KPIS) as TeamKpis;
  });

export const getTeamAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_team_alerts");
    if (error) console.error("[team] get_team_alerts:", error.message);
    return (data ?? EMPTY_ALERTS) as TeamAlerts;
  });

export const sendAgentReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string }) => z.object({ agentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("send_team_reminder", { _target: data.agentId });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; reason?: string };
  });

export const getAgentDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string }) => z.object({ agentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [profile, contracts, policies] = await Promise.all([
      supabase.from("profiles").select("id, first_name, last_name, email, phone, created_at, upline_id, status, last_active_at").eq("id", data.agentId).maybeSingle(),
      supabase.from("agent_commission_levels").select("carrier_id, assigned_pct, commission_level, carriers(name)").eq("agent_id", data.agentId),
      supabase.from("policies").select("id, status, annual_premium, monthly_premium, posted_at, product, carriers(name)").eq("agent_id", data.agentId).order("posted_at", { ascending: false }).limit(50),
    ]);
    if (profile.error) throw new Error(profile.error.message);
    const pols = policies.data ?? [];
    const breakdown = {
      total: pols.length,
      active: pols.filter((p) => p.status === "active").length,
      lapsed: pols.filter((p) => String(p.status).startsWith("lapse")).length,
      in_review: pols.filter((p) => p.status === "in_review").length,
      premium: pols.reduce((s, p) => s + Number(p.annual_premium ?? 0), 0),
    };
    return {
      profile: profile.data,
      contracts: contracts.data ?? [],
      breakdown,
      recent: pols.slice(0, 5),
    };
  });

// `deactivateAgent` was here. Its only caller was `AgentDetailDrawer` in
// team.tsx, which is defined and never rendered — team.tsx renders
// `AgentProfileDrawer` instead. It wrote `status: 'terminated'` directly with
// no row-count check and no membership sync, so it was a second, worse path to
// the same thing. Deleted rather than fixed; `setAgentStatus` is the one path.

/**
 * Whether the caller still has access to their agency.
 *
 * The security boundary is the database — `my_org_ids()` reads
 * `organization_memberships`, and `set_agent_status` archives the membership.
 * This exists so a revoked agent is *told* rather than shown a working-looking
 * app full of empty tables.
 *
 * Deliberately not in `auth-middleware.ts`: that file is generated, and a check
 * placed there would be silently lost the next time it is regenerated.
 */
export const getAccessState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase
      .from("profiles").select("status").eq("id", userId).maybeSingle();
    const status = String(data?.status ?? "active");
    return {
      revoked: status === "inactive" || status === "terminated",
      status,
    };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "manager"])
      .maybeSingle();
    return { isAdmin: !!data };
  });

export const getAllAgentsForHierarchy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "manager"])
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, upline_id")
      .order("first_name");
    return (data ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null; upline_id: string | null }[];
  });

export const setAgentHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string; hidden: boolean }) =>
    z.object({ agentId: z.string().uuid(), hidden: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // .select("id") for the same reason as everywhere else: an RLS-filtered
    // update matches nothing, is not an error, and used to report success.
    const { data: touched, error } = await context.supabase
      .from("profiles")
      .update({ is_hidden: data.hidden })
      .eq("id", data.agentId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!touched?.length) {
      throw new Error("You don't have permission to change that agent.");
    }
    return { ok: true };
  });

/**
 * The single write path for an agent's access.
 *
 * Replaces `setAgentTerminated`, which wrote `profiles.status` on the RLS
 * client and stopped there. Three things were wrong with that:
 *
 *   It never touched `organization_memberships`, which is what `my_org_ids()`
 *   reads — so termination revoked nothing at all.
 *
 *   It had no row-count check, and `profiles_org_manage` only admits the org
 *   owner while the drawer's `isAdmin` also admits managers. A manager clicking
 *   "Mark Terminated" got a success toast and zero rows changed.
 *
 *   Reinstating set `status: 'active'` unconditionally, which would promote an
 *   `imported` placeholder into a full agent.
 *
 * `set_agent_status` does both stores in one transaction, refuses to revoke the
 * agency owner (the org policies are conjunctive, so revoking an owner locks
 * them out of their own agency), and returns a row count.
 */
/**
 * Put an agent on a position from the agency's catalog, or take them off it.
 *
 * The catalog is configuration (Settings ▸ Levels & Positions); this is the
 * assignment, which is daily work and belongs on the roster.
 *
 * Both ends are checked against the caller's own organisation before anything
 * is written: an agent id from another agency, or a position id from another
 * agency, are both refusals rather than writes. The update then asserts its
 * row count, because RLS on `profiles` grants updates on the org-OWNER branch
 * only — narrower than the `is_org_admin` that may edit the catalog — so an
 * admin who can create a position may still be refused when assigning one.
 * Without the assert that refusal returns silently and the UI claims success.
 */
export const setAgentPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string; agencyLevelId: string | null }) =>
    z.object({
      agentId: z.string().uuid(),
      /** Null clears the position, putting them back in the pending queue. */
      agencyLevelId: z.string().uuid().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: me } = await supabase
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    const orgId = me?.organization_id;
    if (!orgId) throw new Error("You are not in an agency.");

    const { data: agent } = await supabase
      .from("profiles").select("id, organization_id").eq("id", data.agentId).maybeSingle();
    if (!agent || agent.organization_id !== orgId) {
      throw new Error("That agent is not in your agency.");
    }

    if (data.agencyLevelId) {
      const { data: level } = await (supabase as any)
        .from("agency_levels").select("id")
        .eq("id", data.agencyLevelId).eq("organization_id", orgId).maybeSingle();
      if (!level) throw new Error("That position is not one of your agency's.");
    }

    const { data: touched, error } = await supabase
      .from("profiles")
      .update({ agency_level_id: data.agencyLevelId })
      .eq("id", data.agentId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!touched?.length) {
      throw new Error("Only the agency owner can change an agent's position.");
    }
    return { ok: true as const };
  });

export const setAgentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string; status: "active" | "inactive" | "terminated" }) =>
    z.object({
      agentId: z.string().uuid(),
      status: z.enum(["active", "inactive", "terminated"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Cast: the generated DB types predate this RPC. Same pattern as the other
    // contracting-ops modules, which cast until types are regenerated.
    const { data: count, error } = await (context.supabase as any).rpc("set_agent_status", {
      _agent: data.agentId,
      _status: data.status,
    });

    // 42883 / PGRST202: the migration has not been applied yet. Migrations here
    // are applied by hand, so code always ships first. Fall back to the old
    // direct write — which is exactly today's behaviour, no worse — rather than
    // failing the call outright.
    if (error && (error.code === "42883" || error.code === "PGRST202")) {
      const patch = data.status === "terminated"
        ? { status: "terminated", terminated_at: new Date().toISOString() }
        : { status: data.status, terminated_at: null };
      const { data: touched, error: fallbackErr } = await context.supabase
        .from("profiles").update(patch).eq("id", data.agentId).select("id");
      if (fallbackErr) throw new Error(fallbackErr.message);
      if (!touched?.length) {
        throw new Error("Only the agency owner can change an agent's status.");
      }
      return { ok: true, revoked: false as const };
    }

    if (error) throw new Error(error.message);
    if (!count) throw new Error("That agent is no longer in your agency.");
    return { ok: true, revoked: data.status !== "active" };
  });
