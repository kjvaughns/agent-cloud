/**
 * The trophy case: reading the record book, and writing it when it is beaten.
 *
 * Records are computed from the policies already on the books rather than
 * accumulated as deals arrive, so the book opens fully populated from an
 * imported history and cannot drift from the leaderboard. `production_records`
 * is therefore not the source of the numbers — it is the memory of what the
 * numbers were last time, which is the only way to know a record was broken
 * and who to congratulate.
 *
 * The stored book belongs to the caller's own agency. The IMO view rolls up
 * every opted-in sub-agency and is computed live: a parent celebrating a record
 * inside a child agency would be announcing it to the wrong room.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveScopeAgentIdsOrNone } from "@/lib/scope.functions";
import {
  ALL_SLOTS, announceable, computeRecords, diffRecords, recordTitle, slot,
  type BrokenRecord, type ComputedRecord, type RecordKind, type RecordPeriod, type StoredRecord,
} from "@/lib/records/records";
import type { ProductionRow } from "@/lib/production/source";

const ScopeSchema = z.object({ scope: z.enum(["agency", "imo"]).optional() });
const SyncSchema = z.object({ silent: z.boolean().optional() });

type Ctx = { supabase: any; userId: string };

export type TrophyRecord = {
  kind: RecordKind;
  period: RecordPeriod;
  holderId: string | null;
  holderName: string | null;
  premium: number;
  periodStart: string;
  /** When the record was set, from the stored book. Null for a live IMO view. */
  setAt: string | null;
  previousPremium: number | null;
  isYou: boolean;
};

export type TrophyCase = {
  records: TrophyRecord[];
  /** Records this viewer holds that they have not been shown yet. */
  celebrate: { kind: RecordKind; period: RecordPeriod; premium: number; title: string }[];
};

/** Everyone whose numbers make up this agency's book. */
async function rosterFor(supabase: any, agentIds: string[]) {
  if (!agentIds.length) return [] as { id: string; upline_id: string | null }[];
  const { data } = await supabase
    .from("profiles").select("id, upline_id").in("id", agentIds);
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, upline_id: r.upline_id ?? null }));
}

/**
 * Every policy those people have ever written. Windowing happens in buckets.
 *
 * Six named columns rather than `*`, and paged past PostgREST's 1000-row
 * default — an agency with an imported back-book has more policies than that,
 * and a silently truncated read would produce a record book that is merely
 * plausible.
 */
const RECORD_COLS = "annual_premium, production_date, posted_at, effective_date, agent_id, status";

async function policiesFor(supabase: any, agentIds: string[]): Promise<ProductionRow[]> {
  if (!agentIds.length) return [];
  const rows: ProductionRow[] = [];
  const size = 200;
  const PAGE = 1000;
  for (let i = 0; i < agentIds.length; i += size) {
    const slice = agentIds.slice(i, i + size);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("policies").select(RECORD_COLS).in("agent_id", slice)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as ProductionRow[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
  }
  return rows;
}


async function namesFor(supabase: any, ids: (string | null)[]) {
  const wanted = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  const out = new Map<string, string>();
  if (!wanted.length) return out;
  const { data } = await supabase
    .from("profiles").select("id, first_name, last_name").in("id", wanted);
  for (const p of (data ?? []) as any[]) {
    out.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Agent");
  }
  return out;
}

/** Owners who have switched their own numbers off leaderboards. */
async function hiddenOwners(supabase: any, ids: string[], viewerId: string): Promise<Set<string>> {
  const hidden = new Set<string>();
  if (!ids.length) return hidden;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: orgs } = await admin
      .from("organizations").select("id, owner_id").in("owner_id", ids);
    const orgIds = ((orgs ?? []) as any[]).map((o) => o.id);
    if (!orgIds.length) return hidden;
    const { data: optedOut } = await admin
      .from("organization_settings")
      .select("organization_id")
      .in("organization_id", orgIds)
      .eq("show_own_on_leaderboards", false);
    const off = new Set(((optedOut ?? []) as any[]).map((s) => s.organization_id));
    for (const o of (orgs ?? []) as any[]) if (off.has(o.id)) hidden.add(o.owner_id);
  } catch {
    // Setting absent: nobody has opted out.
  }
  hidden.delete(viewerId);
  return hidden;
}

async function myOrgId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
  return (data as any)?.organization_id ?? null;
}

/**
 * Agency owners among these agents. An owner's team is the whole agency, so
 * they are struck from the leader records — see `computeRecords`.
 */
async function agencyOwners(supabase: any, ids: string[]): Promise<Set<string>> {
  const owners = new Set<string>();
  if (!ids.length) return owners;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: orgs } = await (supabaseAdmin as any)
      .from("organizations").select("owner_id").in("owner_id", ids);
    for (const o of (orgs ?? []) as any[]) if (o.owner_id) owners.add(o.owner_id);
  } catch {
    // Owner lookup unavailable: no exclusions.
  }
  return owners;
}

/** The nine records, computed for a set of agents. */
async function computeFor(supabase: any, agentIds: string[], viewerId: string) {
  const [roster, rows, hidden, owners] = await Promise.all([
    rosterFor(supabase, agentIds),
    policiesFor(supabase, agentIds),
    hiddenOwners(supabase, agentIds, viewerId),
    agencyOwners(supabase, agentIds),
  ]);
  return computeRecords(rows, roster, hidden, owners);
}

