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
