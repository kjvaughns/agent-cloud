import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

// ── Role guard: agency owners + admins only ──────────────────────────────────

async function assertOwnerOrAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["super_admin", "agency_owner", "admin"])
    .limit(1);
  if (!data?.length) throw new Error("Only agency owners and admins can sync carrier books");
}

async function getHierarchyIds(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.rpc("get_team_downline");
  return [userId, ...((data ?? []) as { id: string }[]).map((a) => a.id)];
}

/**
 * The caller's agency. Imported policies are often held for producers who have
 * no account yet, so they sit outside `get_team_downline` — scoping the sync to
 * the org lets those match instead of landing in the unmatched pile.
 */
async function getOrgId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
  return data?.organization_id ?? null;
}

/**
 * Every organisation the caller's book spans: their own agency plus every
 * sub-agency underneath it (IMO view). A sync run from the top must reach a
 * downline agency's policies, which live under a *different* organization_id
 * and often on producers with no portal account at all.
 */
async function getScopeOrgIds(supabase: any, userId: string): Promise<string[]> {
  const ids = new Set<string>();
  const own = await getOrgId(supabase, userId);
  if (own) ids.add(own);
  const { data } = await supabase.rpc("imo_org_ids");
  for (const row of (data ?? []) as any[]) {
    const id = typeof row === "string" ? row : row?.imo_org_ids ?? row?.id;
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Supabase caps a select at 1000 rows; a full book needs every page. */
async function fetchAllPages(build: () => any): Promise<any[]> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return out;
}


// ── Status normalization ─────────────────────────────────────────────────────

export const POLICY_STATUS_VALUES = [
  "active", "submitted", "issued_not_paid", "in_review", "lapse_pending", "lapsed",
  "cancelled", "withdrawn", "not_taken", "postponed", "carrier_na",
] as const;
export type PolicyStatus = (typeof POLICY_STATUS_VALUES)[number];

/** Best-effort mapping of common carrier status wording to our enum. */
const STATUS_DICTIONARY: [RegExp, PolicyStatus][] = [
  [/in\s*-?\s*force|inforce|^active$|^paid(\s*up)?$|premium\s*paying|renewal\s*premium|current/i, "active"],
  [/not\s*taken|^nto$|initial\s*premium\s*failed|unissued/i, "not_taken"],
  [/issued.*not.*paid|pending\s*initial\s*premium|delivery|delivered.*unpaid/i, "issued_not_paid"],
  [/grace|past\s*due|payment\s*due|delinquen|lapse\s*pend|pending\s*lapse|nsf|returned\s*payment|draft\s*fail/i, "lapse_pending"],
  [/^lapsed?$|terminated.*non.*pay|term.*lapse/i, "lapsed"],
  [/cancel|surrender/i, "cancelled"],
  [/withdraw/i, "withdrawn"],
  [/free\s*look/i, "not_taken"],
  [/postpone|deferred/i, "postponed"],
  [/decline|reject|closed|incomplete|expired|quote|lead/i, "carrier_na"],
  [/submitted|approved/i, "submitted"],
  [/underwriting|in\s*review|pending|processing|application|started/i, "in_review"],
];

/**
 * Carrier exports write statuses as SCREAMING_SNAKE ("PREMIUM_PAYING"), so the
 * separators become spaces before the dictionary sees them — otherwise every
 * multi-word status looked "unrecognized" and the sync found nothing to do.
 */
export function statusKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeStatus(raw: string, overrides: Record<string, string>): PolicyStatus | null {
  const key = statusKey(raw);
  if (!key) return null;
  const override = overrides[key] ?? overrides[raw.trim().toLowerCase()];
  if (override && (POLICY_STATUS_VALUES as readonly string[]).includes(override)) {
    return override as PolicyStatus;
  }
  if (override === "__ignore") return null;
  for (const [re, status] of STATUS_DICTIONARY) {
    if (re.test(key)) return status;
  }
  return null;
}

/**
 * Carrier files and our own book disagree on punctuation ("#AMH6335747",
 * "AMH-633 5747"), so identity is the alphanumeric core only.
 */
function normalizePolicyNumber(v: string): string {
  return v.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** A policy number too weak to identify anything ("AMH", "000", blank). */
function isWeakNumber(v: string | null | undefined): boolean {
  const core = normalizePolicyNumber(v ?? "");
  return core.length < 6 || !/\d/.test(core);
}

/** "Last|First" key for matching an insured name against a client record. */
function nameKey(first: string | null | undefined, last: string | null | undefined): string {
  const n = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return `${n(last ?? "")}|${n(first ?? "")}`;
}

/** Keys an insured name from a carrier file could produce ("John A Smith"). */
function nameKeysFromFull(full: string): string[] {
  const parts = full.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [];
  const first = parts[0], last = parts[parts.length - 1];
  // Also handle "Smith, John" ordering.
  return [`${last}|${first}`, `${first}|${last}`];
}

function nameSimilar(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").trim();
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return true; // nothing to compare
  const aw = new Set(na.split(/\s+/));
  return nb.split(/\s+/).some((w) => w.length > 1 && aw.has(w));
}


// ── Preview (read-only) ──────────────────────────────────────────────────────

const RowSchema = z.object({
  policy_number: z.string().trim().min(1),
  status_raw: z.string().trim().min(1),
  client_name: z.string().optional(),
});

const PreviewSchema = z.object({
  carrier_id: z.string().uuid(),
  status_overrides: z.record(z.string(), z.string()).optional().default({}),
  rows: z.array(RowSchema).min(1).max(20000),
});

export type SyncUpdate = {
  policy_id: string;
  policy_number: string;
  client_name: string;
  agent_name: string;
  current_status: string;
  new_status: PolicyStatus;
  name_mismatch: boolean;
  /** How the row was tied to the policy. */
  matched_by?: "policy_number" | "insured_name";
  /** Real carrier number to write onto a policy that only had a placeholder. */
  set_policy_number?: string;
};


export type SyncPreview = {
  updates: SyncUpdate[];
  no_change: number;
  unmatched_rows: { policy_number: string; status_raw: string; client_name?: string }[];
  unknown_statuses: string[];
  total_rows: number;
};

export const previewCarrierSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PreviewSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await assertOwnerOrAdmin(supabase, userId);
    const teamIds = await getHierarchyIds(supabase, userId);
    const orgIds = await getScopeOrgIds(supabase, userId);

    // The caller's RLS view intentionally stops at their own organisation.
    // A hierarchy sync can also include policies held by child agencies, so
    // authorize the caller and calculate their permitted ids above, then use
    // the trusted client for the strictly carrier/team/org-scoped lookup.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const select =
      "id, policy_number, status, agent_id, organization_id, clients(first_name, last_name), profiles!policies_agent_id_fkey(first_name, last_name)";

    const byNumber = new Map<string, any>();
    const collect = (rows: any[] | null) => {
      for (const p of rows ?? []) {
        if (p.policy_number) byNumber.set(normalizePolicyNumber(p.policy_number), p);
      }
    };

    collect(
      await fetchAllPages(() =>
         supabaseAdmin
          .from("policies")
          .select(select)
          .eq("carrier_id", data.carrier_id)
          .in("agent_id", teamIds)
          .not("policy_number", "is", null),
      ),
    );

    if (orgIds.length) {
      collect(
        await fetchAllPages(() =>
           supabaseAdmin
            .from("policies")
            .select(select)
            .eq("carrier_id", data.carrier_id)
            .in("organization_id", orgIds)
            .not("policy_number", "is", null),
        ),
      );
    }

    // Last pass: a policy filed under the WRONG carrier in our book still is
    // that policy. Look up any number the file mentions that we haven't matched
    // yet, across the caller's hierarchy, ignoring carrier_id.
    const missing = data.rows
      .map((r) => r.policy_number.trim())
      .filter((n) => n && !byNumber.has(normalizePolicyNumber(n)));
    if (missing.length) {
      const CHUNK = 200;
      for (let i = 0; i < missing.length; i += CHUNK) {
        const slice = missing.slice(i, i + CHUNK);
        const base = () =>
          supabaseAdmin.from("policies").select(select).in("policy_number", slice);
        collect(await fetchAllPages(() => base().in("agent_id", teamIds)));
        if (orgIds.length) {
          collect(await fetchAllPages(() => base().in("organization_id", orgIds)));
        }
      }
    }





    // Many rows in our own book carry a placeholder number ("AMH", "000") or
    // none at all — those policies exist, they just cannot be found by number.
    // Match those by insured name within this carrier + the caller's hierarchy.
    const byName = new Map<string, any>();
    const nameBase = () =>
      supabaseAdmin.from("policies").select(select).eq("carrier_id", data.carrier_id);
    const collectNames = (rows: any[] | null) => {
      for (const p of rows ?? []) {
        if (!isWeakNumber(p.policy_number)) continue;
        if (!p.clients) continue;
        const k = nameKey(p.clients.first_name, p.clients.last_name);
        if (k !== "|" && !byName.has(k)) byName.set(k, p);
      }
    };
    collectNames(await fetchAllPages(() => nameBase().in("agent_id", teamIds)));
    if (orgIds.length) {
      collectNames(await fetchAllPages(() => nameBase().in("organization_id", orgIds)));
    }

    const updates: SyncUpdate[] = [];
    const unmatched: SyncPreview["unmatched_rows"] = [];
    const unknownStatuses = new Set<string>();
    let noChange = 0;
    const seen = new Set<string>();
    const usedByName = new Set<string>();

    for (const row of data.rows) {
      const key = normalizePolicyNumber(row.policy_number);
      if (seen.has(key)) continue; // duplicate row in the file — first wins
      seen.add(key);

      let matchedBy: SyncUpdate["matched_by"] = "policy_number";
      let pol = byNumber.get(key);
      if (!pol && row.client_name) {
        for (const nk of nameKeysFromFull(row.client_name)) {
          const cand = byName.get(nk);
          if (cand && !usedByName.has(cand.id)) {
            pol = cand;
            usedByName.add(cand.id);
            matchedBy = "insured_name";
            break;
          }
        }
      }
      if (!pol) {
        unmatched.push({ policy_number: row.policy_number, status_raw: row.status_raw, client_name: row.client_name });
        continue;
      }
      const newStatus = normalizeStatus(row.status_raw, data.status_overrides);
      if (newStatus === null) {
        if (!data.status_overrides[statusKey(row.status_raw)]) {
          unknownStatuses.add(row.status_raw.trim());
        }
        continue;
      }
      const clientName = pol.clients ? `${pol.clients.first_name ?? ""} ${pol.clients.last_name ?? ""}`.trim() : "";
      const fillNumber = matchedBy === "insured_name" ? row.policy_number.trim() : undefined;
      if (pol.status === newStatus && !fillNumber) {
        noChange++;
        continue;
      }
      updates.push({
        policy_id: pol.id,
        policy_number: pol.policy_number ?? "—",
        client_name: clientName || "—",
        agent_name: pol.profiles ? `${pol.profiles.first_name ?? ""} ${pol.profiles.last_name ?? ""}`.trim() : "—",
        current_status: pol.status,
        new_status: newStatus,
        name_mismatch: matchedBy === "policy_number" && row.client_name ? !nameSimilar(clientName, row.client_name) : false,
        matched_by: matchedBy,
        ...(fillNumber ? { set_policy_number: fillNumber } : {}),
      });
    }


    return {
      updates,
      no_change: noChange,
      unmatched_rows: unmatched.slice(0, 500),
      unknown_statuses: Array.from(unknownStatuses).slice(0, 50),
      total_rows: data.rows.length,
    } as SyncPreview;
  });

