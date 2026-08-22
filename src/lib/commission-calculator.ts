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
 *     renewal was silently dropped. It goes through `selectGridRule` now.
 *  3. Move a payment date. Advance percentages come from the comp level you
 *     configured; the months they land in stay fixed, because carrier draft
 *     calendars are not in this schema and inventing them would be the same
 *     mistake in a new place.
 *
 * ── The grid tier, which used to be dead ──
 *
 * `commission_grids` has carried age bands, state exceptions and risk classes
 * since the first schema, `selectGridRule` knows how to choose between them,
 * and `resolveCompensation` has a whole branch for it. Nothing ever reached
 * that branch: `CommissionInput` had no age, no state and no risk class on it,
 * so every caller resolved from flat percentages and an 82 year old was paid
 * the 55 year old's rate. The renewal lookup below said as much in its own
 * comment — "age-banded rows need the client's age, which this function is not
 * given" — and took the band-less row.
 *
 * It is given them now, and did not need to ask: Pipeline already collects the
 * date of birth, the state and tobacco use on the client, and `loadDealFacts`
 * reads them from the policy's own client record.
 *
 * One consequence worth stating plainly. Renewals no longer run their own
 * hand-written query against `commission_grids`. Two selectors over one table
 * is exactly the duplication this codebase keeps removing, and the hand-written
 * one could not see age bands, state exceptions or risk classes at all.
 */

import {
  resolveForAgent,
  loadUplineChain,
  recordSetupIssue,
} from "@/lib/compensation/lookup.server";
import {
  planYearOne, resolveOverrides, asFraction,
  RENEWAL_MONTHS, policyYearForMonth, renewalRate, renewalAmount,
} from "@/lib/compensation/resolve";
import { loadGridRows, loadDealFacts } from "@/lib/compensation/deal-pricing.server";
import { selectGridRule } from "@/lib/compensation/grid-rule";

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

/**
 * A configured number, or the fallback — never NaN.
 *
 * `numeric` columns arrive as strings through PostgREST, and `Number(null)` is
 * 0, which would silently switch renewals off rather than use the default.
 */
