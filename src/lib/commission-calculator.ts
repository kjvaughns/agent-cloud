import { createServerFn } from "@tanstack/start-client-core";

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

  let levelPct = levelRow ? Number(levelRow.assigned_pct) : 70;
  if (levelPct > 1) levelPct = levelPct / 100;

  const yr1Total = annualPremium * levelPct;

  const rows: any[] = [];

  // Writing agent rows
  if (isGtl) {
    const advance = Math.min(yr1Total * 0.5, gtlCapAmount);
    const balance = yr1Total - advance;
    rows.push({
      policy_id: policyId, agent_id: agentId, writing_agent_id: agentId,
      payment_date: ds(effDate), payment_type: "advance", amount: Number(advance.toFixed(2)),
      carrier: carrierName, product, is_gtl: true, commission_pct: levelPct * 100,
      client_name: clientName, status: "pending",
    });
    for (let i = 7; i <= 6 + gtlCapMonths; i++) {
      rows.push({
        policy_id: policyId, agent_id: agentId, writing_agent_id: agentId,
        payment_date: ds(addMonths(effDate, i)), payment_type: "trail",
        amount: Number((balance / gtlCapMonths).toFixed(2)),
        carrier: carrierName, product, is_gtl: true, commission_pct: levelPct * 100,
        client_name: clientName, status: "pending",
      });
    }
  } else {
    const advance = yr1Total * 0.75;
    rows.push({
      policy_id: policyId, agent_id: agentId, writing_agent_id: agentId,
      payment_date: ds(effDate), payment_type: "advance", amount: Number(advance.toFixed(2)),
      carrier: carrierName, product, is_gtl: false, commission_pct: levelPct * 100,
      client_name: clientName, status: "pending",
    });
    const trailPer = Number(((yr1Total * 0.25) / 3).toFixed(2));
    for (const offset of [9, 10, 11]) {
      rows.push({
        policy_id: policyId, agent_id: agentId, writing_agent_id: agentId,
        payment_date: ds(addMonths(effDate, offset)), payment_type: "trail",
        amount: trailPer, carrier: carrierName, product, is_gtl: false,
        commission_pct: levelPct * 100, client_name: clientName, status: "pending",
      });
    }
  }

  // Renewal rows from commission_grids (years 2-5 and 6+)
  const { data: gridRow } = await supabase
    .from("commission_grids")
    .select("years_2_5_pct, years_6_plus_pct")
    .eq("carrier_id", carrierId)
    .eq("product_name", product)
    .not("level_name", "is", null)
    .maybeSingle();

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
