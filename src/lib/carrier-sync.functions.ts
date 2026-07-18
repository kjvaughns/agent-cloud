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

// ── Status normalization ─────────────────────────────────────────────────────

export const POLICY_STATUS_VALUES = [
  "active", "issued_not_paid", "in_review", "lapse_pending", "lapsed",
  "cancelled", "withdrawn", "not_taken", "postponed", "carrier_na",
] as const;
export type PolicyStatus = (typeof POLICY_STATUS_VALUES)[number];

/** Best-effort mapping of common carrier status wording to our enum. */
const STATUS_DICTIONARY: [RegExp, PolicyStatus][] = [
  [/in\s*-?\s*force|inforce|^active$|^paid(\s*up)?$|premium\s*paying|current/i, "active"],
  [/issued.*not.*paid|delivery|delivered.*unpaid/i, "issued_not_paid"],
  [/grace|past\s*due|payment\s*due|delinquen|lapse\s*pend|pending\s*lapse|nsf|returned\s*payment|draft\s*fail/i, "lapse_pending"],
  [/^lapsed?$|terminated.*non.*pay|term.*lapse/i, "lapsed"],
  [/cancel/i, "cancelled"],
  [/withdraw/i, "withdrawn"],
  [/not\s*taken|nto|free\s*look/i, "not_taken"],
  [/postpone|deferred/i, "postponed"],
  [/decline|reject|closed.*incomplete|incomplete/i, "carrier_na"],
  [/underwriting|in\s*review|pending|submitted|processing|application/i, "in_review"],
];

function normalizeStatus(raw: string, overrides: Record<string, string>): PolicyStatus | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  const override = overrides[key];
  if (override && (POLICY_STATUS_VALUES as readonly string[]).includes(override)) {
    return override as PolicyStatus;
  }
  if (override === "__ignore") return null;
  for (const [re, status] of STATUS_DICTIONARY) {
    if (re.test(key)) return status;
  }
  return null;
}

function normalizePolicyNumber(v: string): string {
  return v.replace(/[\s-]/g, "").toUpperCase();
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

    const { data: policies, error } = await supabase
      .from("policies")
      .select("id, policy_number, status, agent_id, clients(first_name, last_name), profiles(first_name, last_name)")
      .eq("carrier_id", data.carrier_id)
      .in("agent_id", teamIds)
      .not("policy_number", "is", null);
    if (error) throw new Error(error.message);

    const byNumber = new Map<string, any>();
    for (const p of policies ?? []) {
      if (p.policy_number) byNumber.set(normalizePolicyNumber(p.policy_number), p);
    }

    const updates: SyncUpdate[] = [];
    const unmatched: SyncPreview["unmatched_rows"] = [];
    const unknownStatuses = new Set<string>();
    let noChange = 0;
    const seen = new Set<string>();

    for (const row of data.rows) {
      const key = normalizePolicyNumber(row.policy_number);
      if (seen.has(key)) continue; // duplicate row in the file — first wins
      seen.add(key);

      const pol = byNumber.get(key);
      if (!pol) {
        unmatched.push({ policy_number: row.policy_number, status_raw: row.status_raw, client_name: row.client_name });
        continue;
      }
      const newStatus = normalizeStatus(row.status_raw, data.status_overrides);
      if (newStatus === null) {
        if (!data.status_overrides[row.status_raw.trim().toLowerCase()]) {
          unknownStatuses.add(row.status_raw.trim());
        }
        continue;
      }
      if (pol.status === newStatus) {
        noChange++;
        continue;
      }
      const clientName = pol.clients ? `${pol.clients.first_name ?? ""} ${pol.clients.last_name ?? ""}`.trim() : "";
      updates.push({
        policy_id: pol.id,
        policy_number: pol.policy_number,
        client_name: clientName || "—",
        agent_name: pol.profiles ? `${pol.profiles.first_name ?? ""} ${pol.profiles.last_name ?? ""}`.trim() : "—",
        current_status: pol.status,
        new_status: newStatus,
        name_mismatch: row.client_name ? !nameSimilar(clientName, row.client_name) : false,
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
  })).max(20000),
});

export const applyCarrierSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApplySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await assertOwnerOrAdmin(supabase, userId);
    const teamIds = new Set(await getHierarchyIds(supabase, userId));

    // Re-verify every policy belongs to the caller's hierarchy + this carrier.
    const ids = data.updates.map((u) => u.policy_id);
    const { data: pols, error } = await supabase
      .from("policies")
      .select("id, agent_id, carrier_id")
      .in("id", ids);
    if (error) throw new Error(error.message);
    const allowed = new Set(
      (pols ?? [])
        .filter((p: any) => teamIds.has(p.agent_id) && p.carrier_id === data.carrier_id)
        .map((p: any) => p.id),
    );

    const now = new Date().toISOString();
    const source = `carrier_csv:${data.file_name}`;
    let updated = 0;
    // Group by target status so each status is one UPDATE.
    const byStatus = new Map<string, string[]>();
    for (const u of data.updates) {
      if (!allowed.has(u.policy_id)) continue;
      const list = byStatus.get(u.new_status) ?? [];
      list.push(u.policy_id);
      byStatus.set(u.new_status, list);
    }
    for (const [status, list] of byStatus) {
      const { error: upErr, count } = await supabase
        .from("policies")
        .update({ status, last_synced_at: now, sync_source: source }, { count: "exact" })
        .in("id", list);
      if (upErr) throw new Error(upErr.message);
      updated += count ?? list.length;
    }

    await supabase.from("carrier_sync_logs").insert({
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
