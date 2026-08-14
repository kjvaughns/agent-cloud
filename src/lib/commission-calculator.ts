/**
 * Turning a placed policy into a payment schedule.
 *
 * Three things this deliberately will not do:
 *
 *  1. Invent a commission rate. An agent with no assigned level for a carrier
 *     used to be given 70%, silently, and a full schedule built on it. Now the
 *     policy is queued for backfill and no money is written until somebody
 *     assigns the real level.
 *  2. Guess which grid row applies. The renewal lookup used to match on
 *     carrier and product alone, against a table unique on carrier, product,
 *     level and age band — so any carrier with more than one level returned
 *     several rows, maybeSingle() errored, the error was discarded, and every
 *     renewal was silently dropped. It matches the agent's own level now.
 *  3. Move a payment date. Advance percentages come from the comp level you
 *     configured; the months they land in stay fixed, because carrier draft
 *     calendars are not in this schema and inventing them would be the same
 *     mistake in a new place.
 */

import {
  resolveForAgent,
  loadUplineChain,
  recordSetupIssue,
} from "@/lib/compensation/lookup.server";
import { planYearOne, resolveOverrides, asFraction } from "@/lib/compensation/resolve";

/**
 * Names the payment, never the attempt that wrote it.
 *
 * Stable across recalculation so a retry writes the same keys and changes
 * nothing, a run that died halfway completes on the next attempt, and a
 * genuine recalculation updates amounts in place. The old guard — "skip if any
 * row exists for this policy" — failed in both directions: a half-finished run
 * stayed half-finished forever, and a corrected level could never be applied.
 */
function commissionKey(r: {
  policy_id: string;
  agent_id: string;
  payment_type: string;
  payment_date: string;
  month_number?: number | null;
}): string {
  return [
    r.policy_id,
    r.agent_id,
    r.payment_type,
    r.payment_date,
    String(r.month_number ?? 0),
  ].join(":");
}

