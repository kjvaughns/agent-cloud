export type CommissionCalcResult =
  | { ok: true; rows_inserted: number }
  | { ok: false; reason: "no_carrier" | "no_premium" | "no_writing_agent_level" };

export async function calculateAndInsertAllCommissions(
  supabase: any,
  {
    policyId,
    agentId,
    carrierId,
    product,
    monthlyPremium,
    annualPremium,
    effectiveDate,
    clientName,
  }: {
    policyId: string;
    agentId: string;
    carrierId: string | null;
    product: string;
    monthlyPremium: number;
    annualPremium?: number | null;
    effectiveDate: string | null;
    clientName: string;
  },
): Promise<CommissionCalcResult> {
  if (!carrierId) return { ok: false, reason: "no_carrier" };
  // Prefer Book of Business annual premium; fall back to monthly*12.
  const annual = annualPremium && annualPremium > 0
    ? +Number(annualPremium).toFixed(2)
    : +(Number(monthlyPremium ?? 0) * 12).toFixed(2);
  if (!annual) return { ok: false, reason: "no_premium" };


  function addMonths(d: Date, m: number): Date {
    const r = new Date(d);
    r.setMonth(r.getMonth() + m);
    return r;
  }
  function ds(d: Date) {
    return d.toISOString().slice(0, 10);
  }

  // 1. Carrier info for GTL detection
  const { data: carrier } = await supabase
    .from("carriers")
    .select("name, advance_cap, advance_cap_amount, advance_cap_months")
    .eq("id", carrierId)
    .maybeSingle();

  const isGtl = carrier?.advance_cap === "fixed";
  const capAmt = Number(carrier?.advance_cap_amount ?? 600);
  const gtlTrailMonths = Number(carrier?.advance_cap_months ?? 6);

  // 2. Writing agent's commission level
  const { data: agentLevel } = await supabase
    .from("agent_commission_levels")
    .select("commission_level, assigned_pct")
    .eq("agent_id", agentId)
    .eq("carrier_id", carrierId)
    .maybeSingle();

  if (!agentLevel?.assigned_pct) return { ok: false, reason: "no_writing_agent_level" };

  const agentPct = Number(agentLevel.assigned_pct);
  const year1 = +(annual * agentPct / 100).toFixed(2);
  const baseDate = new Date((effectiveDate || new Date().toISOString().slice(0, 10)) + "T00:00:00");

  // 3. Writing agent name
  const { data: agentProfile } = await supabase
    .from("profiles")
    .select("first_name, last_name, upline_id")
    .eq("id", agentId)
    .maybeSingle();

  const agentName = agentProfile
    ? `${agentProfile.first_name ?? ""} ${agentProfile.last_name ?? ""}`.trim()
    : "";

  // 4. Renewal rates from commission_grids
  const { data: gridRows } = await supabase
    .from("commission_grids")
    .select("years_2_5_pct, years_6_plus_pct")
    .eq("carrier_id", carrierId)
    .eq("level_name", agentLevel.commission_level ?? "")
    .limit(1);

  const yr2to5pct = Number(gridRows?.[0]?.years_2_5_pct ?? 0);
  const yr6pluspct = Number(gridRows?.[0]?.years_6_plus_pct ?? 0);

  const rows: any[] = [];

  const baseCommon = {
    policy_id: policyId,
    status: "pending",
    product,
    carrier: carrier?.name ?? null,
    is_gtl: isGtl,
    annual_premium: annual,
    client_name: clientName,
    writing_agent_id: agentId,
    writing_agent_name: agentName,
  };

  // 5. Direct writer rows (advance + trail)
  if (isGtl) {
    const advance = +Math.min(+(year1 * 0.5).toFixed(2), capAmt).toFixed(2);
    const balance = +(year1 - advance).toFixed(2);
    const trailEach = +(balance / gtlTrailMonths).toFixed(2);

    rows.push({
      ...baseCommon,
      agent_id: agentId,
      payment_date: ds(baseDate),
      payment_type: "advance",
      amount: advance,
      advance_pct: 50,
      commission_pct: agentPct,
      policy_year: 1,
      month_number: 1,
    });

    for (let i = 0; i < gtlTrailMonths; i++) {
      const monthNum = gtlTrailMonths + i + 1;
      rows.push({
        ...baseCommon,
        agent_id: agentId,
        payment_date: ds(addMonths(baseDate, monthNum - 1)),
        payment_type: "trail",
        amount: trailEach,
        advance_pct: null,
        commission_pct: agentPct,
        policy_year: 1,
        month_number: monthNum,
      });
    }
  } else {
    const advance = +(year1 * 0.75).toFixed(2);
    const trailEach = +(year1 * 0.25 / 3).toFixed(2);

    rows.push({
      ...baseCommon,
      agent_id: agentId,
      payment_date: ds(baseDate),
      payment_type: "advance",
      amount: advance,
      advance_pct: 75,
      commission_pct: agentPct,
      policy_year: 1,
      month_number: 1,
    });

    for (const monthNum of [10, 11, 12]) {
      rows.push({
        ...baseCommon,
        agent_id: agentId,
        payment_date: ds(addMonths(baseDate, monthNum - 1)),
        payment_type: "trail",
        amount: trailEach,
        advance_pct: null,
        commission_pct: agentPct,
        policy_year: 1,
        month_number: monthNum,
      });
    }
  }

  // 6. Renewals for writing agent
  if (yr2to5pct > 0) {
    const yr2to5amt = +(annual * yr2to5pct / 100).toFixed(2);
    for (const [year, month] of [
      [2, 13],
      [3, 25],
      [4, 37],
      [5, 49],
    ] as [number, number][]) {
      rows.push({
        ...baseCommon,
        agent_id: agentId,
        payment_date: ds(addMonths(baseDate, month - 1)),
        payment_type: "renewal",
        amount: yr2to5amt,
        advance_pct: null,
        commission_pct: yr2to5pct,
        policy_year: year,
        month_number: month,
      });
    }
  }

  if (yr6pluspct > 0) {
    const yr6amt = +(annual * yr6pluspct / 100).toFixed(2);
    for (const [year, month] of [
      [6, 61],
      [7, 73],
      [8, 85],
      [9, 97],
      [10, 109],
    ] as [number, number][]) {
      rows.push({
        ...baseCommon,
        agent_id: agentId,
        payment_date: ds(addMonths(baseDate, month - 1)),
        payment_type: "renewal",
        amount: yr6amt,
        advance_pct: null,
        commission_pct: yr6pluspct,
        policy_year: year,
        month_number: month,
      });
    }
  }

  // 7. Override chain — walk upline. Overrides always use standard 75/25 split.
  let currentAgentId = agentId;
  let currentPct = agentPct;
  let depth = 0;

  while (depth < 10) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("upline_id")
      .eq("id", currentAgentId)
      .maybeSingle();

    if (!prof?.upline_id) break;
    const uplineId: string = prof.upline_id;

    const { data: upLevel } = await supabase
      .from("agent_commission_levels")
      .select("assigned_pct")
      .eq("agent_id", uplineId)
      .eq("carrier_id", carrierId)
      .maybeSingle();

    const uplinePct = upLevel?.assigned_pct ? Number(upLevel.assigned_pct) : null;

    if (uplinePct !== null && uplinePct > currentPct) {
      const spreadPct = +(uplinePct - currentPct).toFixed(4);
      const overrideYear1 = +(annual * spreadPct / 100).toFixed(2);
      const overrideAdv = +(overrideYear1 * 0.75).toFixed(2);
      const overrideTrailEach = +(overrideYear1 * 0.25 / 3).toFixed(2);

      rows.push({
        ...baseCommon,
        agent_id: uplineId,
        source_agent_id: currentAgentId,
        payment_date: ds(baseDate),
        payment_type: "override",
        amount: overrideAdv,
        advance_pct: 75,
        commission_pct: spreadPct,
        policy_year: 1,
        month_number: 1,
      });

      for (const monthNum of [10, 11, 12]) {
        rows.push({
          ...baseCommon,
          agent_id: uplineId,
          source_agent_id: currentAgentId,
          payment_date: ds(addMonths(baseDate, monthNum - 1)),
          payment_type: "override",
          amount: overrideTrailEach,
          advance_pct: null,
          commission_pct: spreadPct,
          policy_year: 1,
          month_number: monthNum,
        });
      }

      currentPct = uplinePct;
    } else if (uplinePct !== null) {
      currentPct = uplinePct;
    }

    currentAgentId = uplineId;
    depth++;
  }

  // 8. Batch insert
  if (rows.length > 0) {
    const { error } = await supabase.from("commission_schedule").insert(rows);
    if (error) throw new Error(`Commission insert error: ${error.message}`);
  }
}

// Keep old name as alias for backward compatibility
export const calculateAndInsertCommission = calculateAndInsertAllCommissions as any;
