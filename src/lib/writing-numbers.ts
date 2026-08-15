/**
 * Writing numbers, in one place.
 *
 * A writing number is the identifier the carrier pays against, and this schema
 * has kept it in three separate stores with nothing reconciling them:
 *
 *   contract_requests.writing_number        the agent's own Contracts page
 *   agent_commission_levels.writing_number  the admin comp-level editor
 *   writing_numbers                         the ops table the packet is built
 *                                           from — and, until the backfill,
 *                                           almost empty
 *
 * `writing_numbers` is now authoritative. It is the only one of the three that
 * can express what a writing number really is: an agent can hold several at one
 * carrier — one per state, or per product line — which a single `text` column
 * cannot represent at all.
 *
 * Two transitional behaviours live here, and both are deliberate:
 *
 *   **Reads fall back.** `loadWritingNumbers` prefers a `writing_numbers` row
 *   and drops back to the legacy column when there isn't one. That covers the
 *   window before `20260802220000` is applied — migrations here are applied by
 *   hand, so code always ships first — and it covers any row the backfill could
 *   not map to an org carrier.
 *
 *   **Writes are doubled.** `recordWritingNumber` writes the new table and the
 *   caller keeps writing the legacy column. Dropping the legacy write before
 *   the migration lands would mean a number recorded in that window is stored
 *   nowhere at all. Once the migration is applied the legacy column is simply
 *   stale and unread, and both the dual write and the read fallback can go.
 */

import { recordAudit } from "@/lib/contracting-ops/audit";

type Db = { from: (t: string) => any };

/** PostgREST codes this module has to tolerate rather than surface. */
const CHECK_VIOLATION = "23514"; // source='self_reported' before the migration
const RLS_VIOLATION = "42501"; // writing_numbers_own before the migration

/**
 * The org's link row for a global carrier, creating it if it is missing.
 *
 * `writing_numbers.org_carrier_id` points at `org_carriers`, not at the global
 * `carriers` catalogue, so every write needs this. Returns null rather than
 * throwing when there is no organization to attach to — a personal account with
 * no agency is a normal state, not an error, and the caller falls back to the
 * legacy column.
 */
export async function resolveOrgCarrierId(
  db: Db,
  orgId: string | null | undefined,
  carrierId: string,
): Promise<string | null> {
  if (!orgId) return null;

  const { data: existing } = await db
    .from("org_carriers")
    .select("id")
    .eq("organization_id", orgId)
    .eq("carrier_id", carrierId)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await db
    .from("org_carriers")
    .insert({ organization_id: orgId, carrier_id: carrierId, status: "active" })
    .select("id")
    .maybeSingle();

  // 23505 means somebody else created the same link between the select and the
  // insert. That is a success, not a failure — re-read it.
  if (error?.code === "23505") {
    const { data: raced } = await db
      .from("org_carriers")
      .select("id")
      .eq("organization_id", orgId)
      .eq("carrier_id", carrierId)
      .maybeSingle();
    return raced?.id ?? null;
  }
  if (error) return null;
  return created?.id ?? null;
}

/**
 * Record a writing number for an agent at a carrier, and log that it happened.
 *
 * Returns whether the row landed. A false is not an error the caller should
 * raise: before `20260802220000` is applied the `self_reported` source violates
 * the check constraint and the agent write policy does not exist, and in that
 * window the legacy column the caller also writes is the whole story.
 *
 * ── Why the audit is in here and not at the call sites ──
 *
 * `writing_number.created` has been in the audit vocabulary since the log was
 * built, and the staff-facing editor in `contracting-records.functions.ts` has
 * always written it. The four other paths that record a number — an agent
 * stating their own, staff setting one on a contract, an agent activating an
 * assigned contract, and an admin recording one on somebody's behalf — did
 * not. So a writing number could appear against an agent with nothing saying
 * who put it there, which is one of the seven changes the recovery brief names
 * as needing a trail.
 *
 * Bundling it here is the same reasoning as `recordContractChange`: two writes
 * that must both happen rot by one call site gaining only one of them. A
 * caller cannot now record a number without recording that they did.
 */
