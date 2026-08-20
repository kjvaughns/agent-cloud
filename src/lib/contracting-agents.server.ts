/**
 * Contracting, grouped by the person it is about.
 *
 * The requests list showed one row per carrier request, so an agent contracting
 * with five carriers appeared five times and the question staff actually ask —
 * "where is this agent up to?" — had to be reassembled by eye from five rows
 * scattered through the table. The primary object here is the agent; the carrier
 * requests stay separate records underneath, because each one has its own
 * status, writing number, advance, compensation and history and must never be
 * collapsed into one shared agent-level status.
 *
 * Grouping, filtering, searching, sorting and pagination all happen here rather
 * than in the browser: a large agency has thousands of requests and the previous
 * page loaded all of them into memory to filter client-side.
 */

import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import {
  REQUEST_STATUS_META, isAgentActionStatus, isLiveStatus, type RequestStatus,
} from "@/lib/contracting-ops/types";
import { resolveContractingAccess } from "@/lib/contracting-ops/access.server";

const supabaseAdmin = _admin as any;

/** Nothing beyond this is loaded in one pass; the org list is then paginated. */
const MAX_REQUEST_ROWS = 5000;

export type AgentSummary = {
  agent_id: string;
  agent_name: string;
  initials: string;
  npn: string | null;
  email: string | null;
  phone: string | null;
  upline_name: string | null;
  carrier_count: number;
  active_count: number;
  needs_attention: number;
  urgent_status: string;
  last_updated: string;
  carrier_names: string[];
  fully_contracted: boolean;
};

export type AgentListFilter =
  | "all" | "needs_attention" | "new_requests" | "fully_contracted"
  | RequestStatus;

export type AgentListSort =
  | "updated" | "newest" | "oldest" | "name" | "carriers" | "attention";

/**
 * Which single status best describes where the agent is right now.
 *
 * Never a status stored against the agent — there is no such thing. It is
 * computed from the individual carrier requests, most urgent first, so the list
 * can say something true in one column without inventing an agent-level state.
 */
const URGENCY_ORDER: RequestStatus[] = [
  "nigo", "additional_info_requested", "missing_information", "missing_documents",
  "awaiting_agent", "declined", "draft", "invite_sent", "awaiting_manager",
  "awaiting_owner_approval", "ready_to_submit", "assigned", "submitted",
  "carrier_reviewing", "approved", "writing_number_issued", "active", "cancelled", "closed",
];

function mostUrgent(statuses: string[]): string {
  for (const s of URGENCY_ORDER) if (statuses.includes(s)) return s;
  return statuses[0] ?? "draft";
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "")).toUpperCase();
}