// ── Apply (writes, after user confirmation) ──────────────────────────────────

const ApplySchema = z.object({
  carrier_id: z.string().uuid(),
  file_name: z.string().max(200),
  total_rows: z.number().int().min(0),
  unmatched: z.number().int().min(0),
  updates: z.array(z.object({
    policy_id: z.string().uuid(),
    new_status: z.enum(POLICY_STATUS_VALUES),
    set_policy_number: z.string().trim().max(60).optional(),
  })).max(20000),

});

export const applyCarrierSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApplySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await assertOwnerOrAdmin(supabase, userId);
    const teamIds = new Set(await getHierarchyIds(supabase, userId));
    const orgIds = new Set(await getScopeOrgIds(supabase, userId));

    // Re-verification and writes must see child-agency rows that the normal
    // authenticated policy SELECT hides. The allowed ids remain bounded by
    // the caller-derived hierarchy sets below.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Re-verify every policy belongs to the caller's hierarchy + this carrier.
    const ids = data.updates.map((u) => u.policy_id);
    const pols: any[] = [];
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { data: rows, error } = await supabaseAdmin
        .from("policies")
        .select("id, agent_id, carrier_id, organization_id")
        .in("id", chunk);
      if (error) throw new Error(error.message);
      pols.push(...(rows ?? []));
    }
    // Carrier is deliberately NOT part of the check: a policy mis-filed under
    // another carrier in our book is still the policy the file names. Hierarchy
    // membership remains the authorization boundary.
    const allowed = new Set(
      pols
        .filter(
          (p: any) =>
            teamIds.has(p.agent_id) || (p.organization_id && orgIds.has(p.organization_id)),
        )
        .map((p: any) => p.id),
    );



    const now = new Date().toISOString();
    const source = `carrier_csv:${data.file_name}`;
    let updated = 0;
    // Group by target status so each status is one UPDATE.
    const byStatus = new Map<PolicyStatus, string[]>();
    for (const u of data.updates) {
      if (!allowed.has(u.policy_id)) continue;
      const list = byStatus.get(u.new_status) ?? [];
      list.push(u.policy_id);
      byStatus.set(u.new_status, list);
    }
    for (const [status, list] of byStatus) {
      for (let i = 0; i < list.length; i += 500) {
        const chunk = list.slice(i, i + 500);
        const { error: upErr, count } = await supabaseAdmin
          .from("policies")
          .update({ status, last_synced_at: now, sync_source: source }, { count: "exact" })
          .in("id", chunk);
        if (upErr) throw new Error(upErr.message);
        updated += count ?? chunk.length;
      }
    }

    // Policies matched by insured name only had a placeholder number — write the
    // carrier's real number so later syncs match on number directly.
    for (const u of data.updates) {
      if (!u.set_policy_number || !allowed.has(u.policy_id)) continue;
      await supabaseAdmin
        .from("policies")
        .update({ policy_number: u.set_policy_number })
        .eq("id", u.policy_id);
    }



    await supabaseAdmin.from("carrier_sync_logs").insert({
      uploaded_by: userId,
      carrier_id: data.carrier_id,
      file_name: data.file_name,
      total_rows: data.total_rows,
      matched: data.updates.length,
      updated,
      unmatched: data.unmatched,
    });

    return { ok: true, updated, skipped: data.updates.length - updated };
  });

// ── Mapping templates ────────────────────────────────────────────────────────

export const getMappingTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ carrier_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: row } = await supabase
      .from("carrier_mapping_templates")
      .select("column_map, status_map")
      .eq("created_by", userId)
      .eq("carrier_id", data.carrier_id)
      .maybeSingle();
    return { template: row ?? null };
  });

export const saveMappingTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      carrier_id: z.string().uuid(),
      column_map: z.record(z.string(), z.string()),
      status_map: z.record(z.string(), z.string()),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase.from("carrier_mapping_templates").upsert(
      {
        created_by: userId,
        carrier_id: data.carrier_id,
        column_map: data.column_map,
        status_map: data.status_map,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "created_by,carrier_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── History ──────────────────────────────────────────────────────────────────

export const listSyncLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data } = await supabase
      .from("carrier_sync_logs")
      .select("id, file_name, total_rows, matched, updated, unmatched, created_at, carriers(name)")
      .eq("uploaded_by", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    return { rows: data ?? [] };
  });