export async function recordWritingNumber(
  db: Db,
  args: {
    agentId: string;
    /** Who is doing this. The agent themselves, for a self-report. */
    actorId: string;
    orgId: string | null | undefined;
    carrierId: string;
    writingNumber: string;
    /** `self_reported` for an agent's own claim, `manual_entry` for staff. */
    source?: "self_reported" | "manual_entry" | "request_outcome";
    compLevelId?: string | null;
    requestId?: string | null;
  },
): Promise<boolean> {
  const number = args.writingNumber.trim();
  if (!number) return false;

  const orgCarrierId = await resolveOrgCarrierId(db, args.orgId, args.carrierId);
  if (!orgCarrierId || !args.orgId) return false;

  const { error } = await db.from("writing_numbers").insert({
    organization_id: args.orgId,
    agent_id: args.agentId,
    org_carrier_id: orgCarrierId,
    writing_number: number,
    number_type: "individual",
    scope: "national",
    status: "active",
    source: args.source ?? "self_reported",
    comp_level_id: args.compLevelId ?? null,
    request_id: args.requestId ?? null,
  });

  if (!error) {
    // After the insert is known to have landed. Recording a number that was
    // rejected would be worse than not recording one at all.
    await recordAudit({
      organizationId: args.orgId,
      actorId: args.actorId,
      action: "writing_number.created",
      recordType: "writing_number",
      subjectAgentId: args.agentId,
      next: { writing_number: number, carrier_id: args.carrierId, source: args.source ?? "self_reported" },
      metadata: { org_carrier_id: orgCarrierId, request_id: args.requestId ?? null },
    });
    return true;
  }

  // 23505: the same number is already recorded for this agent and carrier,
  // which is the desired end state — and nothing changed, so there is nothing
  // to log. Auditing here would fill the trail with entries for writes that
  // did not happen.
  if (error.code === "23505") return true;
  if (error.code === CHECK_VIOLATION || error.code === RLS_VIOLATION) return false;

  // Anything else is a genuine fault, but still not worth failing the caller
  // over — the legacy column has the number and the contract status is what the
  // agent was actually changing.
  console.error("[writing-numbers] record failed", error);
  return false;
}

/**
 * The authoritative number for each (agent, carrier) pair among `agentIds`.
 *
 * Keyed `${agentId}:${carrierId}`. Where an agent holds more than one number at
 * a carrier — different states or product lines — this returns the active one,
 * preferring a carrier confirmation over anything self-reported, because the
 * surfaces that call this show a single value.
 */
export async function loadWritingNumbers(
  db: Db,
  agentIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!agentIds.length) return out;

  const { data, error } = await db
    .from("writing_numbers")
    .select("agent_id, writing_number, status, source, org_carriers(carrier_id)")
    .in("agent_id", agentIds);

  // The table predates this work, so a failure here is not the pending
  // migration — but the read fallback in the callers still covers it.
  if (error || !data) return out;

  // Written out rather than folded into a ternary chain, because the order is
  // the decision. `manual_entry` sits above `self_reported` — staff entering a
  // number on an agent's behalf is a stronger claim than the agent's own — and
  // `legacy_backfill` sits at the bottom, since it came from a column nothing
  // ever reconciled. Anything unrecognised ranks with it rather than above it.
  const SOURCE_RANK: Record<string, number> = {
    carrier_confirmation: 5,
    external_api: 4,
    request_outcome: 3,
    manual_entry: 2,
    self_reported: 1,
    import: 0,
    legacy_backfill: 0,
  };
  // Status dominates source: a terminated number the carrier confirmed is not
  // the one to show, because the agent cannot write on it today.
  const rank = (r: any) =>
    (r.status === "active" ? 100 : 0) + (SOURCE_RANK[r.source] ?? 0);

  const best = new Map<string, any>();
  for (const row of data as any[]) {
    const carrierId = row.org_carriers?.carrier_id;
    if (!carrierId) continue;
    const key = `${row.agent_id}:${carrierId}`;
    const held = best.get(key);
    if (!held) { best.set(key, row); continue; }

    const d = rank(row) - rank(held);
    // Ties are real and they matter. Where the two legacy stores held
    // *different* numbers for one pair, the backfill kept both — it cannot know
    // which was right — and they rank identically. Breaking the tie on the
    // number itself makes the choice arbitrary but stable, so the screen shows
    // the same value on every load. A value that flickers between reloads
    // would be worse than one that is consistently wrong, because nobody would
    // know to go and reconcile it.
    if (d > 0 || (d === 0 && String(row.writing_number) < String(held.writing_number))) {
      best.set(key, row);
    }
  }
  for (const [key, row] of best) out.set(key, row.writing_number);
  return out;
}

/** Key for {@link loadWritingNumbers}. */
export function writingNumberKey(agentId: string, carrierId: string): string {
  return `${agentId}:${carrierId}`;
}