function fullName(p: any): string {
  return `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
}

type RawRow = {
  id: string;
  agent_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  writing_number: string | null;
  profiles: any;
  upline: any;
  org_carriers: any;
};

async function loadOrgRequests(orgId: string): Promise<RawRow[]> {
  const { data, error } = await supabaseAdmin
    .from("contracting_requests")
    .select(`
      id, agent_id, status, created_at, updated_at, writing_number,
      profiles:agent_id ( id, first_name, last_name, email, phone, npn_number, upline_id ),
      upline:direct_upline_id ( id, first_name, last_name ),
      org_carriers ( id, carrier_id, carriers ( name ) )
    `)
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(MAX_REQUEST_ROWS);
  if (error) throw new Error(error.message);
  return (data ?? []) as RawRow[];
}

/**
 * The agent rows for the main page.
 *
 * `visibleAgentIds` is null for staff who see the whole agency, and a set for a
 * manager who only sees their downline — resolved by the caller, which knows
 * which of the two it is dealing with.
 */
export async function listAgentSummaries(args: {
  userId: string;
  search?: string;
  filter?: AgentListFilter;
  sort?: AgentListSort;
  page?: number;
  pageSize?: number;
}) {
  const access = await resolveContractingAccess(args.userId);
  if (!access.orgId || !access.canView) {
    return { access, rows: [] as AgentSummary[], total: 0, page: 1, pageSize: 50, counts: emptyCounts() };
  }

  const rows = await loadOrgRequests(access.orgId);

  // Uplines fall back to the agent's own profile link when the request never
  // named one — a request opened before hierarchy was captured still has a real
  // upline, it just is not on the row.
  const uplineIds = Array.from(new Set(
    rows.map((r) => r.profiles?.upline_id).filter(Boolean),
  )) as string[];
  const uplineNames = new Map<string, string>();
  if (uplineIds.length) {
    const { data: ups } = await supabaseAdmin
      .from("profiles").select("id, first_name, last_name").in("id", uplineIds);
    for (const u of ups ?? []) uplineNames.set(u.id, fullName(u) || "—");
  }

  const byAgent = new Map<string, { summary: AgentSummary; statuses: string[]; created: string[] }>();

  for (const r of rows) {
    const id = r.agent_id;
    if (!id) continue;
    const name = fullName(r.profiles) || "Unnamed agent";
    let entry = byAgent.get(id);
    if (!entry) {
      entry = {
        statuses: [],
        created: [],
        summary: {
          agent_id: id,
          agent_name: name,
          initials: initialsOf(name),
          npn: r.profiles?.npn_number ?? null,
          email: r.profiles?.email ?? null,
          phone: r.profiles?.phone ?? null,
          upline_name: fullName(r.upline) || uplineNames.get(r.profiles?.upline_id ?? "") || null,
          carrier_count: 0,
          active_count: 0,
          needs_attention: 0,
          urgent_status: "draft",
          last_updated: r.updated_at,
          carrier_names: [],
          fully_contracted: false,
        },
      };
      byAgent.set(id, entry);
    }
    const s = entry.summary;
    s.carrier_count += 1;
    if (isLiveStatus(r.status)) s.active_count += 1;
    if (isAgentActionStatus(r.status)) s.needs_attention += 1;
    if (r.updated_at > s.last_updated) s.last_updated = r.updated_at;
    const carrier = r.org_carriers?.carriers?.name;
    if (carrier && !s.carrier_names.includes(carrier)) s.carrier_names.push(carrier);
    entry.statuses.push(r.status);
    entry.created.push(r.created_at);
  }

  let all = Array.from(byAgent.values()).map((e) => {
    e.summary.urgent_status = mostUrgent(e.statuses);
    e.summary.fully_contracted =
      e.summary.carrier_count > 0 && e.summary.active_count === e.summary.carrier_count;
    return { ...e.summary, _statuses: e.statuses, _created: e.created.sort() };
  });

  const counts = summarize(all);

  // ── Filter ──
  const filter = args.filter ?? "all";
  if (filter === "needs_attention") all = all.filter((a) => a.needs_attention > 0);
  else if (filter === "fully_contracted") all = all.filter((a) => a.fully_contracted);
  else if (filter === "new_requests") all = all.filter((a) => a._statuses.includes("draft"));
  else if (filter !== "all") {
    // A display status folds several stored values onto one label, so filtering
    // by "Agent action needed" must match every value that reads that way.
    const label = REQUEST_STATUS_META[filter as RequestStatus]?.label;
    all = all.filter((a) => a._statuses.some((s) =>
      s === filter || (label && REQUEST_STATUS_META[s as RequestStatus]?.label === label)));
  }

  // ── Search: agent, NPN, email, phone, upline, carrier, writing number ──
  const q = args.search?.trim().toLowerCase();
  if (q) {
    const wnAgents = new Set(
      rows.filter((r) => (r.writing_number ?? "").toLowerCase().includes(q)).map((r) => r.agent_id),
    );
    const digits = q.replace(/\D/g, "");
    all = all.filter((a) =>
      a.agent_name.toLowerCase().includes(q) ||
      (a.npn ?? "").toLowerCase().includes(q) ||
      (a.email ?? "").toLowerCase().includes(q) ||
      (digits.length >= 4 && (a.phone ?? "").replace(/\D/g, "").includes(digits)) ||
      (a.upline_name ?? "").toLowerCase().includes(q) ||
      a.carrier_names.some((c) => c.toLowerCase().includes(q)) ||
      wnAgents.has(a.agent_id));
  }

  // ── Sort ──
  const sort = args.sort ?? "updated";
  all.sort((a, b) => {
    switch (sort) {
      case "name": return a.agent_name.localeCompare(b.agent_name);
      case "carriers": return b.carrier_count - a.carrier_count;
      case "attention": return b.needs_attention - a.needs_attention || b.last_updated.localeCompare(a.last_updated);
      case "newest": return (b._created[b._created.length - 1] ?? "").localeCompare(a._created[a._created.length - 1] ?? "");
      case "oldest": return (a._created[0] ?? "").localeCompare(b._created[0] ?? "");
      default: return b.last_updated.localeCompare(a.last_updated);
    }
  });

  const pageSize = Math.min(Math.max(args.pageSize ?? 50, 10), 100);
  const total = all.length;
  const page = Math.max(1, Math.min(args.page ?? 1, Math.max(1, Math.ceil(total / pageSize))));
  const slice = all.slice((page - 1) * pageSize, page * pageSize)
    .map(({ _statuses, _created, ...rest }) => rest);

  return { access, rows: slice as AgentSummary[], total, page, pageSize, counts };
}

function emptyCounts() {
  return {
    needs_attention: 0, new_requests: 0, waiting_on_agent: 0,
    waiting_on_carrier: 0, fully_contracted: 0, agents: 0,
  };
}

function summarize(all: { needs_attention: number; fully_contracted: boolean; _statuses: string[] }[]) {
  const c = emptyCounts();
  c.agents = all.length;
  for (const a of all) {
    if (a.needs_attention > 0) c.needs_attention += 1;
    if (a.fully_contracted) c.fully_contracted += 1;
    if (a._statuses.includes("draft")) c.new_requests += 1;
    if (a._statuses.some((s) => REQUEST_STATUS_META[s as RequestStatus]?.owner === "agent")) c.waiting_on_agent += 1;
    if (a._statuses.some((s) => REQUEST_STATUS_META[s as RequestStatus]?.owner === "carrier")) c.waiting_on_carrier += 1;
  }
  return c;
}

// ── The agent's workspace ───────────────────────────────────────────────────

export type WorkspaceRequest = {
  id: string;
  reference: string | null;
  carrier_name: string;
  carrier_id: string | null;
  org_carrier_id: string | null;
  status: string;
  writing_number: string | null;
  comp_level: string | null;
  comp_source: string | null;
  advance_option: string | null;
  /** The rung the carrier actually granted, when one has been recorded. */
  granted_comp_level_id: string | null;
  granted_level_name: string | null;
  granted_pct: number | null;
  /**
   * What this carrier actually offers, so the person recording a decision picks
   * from the carrier's own ladder instead of typing a level from memory.
   */
  comp_level_options: { id: string; level_name: string; commission_pct: number | null }[];
  agent_note: string | null;
  internal_note: string | null;
  next_action: string | null;
  updated_at: string;
  created_at: string;
  decline_reason: string | null;
};

export type AgentWorkspace = {
  agent: {
    id: string;
    name: string;
    initials: string;
    npn: string | null;
    email: string | null;
    phone: string | null;
    position_name: string | null;
    position_pct: number | null;
  };
  hierarchy: {
    upline_name: string | null;
    upline_npn: string | null;
    owner_name: string | null;
    owner_npn: string | null;
    path: string[];
  };
  requests: WorkspaceRequest[];
  progress: { active: number; total: number; needs_attention: number };
  last_updated: string | null;
};

/**
 * Everything one agent's contracting needs on one screen.
 *
 * The carrier requests stay individual records — each carries its own status,
 * writing number, level and advance, and changing one must not touch the other
 * four. The agent-level numbers above them are derived, never stored.
 */
export async function getAgentWorkspace(args: { userId: string; agentId: string }) {
  const access = await resolveContractingAccess(args.userId);
  if (!access.orgId || !access.canView) {
    throw new Error("You don't have access to contracting operations.");
  }
  const orgId = access.orgId;

  const [{ data: agent }, { data: org }, { data: rows, error: rowsError }] = await Promise.all([
    supabaseAdmin.from("profiles")
      .select("id, first_name, last_name, email, phone, npn_number, upline_id, agency_level_id, organization_id")
      .eq("id", args.agentId).maybeSingle(),
    supabaseAdmin.from("organizations").select("id, owner_id").eq("id", orgId).maybeSingle(),
    supabaseAdmin.from("contracting_requests")
      .select(`
        id, reference, status, writing_number, granted_advance_option,
        requested_advance_level, requested_comp_level_id, granted_comp_level_id,
        granted_level_name, granted_pct,
        decline_reason, created_at, updated_at, agent_id, organization_id,
        org_carriers ( id, carrier_id, carriers ( name ) )
      `)
      .eq("organization_id", orgId)
      .eq("agent_id", args.agentId)
      .order("created_at", { ascending: true }),
  ]);

  // Surfaced, not swallowed: a read that fails looks exactly like an agent with
  // no carrier requests, and "no requests" for somebody with five is the worst
  // possible thing for this screen to say.
  if (rowsError) throw new Error(rowsError.message);
  if (!agent) throw new Error("That agent is not available to you.");


  // Position and its headline percentage.
  let position_name: string | null = null;
  let position_pct: number | null = null;
  if (agent.agency_level_id) {
    const { data: lvl } = await supabaseAdmin
      .from("agency_levels").select("name, base_pct").eq("id", agent.agency_level_id).maybeSingle();
    position_name = lvl?.name ?? null;
    position_pct = lvl?.base_pct ?? null;
  }

  const [{ data: upline }, { data: owner }] = await Promise.all([
    agent.upline_id
      ? supabaseAdmin.from("profiles").select("first_name, last_name, npn_number").eq("id", agent.upline_id).maybeSingle()
      : Promise.resolve({ data: null }),
    org?.owner_id
      ? supabaseAdmin.from("profiles").select("first_name, last_name, npn_number").eq("id", org.owner_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // The latest note of each kind, per request — the one thing staff and the
  // agent both read, and it lived only inside the per-request page before.
  const ids = (rows ?? []).map((r: any) => r.id);
  const notes = new Map<string, { agent: string | null; internal: string | null; next: string | null }>();
  if (ids.length) {
    const { data: hist } = await supabaseAdmin
      .from("contracting_status_history")
      .select("request_id, agent_visible_message, internal_message, next_action, created_at")
      .in("request_id", ids)
      .order("created_at", { ascending: true });
    for (const h of hist ?? []) {
      const cur = notes.get(h.request_id) ?? { agent: null, internal: null, next: null };
      if (h.agent_visible_message) cur.agent = h.agent_visible_message;
      if (h.internal_message) cur.internal = h.internal_message;
      if (h.next_action) cur.next = h.next_action;
      notes.set(h.request_id, cur);
    }
  }

  // Level labels for whatever rungs are referenced.
  const levelIds = Array.from(new Set(
    (rows ?? []).flatMap((r: any) => [r.granted_comp_level_id, r.requested_comp_level_id]).filter(Boolean),
  )) as string[];
  const levelNames = new Map<string, string>();
  if (levelIds.length) {
    const { data: lv } = await supabaseAdmin
      .from("carrier_comp_levels").select("id, level_name").in("id", levelIds);
    for (const l of lv ?? []) levelNames.set(l.id, l.level_name);
  }

  // The ladders themselves: every active rung each of these carriers offers, so
  // a decision is picked from what the carrier actually has rather than typed.
  const orgCarrierIds = Array.from(new Set(
    (rows ?? []).map((r: any) => r.org_carriers?.id).filter(Boolean),
  )) as string[];
  const ladders = new Map<string, { id: string; level_name: string; commission_pct: number | null }[]>();
  if (orgCarrierIds.length) {
    const { data: lv } = await supabaseAdmin
      .from("carrier_comp_levels")
      .select("id, org_carrier_id, level_name, commission_pct, status, sort_order")
      .in("org_carrier_id", orgCarrierIds);
    for (const l of (lv ?? []) as any[]) {
      if (l.status && l.status !== "active") continue;
      const list = ladders.get(l.org_carrier_id) ?? [];
      list.push({ id: l.id, level_name: l.level_name, commission_pct: l.commission_pct ?? null });
      ladders.set(l.org_carrier_id, list);
      levelNames.set(l.id, l.level_name);
    }
    for (const list of ladders.values()) {
      list.sort((a, b) => (b.commission_pct ?? 0) - (a.commission_pct ?? 0));
    }
  }

  const requests: WorkspaceRequest[] = (rows ?? []).map((r: any) => {
    const granted = r.granted_comp_level_id ? levelNames.get(r.granted_comp_level_id) ?? null : null;
    const asked = r.requested_comp_level_id ? levelNames.get(r.requested_comp_level_id) ?? null : null;
    const n = notes.get(r.id);
    return {
      id: r.id,
      reference: r.reference ?? null,
      carrier_name: r.org_carriers?.carriers?.name ?? "Carrier",
      carrier_id: r.org_carriers?.carrier_id ?? null,
      org_carrier_id: r.org_carriers?.id ?? null,
      status: r.status,
      writing_number: r.writing_number ?? null,
      comp_level: granted ?? asked ?? r.requested_advance_level ?? null,
      comp_source: granted
        ? "Carrier level granted"
        : asked
          ? "Agency position → carrier level"
          : r.requested_advance_level
            ? "Agency position percentage"
            : null,
      advance_option: r.granted_advance_option ?? null,
      granted_comp_level_id: r.granted_comp_level_id ?? null,
      granted_level_name: r.granted_level_name ?? granted ?? null,
      granted_pct: r.granted_pct == null ? null : Number(r.granted_pct),
      comp_level_options: r.org_carriers?.id ? ladders.get(r.org_carriers.id) ?? [] : [],
      agent_note: n?.agent ?? null,
      internal_note: access.canNoteInternal || access.canViewAudit ? n?.internal ?? null : null,
      next_action: n?.next ?? null,
      updated_at: r.updated_at,
      created_at: r.created_at,
      decline_reason: r.decline_reason ?? null,
    };
  });

  const name = fullName(agent) || "Unnamed agent";
  return {
    access,
    agent: {
      id: agent.id,
      name,
      initials: initialsOf(name),
      npn: agent.npn_number ?? null,
      email: agent.email ?? null,
      phone: agent.phone ?? null,
      position_name,
      position_pct,
    },
    hierarchy: {
      upline_name: fullName(upline) || null,
      upline_npn: (upline as any)?.npn_number ?? null,
      owner_name: fullName(owner) || null,
      owner_npn: (owner as any)?.npn_number ?? null,
      path: [] as string[],
    },
    requests,
    progress: {
      total: requests.length,
      active: requests.filter((r) => isLiveStatus(r.status)).length,
      needs_attention: requests.filter((r) => isAgentActionStatus(r.status)).length,
    },
    last_updated: requests.reduce<string | null>((acc, r) => (!acc || r.updated_at > acc ? r.updated_at : acc), null),
  };
}

/**
 * One request's timeline: statuses, notes, field changes, sync events, errors.
 *
 * Lifted out of the per-request page so the workspace can show the same history
 * inline. Internal notes are withheld from anybody without the staff-note
 * capability — an agent must never read them.
 */
export async function getRequestTimeline(args: { userId: string; requestId: string }) {
  const access = await resolveContractingAccess(args.userId);
  if (!access.orgId) return { rows: [] as any[] };

  const { data: request } = await supabaseAdmin
    .from("contracting_requests").select("id, agent_id, organization_id")
    .eq("id", args.requestId).maybeSingle();
  const isOwnAgent = request?.agent_id === args.userId;
  const inOrg = request?.organization_id === access.orgId;
  if (!request || !inOrg || (!access.canView && !isOwnAgent)) return { rows: [] as any[] };

  const { data } = await supabaseAdmin
    .from("contracting_status_history")
    .select("id, from_status, to_status, change_kind, field, old_value, new_value, agent_visible_message, internal_message, next_action, changed_by, created_at")
    .eq("request_id", args.requestId)
    .order("created_at", { ascending: false })
    .limit(200);

  const actorIds = Array.from(new Set((data ?? []).map((h: any) => h.changed_by).filter(Boolean))) as string[];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: people } = await supabaseAdmin
      .from("profiles").select("id, first_name, last_name").in("id", actorIds);
    for (const p of people ?? []) names.set(p.id, fullName(p) || "Staff");
  }

  const showInternal = access.canNoteInternal || access.canViewAudit;
  return {
    rows: (data ?? []).map((h: any) => ({
      ...h,
      internal_message: showInternal ? h.internal_message : null,
      changed_by_name: h.changed_by ? names.get(h.changed_by) ?? null : null,
    })),
  };
}