function num(v: unknown, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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

  // The three facts a grid rates on, read from the policy's own client rather
  // than asked for: Pipeline already holds the date of birth, the state and
  // tobacco use. Age is taken on the effective date, which is what a carrier
  // rates, not today — otherwise a policy would silently change bands on the
  // insured's birthday and every remaining renewal would repay at a new rate.
  const facts = await loadDealFacts(supabase, policyId, effectiveDate);
  const grid = orgIdEarly ? await loadGridRows(supabase, orgIdEarly, carrierId) : [];

  const resolution = orgCarrier?.id
    ? await resolveForAgent(supabase, agentId, orgCarrier.id, {
        grid,
        deal: {
          productName: product,
          age: facts.age,
          policyYear: 1,
          state: facts.state,
          riskClass: facts.riskClass,
        },
      })
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
      pct_source: resolution.pctSource,
      policy_year: 1,

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
        // The table's allowed payment types call the un-advanced balance
        // "deferred"; that is what Finances and the dashboard read.
        payment_type: "deferred",
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

  // The whole chain, not the first five. An agency six levels deep simply did
  // not pay its owner. Each link earns the difference from the highest
  // percentage already paid below them, so the chain can never pay out more
  // than the top contract, and a non-positive spread writes nothing rather
  // than a payment of zero.
  //
  // The chain is priced on THIS deal — the same grid rows, age, state and risk
  // class the writing agent was priced on. Without that, one side of the
  // subtraction came from the carrier's grid and the other from a flat agency
  // number, so a 90 over a 60 was not a 30.
  const chain = orgCarrier?.id
    ? await loadUplineChain(supabase, agentId, orgCarrier.id, {
        grid,
        deal: {
          productName: product,
          age: facts.age,
          policyYear: 1,
          state: facts.state,
          riskClass: facts.riskClass,
        },
      })
    : [];

  // An override is fronted on the same advance the writer is on. Six months
  // means half the year's spread now and half across months 7-12; nine months
  // means three quarters now and the rest across 10-12; as-earned fronts
  // nothing. It used to be one lump for the full annual spread on day one,
  // which paid an upline money the carrier had not advanced yet.
  const legs = resolveOverrides(resolution.pct, chain, annualPremium, {
    advanceMonths: resolution.advanceMonths,
  });

  for (const leg of legs) {
    if (leg.advanceAmount > 0) {
      rows.push({
        policy_id: policyId,
        agent_id: leg.agentId,
        source_agent_id: agentId,
        writing_agent_id: agentId,
        payment_date: ds(effDate),
        payment_type: "override",
        amount: leg.advanceAmount,
        carrier: carrierName,
        product,
        is_gtl: false,
        commission_pct: leg.spread,
        pct_source: resolution.pctSource,
        client_name: clientName,
        status: "pending",
        policy_year: 1,
        month_number: 0,
      });
    }

    // The trailed half, month by month, still typed as an override so it lands
    // in the upline's override column rather than reading as their own deal.
    if (leg.trailAmount > 0) {
      for (let i = 1; i <= leg.trailMonths; i++) {
        const month = resolution.advanceMonths + i;
        rows.push({
          policy_id: policyId,
          agent_id: leg.agentId,
          source_agent_id: agentId,
          writing_agent_id: agentId,
          payment_date: ds(addMonths(effDate, month)),
          payment_type: "override",
          amount: leg.trailAmount,
          carrier: carrierName,
          product,
          is_gtl: false,
          commission_pct: leg.spread,
          pct_source: resolution.pctSource,
          client_name: clientName,
          status: "pending",
          policy_year: 1,
          month_number: month,
        });
      }
    }
  }

  // ── Renewals ──────────────────────────────────────────────────────────────
  //
  // Two things were wrong. The grid lookup went through `selectGridRule`, which
  // is right, but a carrier whose grid publishes no renewal row produced NO
  // renewals at all — silently, for the life of every policy on that carrier,
  // which is most of them, because almost nobody types a renewal schedule in.
  // And the schedule split years 2-5 from years 6+ for no reason other than
  // that grids publish those bands separately.
  //
  // So: the grid still wins wherever it speaks, the agency's own default fills
  // in wherever it does not, and every renewal month asks the same question.
  const { data: orgSettings } = orgIdEarly
    ? await supabase
        .from("organization_settings")
        // select("*") because these two columns arrive with a migration and
        // PostgREST rejects the whole select with 42703 when one is missing.
        .select("*")
        .eq("organization_id", orgIdEarly)
        .maybeSingle()
    : { data: null };

  // Absent settings row → the same numbers the column defaults carry, so an
  // agency that has never opened the page still gets renewals.
  const defaultRenewalPct = num(orgSettings?.renewal_pct_default, 3);
  const defaultOverrideRenewalPct = num(orgSettings?.override_renewal_pct_default, 1);

  const renewalQuery = {
    levelName: myLevelName,
    productName: product,
    age: facts.age,
    state: facts.state,
    riskClass: facts.riskClass,
  };

  for (const month of RENEWAL_MONTHS) {
    const policyYear = policyYearForMonth(month);
    const gridRow = selectGridRule(grid, { ...renewalQuery, policyYear });
    const personal = renewalRate(gridRow?.pct ?? null, defaultRenewalPct);
    const date = ds(addMonths(effDate, month));

    if (personal) {
      rows.push({
        policy_id: policyId,
        agent_id: agentId,
        writing_agent_id: agentId,
        payment_date: date,
        payment_type: "renewal",
        amount: renewalAmount(annualPremium, personal.pct),
        carrier: carrierName,
        product,
        is_gtl: false,
        commission_pct: personal.pct,
        pct_source: personal.source,
        client_name: clientName,
        status: "pending",
        policy_year: policyYear,
        month_number: month,
      });
    }

    // Every upline earns the override renewal — each of them the same
    // percentage of ALP, not one percent shared out. A renewal is a servicing
    // payment on a policy that stayed on the books, and everyone who supports
    // that agent is still supporting it in year six.
    for (const leg of legs) {
      rows.push({
        policy_id: policyId,
        agent_id: leg.agentId,
        source_agent_id: agentId,
        writing_agent_id: agentId,
        payment_date: date,
        payment_type: "renewal",
        amount: renewalAmount(annualPremium, defaultOverrideRenewalPct),
        carrier: carrierName,
        product,
        is_gtl: false,
        commission_pct: defaultOverrideRenewalPct,
        pct_source: "agency_default",
        client_name: clientName,
        status: "pending",
        policy_year: policyYear,
        month_number: month,
      });
    }
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
