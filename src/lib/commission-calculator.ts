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
    .from("profiles").select("organization_id").eq("id", agentId).maybeSingle();
  return data?.organization_id ?? null;
}

/**
 * How much of year one is advanced, and over how many months the rest pays.
 *
 * Comes from the comp level the agency configured in Compensation → Levels —
 * advance_pct and advance_months have been editable there since that page was
 * written and read by nothing, so every schedule in the system was built on a
 * hard-coded 75/25 regardless of what anybody set.
 *
 * Falls back to the old constants when there is no matching level, which is
 * also what happens if row-level security keeps this agent out of the ops
 * tables: the same numbers as before rather than an error at post-deal time.
 */
async function advanceTerms(
  supabase: any,
  opts: {
    orgId: string | null;
    carrierId: string;
    levelName: string | null;
    fallbackPct: number;
    fallbackMonths: number;
  },
): Promise<{ advancePct: number; advanceMonths: number }> {
  const fallback = { advancePct: opts.fallbackPct, advanceMonths: opts.fallbackMonths };
  if (!opts.orgId || !opts.levelName) return fallback;

  const { data: orgCarrier } = await supabase
    .from("org_carriers")
    .select("id")
    .eq("organization_id", opts.orgId)
    .eq("carrier_id", opts.carrierId)
    .maybeSingle();
  if (!orgCarrier?.id) return fallback;

  const { data: level } = await supabase
    .from("carrier_comp_levels")
    .select("advance_pct, advance_months")
    .eq("org_carrier_id", orgCarrier.id)
    .eq("level_name", opts.levelName)
    .maybeSingle();
  if (!level) return fallback;

  let pct = level.advance_pct == null ? opts.fallbackPct : Number(level.advance_pct);
  if (pct > 1) pct = pct / 100;
  // A nonsensical configuration should not produce a nonsensical schedule.
  if (!(pct > 0) || pct > 1) pct = opts.fallbackPct;

  const months = Number(level.advance_months ?? 0);
  return {
    advancePct: pct,
    advanceMonths: months > 0 ? months : opts.fallbackMonths,
  };
}

