export async function calculateAndInsertCommission(
  supabase: any,
  policyId: string,
  agentId: string,
  carrierId: string | null,
  product: string,
  monthlyPremium: number,
  effectiveDate: string | null,
) {
  if (!carrierId || !monthlyPremium) return;

  const { data: myLevel } = await supabase
    .from("agent_commission_levels")
    .select("assigned_pct")
    .eq("agent_id", agentId)
    .eq("carrier_id", carrierId)
    .maybeSingle();
  const agentPct = myLevel ? Number(myLevel.assigned_pct) / 100 : 0;
  if (agentPct === 0) return;

  const annual = monthlyPremium * 12;
  const advance = annual * agentPct * 0.75;
  const deferred = annual * agentPct * 0.25;
  const baseDate = effectiveDate || new Date().toISOString().slice(0, 10);
  const advDate = new Date(baseDate);
  advDate.setDate(advDate.getDate() + 14);
  const defDate = new Date(advDate);
  defDate.setDate(defDate.getDate() + 90);

  await supabase.from("commission_schedule").insert([
    {
      policy_id: policyId,
      agent_id: agentId,
      payment_date: advDate.toISOString().slice(0, 10),
      payment_type: "advance",
      amount: +advance.toFixed(2),
      status: "pending",
      product,
      commission_pct: agentPct * 100,
      advance_pct: 75,
    },
    {
      policy_id: policyId,
      agent_id: agentId,
      payment_date: defDate.toISOString().slice(0, 10),
      payment_type: "deferred",
      amount: +deferred.toFixed(2),
      status: "pending",
      product,
      commission_pct: agentPct * 100,
    },
  ]);

  // Upline override
  const { data: profile } = await supabase
    .from("profiles")
    .select("upline_id")
    .eq("id", agentId)
    .maybeSingle();
  if (!profile?.upline_id) return;

  const { data: upLevel } = await supabase
    .from("agent_commission_levels")
    .select("assigned_pct")
    .eq("agent_id", profile.upline_id)
    .eq("carrier_id", carrierId)
    .maybeSingle();
  if (!upLevel) return;

  const overridePct = Math.max(0, Number(upLevel.assigned_pct) / 100 - agentPct);
  const overrideAmt = annual * overridePct * 0.75;
  if (overrideAmt > 0) {
    await supabase.from("commission_schedule").insert({
      policy_id: policyId,
      agent_id: profile.upline_id,
      source_agent_id: agentId,
      payment_date: advDate.toISOString().slice(0, 10),
      payment_type: "override",
      amount: +overrideAmt.toFixed(2),
      status: "pending",
      product,
      commission_pct: +(overridePct * 100).toFixed(2),
    });
  }
}