export const getTrophyCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScopeSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<TrophyCase> => {
    const { supabase, userId } = context as Ctx;
    const scope = data.scope ?? "agency";
    let agentIds = await resolveScopeAgentIdsOrNone(supabase, scope);
    if (!agentIds.length) agentIds = [userId];

    const computed = await computeFor(supabase, agentIds, userId);

    // The stored book adds "when was this set" and "what did it beat", and is
    // only meaningful for the agency's own records.
    const stored = new Map<string, any>();
    if (scope === "agency") {
      const orgId = await myOrgId(supabase, userId);
      if (orgId) {
        const { data: rowsStored } = await supabase
          .from("production_records").select("*").eq("organization_id", orgId);
        for (const r of (rowsStored ?? []) as any[]) stored.set(slot(r.kind, r.period), r);
      }
    }

    const names = await namesFor(supabase, [...computed.values()].map((r) => r.holderId));

    const records: TrophyRecord[] = ALL_SLOTS.flatMap(({ kind, period, slot: key }) => {
      const rec = computed.get(key);
      if (!rec) return [];
      const saved = stored.get(key);
      return [{
        kind,
        period,
        holderId: rec.holderId,
        holderName: rec.holderId ? names.get(rec.holderId) ?? "Agent" : null,
        premium: rec.premium,
        periodStart: rec.periodStart,
        setAt: saved?.set_at ?? null,
        previousPremium: saved?.previous_premium != null ? Number(saved.previous_premium) : null,
        isYou: rec.holderId === userId,
      }];
    });

    const celebrate = [...stored.values()]
      .filter((r) => r.holder_id === userId && r.announced_at && !r.seen_at)
      .map((r) => ({
        kind: r.kind as RecordKind,
        period: r.period as RecordPeriod,
        premium: Number(r.premium ?? 0),
        title: recordTitle(r.kind, r.period),
      }));

    return { records, celebrate };
  });

/**
 * Recompute the agency's book and write down anything that was beaten.
 *
 * Called after a deal is posted or a policy's premium or date is edited, and
 * with `silent` from the import paths — a book of four hundred backdated
 * policies breaks every record once and nobody wants nine alerts for it.
 *
 * Never throws at the caller: the deal has already been written by the time
 * this runs, and a failed record sync must not look like a failed sale.
 */
export const syncProductionRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SyncSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    try {
      const orgId = await myOrgId(supabase, userId);
      if (!orgId) return { broken: [] as any[], announced: 0 };

      let agentIds = await resolveScopeAgentIdsOrNone(supabase, "agency");
      if (!agentIds.length) agentIds = [userId];
      const computed = await computeFor(supabase, agentIds, userId);

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;

      const { data: existing } = await admin
        .from("production_records").select("*").eq("organization_id", orgId);
      const broken = diffRecords((existing ?? []) as StoredRecord[], computed);
      if (!broken.length) return { broken: [] as any[], announced: 0 };

      const announce = data.silent ? [] : broken.filter(announceable);
      const now = new Date().toISOString();
      const { error } = await admin.from("production_records").upsert(
        broken.map((r) => ({
          organization_id: orgId,
          kind: r.kind,
          period: r.period,
          holder_id: r.holderId,
          premium: r.premium,
          period_start: r.periodStart,
          set_at: now,
          previous_premium: r.previousPremium,
          previous_holder_id: r.previousHolderId,
          announced_at: announce.includes(r) ? now : null,
          seen_at: null,
        })),
        { onConflict: "organization_id,kind,period" },
      );
      if (error) {
        console.error("[records] upsert failed", error.message);
        return { broken: [] as any[], announced: 0 };
      }

      let announced = 0;
      if (announce.length) {
        announced = await announceRecords(admin, orgId, announce, computed);
      }
      return {
        broken: broken.map((r) => ({
          kind: r.kind, period: r.period, premium: r.premium,
          holderId: r.holderId, title: recordTitle(r.kind, r.period),
          announced: announce.includes(r),
          // So the caller can tell "you set this" from "somebody in your agency
          // did" without a second round trip.
          isMine: r.holderId === userId,
        })),
        announced,
      };
    } catch (e: any) {
      console.error("[records] sync failed", e?.message);
      return { broken: [] as any[], announced: 0 };
    }
  });

/** Tell the whole agency. Respects the team-activity preference. */
async function announceRecords(
  admin: any,
  orgId: string,
  broken: BrokenRecord[],
  computed: Map<string, ComputedRecord>,
): Promise<number> {
  const { notifyPeople } = await import("@/lib/notify.server");
  const { data: members } = await admin
    .from("profiles").select("id, first_name, last_name").eq("organization_id", orgId);
  const people = (members ?? []) as any[];
  const memberIds = people.map((p) => p.id);
  const name = (id: string | null) => {
    const p = people.find((x) => x.id === id);
    return p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "An agent" : "An agent";
  };
  const money = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
      .format(n);

  let sent = 0;
  for (const rec of broken) {
    void computed;
    const who = rec.kind === "agency" ? "The agency" : name(rec.holderId);
    sent += await notifyPeople(admin, {
      userIds: memberIds,
      category: "team_activity",
      type: "record",
      title: `New record: ${recordTitle(rec.kind, rec.period)}`,
      description:
        `${who} set a new ${recordTitle(rec.kind, rec.period)} record — ${money(rec.premium)}` +
        (rec.previousPremium ? `, beating ${money(rec.previousPremium)}.` : "."),
    });
  }
  return sent;
}

/** The celebration has been shown; do not show it again. */
export const markRecordsSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any)
        .from("production_records")
        .update({ seen_at: new Date().toISOString() })
        .eq("holder_id", userId)
        .is("seen_at", null);
      void supabase;
      return { ok: true };
    } catch (e: any) {
      console.error("[records] mark seen failed", e?.message);
      return { ok: false };
    }
  });