type CommissionInput = {
  policyId: string;
  agentId: string;
  carrierId: string | null;
  product: string;
  monthlyPremium: number;
  annualPremium?: number | null;
  effectiveDate: string | null;
  clientName: string;
};

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function ds(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function resolveOrgId(supabase: any, agentId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", agentId)
    .maybeSingle();
  return data?.organization_id ?? null;
}

export async function calculateAndInsertAllCommissions(
  supabase: any,
  input: CommissionInput,
): Promise<void> {
  const { policyId, agentId, carrierId, product, monthlyPremium, effectiveDate, clientName } =
    input;
  if (!carrierId || !effectiveDate) return;

  // No early return on existing rows. Idempotency is per intended payment now
  // (see commissionKey), so this function is safe to run again and is the same
  // path a recalculation takes.
  const calcRunId = crypto.randomUUID();

  const annualPremium = Number((monthlyPremium * 12).toFixed(2));
  const effDate = new Date(effectiveDate);

  // Get carrier info
  const { data: carrier } = await supabase
    .from("carriers")
    .select("name, advance_cap, advance_cap_amount, advance_cap_months")
    .eq("id", carrierId)
    .maybeSingle();
  const carrierName = carrier?.name ?? "Unknown";
  const isGtl = carrier?.advance_cap === "fixed";

  // The canonical resolution, and the only one. Contract override → level and
  // carrier mapping → level base percentage → a named error. Nothing here may
  // invent a percentage; that is the whole point of the module.
  const orgIdEarly = await resolveOrgId(supabase, agentId);
  const { data: orgCarrier } = await supabase
    .from("org_carriers")
    .select("id")
    .eq("organization_id", orgIdEarly ?? "")
    .eq("carrier_id", carrierId)
    .maybeSingle();

  const resolution = orgCarrier?.id
    ? await resolveForAgent(supabase, agentId, orgCarrier.id)
    : ({
        ok: false,
        failures: ["carrier_not_configured"],
        messages: ["This carrier has not been set up for the agency yet."],
      } as const);

  // Whatever happens, the agent and the owner get told. The old code wrote a
  // console warning and queued the policy silently, so an agent posted a deal,
  // saw nothing, and had no way to find out why.
  await recordSetupIssue(supabase, {
    policyId,
    agentId,
    orgId: orgIdEarly,
    orgCarrierId: orgCarrier?.id ?? null,
    resolution: resolution as any,
  });
  if (!resolution.ok) {
    console.warn("[commissions] unresolved compensation — issue recorded", {
      policyId,
      agentId,
      carrierId,
      failures: resolution.failures,
    });
    return;
  }

  const levelPct = asFraction(resolution.pct);
  // The carrier's name for this level, not the agency's. Renewal grids are
  // keyed by the carrier's vocabulary — matching them on "General Agent" would
  // find nothing where the grid says "80%".
  const myLevelName: string | null = resolution.carrierLevelName ?? null;

  const orgId = orgIdEarly;

  const rows: any[] = [];

  // Year one, from the pure planner. The advance is what the carrier fronts
  // for `advanceMonths` of premium at this agent's rate; the rest falls to
  // as-earned over the remainder. The old code split 75/25 into three fixed
  // months regardless of what any agency had configured.
  const plan = planYearOne(monthlyPremium, resolution.pct, resolution.advanceMonths);
  const yr1Total = plan.yearOneTotal;

  // A fixed-cap carrier is a configured fact, not a code constant. The old
  // `?? 600` invented a cap for any carrier whose amount was never set, which
  // is the same silent-default problem the resolver exists to remove.
  const capAmount = carrier?.advance_cap_amount == null ? null : Number(carrier.advance_cap_amount);
  const advanceAmount =
    isGtl && capAmount != null ? Math.min(plan.advanceAmount, capAmount) : plan.advanceAmount;

  if (advanceAmount > 0) {
    rows.push({
      policy_id: policyId,
      agent_id: agentId,
      writing_agent_id: agentId,
      payment_date: ds(effDate),
      payment_type: "advance",
      amount: advanceAmount,
      carrier: carrierName,
      product,
      is_gtl: isGtl,
      commission_pct: resolution.pct,
      client_name: clientName,
      status: "pending",
      month_number: 0,
    });
  }

  // Whatever was not advanced pays month by month. `as_earned` advances
  // nothing, so the whole year lands here — that falls out of the arithmetic
  // rather than needing its own branch.
  const balance = Number((yr1Total - advanceAmount).toFixed(2));
  const balanceMonths = plan.asEarnedMonths;
  if (balance > 0 && balanceMonths > 0) {
    const per = Number((balance / balanceMonths).toFixed(2));
    for (let i = 1; i <= balanceMonths; i++) {
      const month = resolution.advanceMonths + i;
      rows.push({
        policy_id: policyId,
        agent_id: agentId,
        writing_agent_id: agentId,
        payment_date: ds(addMonths(effDate, month)),
        payment_type: "as_earned",
        amount: per,
        carrier: carrierName,
        product,
        is_gtl: isGtl,
        commission_pct: resolution.pct,
        client_name: clientName,
        status: "pending",
        month_number: month,
      });
    }
  }

  // Renewal rows from commission_grids (years 2-5 and 6+).
  //
  // The grid is unique on (carrier, product, level, age band). This used to
  // match on carrier and product alone and call maybeSingle(), so any carrier
  // with more than one level returned several rows, maybeSingle() errored, the
  // error went unread — only `data` was destructured — and every renewal was
  // dropped without a trace. Renewals only ever worked for carriers that
  // happened to have exactly one grid row.
  //
  // Now: the agent's own level, this agency's grid ahead of the shared
  // default, and one row taken deliberately rather than by accident.
  let gridQuery = supabase
    .from("commission_grids")
    .select("years_2_5_pct, years_6_plus_pct, level_name, organization_id, age_group_min")
    .eq("carrier_id", carrierId)
    .eq("product_name", product);

  if (myLevelName) gridQuery = gridQuery.eq("level_name", myLevelName);
  if (orgId) gridQuery = gridQuery.or(`organization_id.eq.${orgId},organization_id.is.null`);

  const { data: gridRows, error: gridError } = await gridQuery
    // An agency's own grid beats the shared default.
    .order("organization_id", { nullsFirst: false })
    // Age-banded rows need the client's age, which this function is not given.
    // The band-less row is the honest choice; ordering makes that a decision
    // rather than whatever the planner happened to return first.
    .order("age_group_min", { nullsFirst: true })
    .limit(1);

  if (gridError) {
    console.warn("[commissions] renewal grid lookup failed", {
      policyId,
      carrierId,
      product,
      level: myLevelName,
      error: gridError.message,
    });
  }

  const gridRow = gridRows?.[0] ?? null;
  if (!gridRow) {
    console.warn("[commissions] no renewal grid row — advance and trail only", {
      policyId,
      carrierId,
      product,
      level: myLevelName,
    });
  }

  const yr25pct = gridRow ? Number(gridRow.years_2_5_pct ?? 0) / 100 : 0;
  const yr6pct = gridRow ? Number(gridRow.years_6_plus_pct ?? 0) / 100 : 0;

  // Yr 2-5: months 13, 25, 37, 49 (one payment per year)
  if (yr25pct > 0) {
    for (const offset of [13, 25, 37, 49]) {
      rows.push({
        policy_id: policyId,
        agent_id: agentId,
        writing_agent_id: agentId,
        payment_date: ds(addMonths(effDate, offset)),
        payment_type: "renewal",
        amount: Number((annualPremium * yr25pct).toFixed(2)),
        carrier: carrierName,
        product,
        is_gtl: false,
        commission_pct: yr25pct * 100,
        client_name: clientName,
        status: "pending",
      });
    }
  }

  // Yr 6+: months 61, 73, 85, 97, 109 (5 years)
  if (yr6pct > 0) {
    for (const offset of [61, 73, 85, 97, 109]) {
      rows.push({
        policy_id: policyId,
        agent_id: agentId,
        writing_agent_id: agentId,
        payment_date: ds(addMonths(effDate, offset)),
        payment_type: "renewal",
        amount: Number((annualPremium * yr6pct).toFixed(2)),
        carrier: carrierName,
        product,
        is_gtl: false,
        commission_pct: yr6pct * 100,
        client_name: clientName,
        status: "pending",
      });
    }
  }

  // The whole chain, not the first five. An agency six levels deep simply did
  // not pay its owner. Each link earns the difference from the highest
  // percentage already paid below them, so the chain can never pay out more
  // than the top contract, and a non-positive spread writes nothing rather
  // than a payment of zero.
  const chain = orgCarrier?.id ? await loadUplineChain(supabase, agentId, orgCarrier.id) : [];
  for (const leg of resolveOverrides(resolution.pct, chain, annualPremium)) {
    rows.push({
      policy_id: policyId,
      agent_id: leg.agentId,
      source_agent_id: agentId,
      writing_agent_id: agentId,
      payment_date: ds(effDate),
      payment_type: "override",
      amount: leg.amount,
      carrier: carrierName,
      product,
      is_gtl: false,
      commission_pct: leg.spread,
      client_name: clientName,
      status: "pending",
      month_number: 0,
    });
  }

  const keyed = rows.map((r) => ({
    ...r,
    organization_id: orgIdEarly,
    idempotency_key: commissionKey(r),
    calc_run_id: calcRunId,
    superseded_at: null,
  }));

  if (keyed.length > 0) {
    // Upsert on the key: a retry rewrites the same values, a recalculation
    // corrects the amounts, and neither can duplicate a payment.
    const { error } = await supabase
      .from("commission_schedule")
      .upsert(keyed, { onConflict: "idempotency_key" });
    if (error) throw new Error(`Commission write failed: ${error.message}`);
  }

  // Any leg this run no longer produces is superseded rather than deleted. A
  // commission that was promised and then withdrawn is something an agent will
  // ask about, and "it is not in the table" is not an answer.
  const liveKeys = keyed.map((r) => r.idempotency_key);
  if (liveKeys.length > 0) {
    await supabase
      .from("commission_schedule")
      .update({ superseded_at: new Date().toISOString() })
      .eq("policy_id", policyId)
      .is("superseded_at", null)
      .not("idempotency_key", "in", `(${liveKeys.map((k) => `"${k}"`).join(",")})`)
      .then(
        () => {},
        (e: any) => console.error("[commissions] supersede failed:", e?.message),
      );
  }
}

// Backward compat alias
export const calculateAndInsertCommission = calculateAndInsertAllCommissions as any;