export async function calculateAndInsertAllCommissions(
  supabase: any,
  input: CommissionInput,
): Promise<void> {
  const { policyId, agentId, carrierId, product, monthlyPremium, effectiveDate, clientName } = input;
  if (!carrierId || !effectiveDate) return;

  // Idempotency: skip if rows already exist
  const { data: existing } = await supabase
    .from("commission_schedule")
    .select("id")
    .eq("policy_id", policyId)
    .limit(1);
  if (existing && existing.length > 0) return;

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
  const gtlCapAmount = Number(carrier?.advance_cap_amount ?? 600);
  const gtlCapMonths = Number(carrier?.advance_cap_months ?? 6);

  // Get agent's commission level
  const { data: levelRow } = await supabase
    .from("agent_commission_levels")
    .select("assigned_pct, commission_level")
    .eq("agent_id", agentId)
    .eq("carrier_id", carrierId)
    .maybeSingle();

  // No assigned level means we do not know what this agent earns, and a
  // schedule built on a number nobody chose is worse than no schedule. Queue
  // the policy so the backfill picks it up once the level exists, and write
  // nothing in the meantime.
  if (!levelRow || levelRow.assigned_pct == null) {
    await supabase
      .from("commission_backfill_queue")
      .insert({ policy_id: policyId })
      .then(() => {}, () => {});
    console.warn(
      "[commissions] no assigned level — queued for backfill",
      { policyId, agentId, carrierId },
    );
    return;
  }

  let levelPct = Number(levelRow.assigned_pct);
  if (levelPct > 1) levelPct = levelPct / 100;
  const myLevelName: string | null = levelRow.commission_level ?? null;

  const orgId = await resolveOrgId(supabase, agentId);
  const terms = await advanceTerms(supabase, {
    orgId, carrierId, levelName: myLevelName,
    fallbackPct: isGtl ? 0.5 : 0.75,
    fallbackMonths: gtlCapMonths,
  });

  const yr1Total = annualPremium * levelPct;

  const rows: any[] = [];

  // Writing agent rows
  if (isGtl) {
    const advance = Math.min(yr1Total * terms.advancePct, gtlCapAmount);
    const balance = yr1Total - advance;
    rows.push({
      policy_id: policyId, agent_id: agentId, writing_agent_id: agentId,
      payment_date: ds(effDate), payment_type: "advance", amount: Number(advance.toFixed(2)),
      carrier: carrierName, product, is_gtl: true, commission_pct: levelPct * 100,
      client_name: clientName, status: "pending",
    });
    const gtlMonths = terms.advanceMonths || gtlCapMonths;
    for (let i = 7; i <= 6 + gtlMonths; i++) {
      rows.push({
        policy_id: policyId, agent_id: agentId, writing_agent_id: agentId,
        payment_date: ds(addMonths(effDate, i)), payment_type: "trail",
        amount: Number((balance / gtlMonths).toFixed(2)),
        carrier: carrierName, product, is_gtl: true, commission_pct: levelPct * 100,
        client_name: clientName, status: "pending",
      });
    }
  } else {
    const advance = yr1Total * terms.advancePct;
    rows.push({
      policy_id: policyId, agent_id: agentId, writing_agent_id: agentId,
      payment_date: ds(effDate), payment_type: "advance", amount: Number(advance.toFixed(2)),
      carrier: carrierName, product, is_gtl: false, commission_pct: levelPct * 100,
      client_name: clientName, status: "pending",
    });
    const trailPer = Number(((yr1Total * (1 - terms.advancePct)) / 3).toFixed(2));
    for (const offset of [9, 10, 11]) {
      rows.push({
        policy_id: policyId, agent_id: agentId, writing_agent_id: agentId,
        payment_date: ds(addMonths(effDate, offset)), payment_type: "trail",
        amount: trailPer, carrier: carrierName, product, is_gtl: false,
        commission_pct: levelPct * 100, client_name: clientName, status: "pending",
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
      policyId, carrierId, product, level: myLevelName, error: gridError.message,
    });
  }

  const gridRow = gridRows?.[0] ?? null;
  if (!gridRow) {
    console.warn("[commissions] no renewal grid row — advance and trail only", {
      policyId, carrierId, product, level: myLevelName,
    });
  }

  const yr25pct = gridRow ? Number(gridRow.years_2_5_pct ?? 0) / 100 : 0;
  const yr6pct = gridRow ? Number(gridRow.years_6_plus_pct ?? 0) / 100 : 0;

  // Yr 2-5: months 13, 25, 37, 49 (one payment per year)
  if (yr25pct > 0) {
    for (const offset of [13, 25, 37, 49]) {
      rows.push({
        policy_id: policyId, agent_id: agentId, writing_agent_id: agentId,
        payment_date: ds(addMonths(effDate, offset)), payment_type: "renewal",
        amount: Number((annualPremium * yr25pct).toFixed(2)),
        carrier: carrierName, product, is_gtl: false,
        commission_pct: yr25pct * 100, client_name: clientName, status: "pending",
      });
    }
  }

  // Yr 6+: months 61, 73, 85, 97, 109 (5 years)
  if (yr6pct > 0) {
    for (const offset of [61, 73, 85, 97, 109]) {
      rows.push({
        policy_id: policyId, agent_id: agentId, writing_agent_id: agentId,
        payment_date: ds(addMonths(effDate, offset)), payment_type: "renewal",
        amount: Number((annualPremium * yr6pct).toFixed(2)),
        carrier: carrierName, product, is_gtl: false,
        commission_pct: yr6pct * 100, client_name: clientName, status: "pending",
      });
    }
  }

  // Override chain: walk upline (max 5 levels)
  let currentAgentId = agentId;
  let currentPct = levelPct;
  let depth = 0;

  while (depth < 5) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("upline_id")
      .eq("id", currentAgentId)
      .maybeSingle();
    if (!profile?.upline_id) break;

    const uplineId: string = profile.upline_id;
    const { data: uplineLevel } = await supabase
      .from("agent_commission_levels")
      .select("assigned_pct")
      .eq("agent_id", uplineId)
      .eq("carrier_id", carrierId)
      .maybeSingle();

    if (uplineLevel) {
      let uplinePct = Number(uplineLevel.assigned_pct);
      if (uplinePct > 1) uplinePct = uplinePct / 100;
      const spread = uplinePct - currentPct;
      if (spread > 0) {
        const overrideAmt = annualPremium * spread;
        rows.push({
          policy_id: policyId, agent_id: uplineId, source_agent_id: agentId,
          writing_agent_id: agentId,
          payment_date: ds(effDate), payment_type: "override",
          amount: Number(overrideAmt.toFixed(2)),
          carrier: carrierName, product, is_gtl: false,
          commission_pct: spread * 100, client_name: clientName, status: "pending",
        });
      }
      currentPct = uplinePct;
    }
    currentAgentId = uplineId;
    depth++;
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("commission_schedule").insert(rows);
    if (error) throw new Error(`Commission insert failed: ${error.message}`);
  }
}

// Backward compat alias
export const calculateAndInsertCommission = calculateAndInsertAllCommissions as any;
