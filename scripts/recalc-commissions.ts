/**
 * Recalculate every policy's commission schedule.
 *
 * Needed once because provisional (carrier-not-configured) policies were
 * calculated as-earned, which read as a year of trail income on Finances for
 * business that was in fact advanced. `calculateAndInsertAllCommissions`
 * supersedes the legs it no longer produces, so this is safe to re-run.
 *
 *   bun scripts/recalc-commissions.ts
 */
import { createClient } from "@supabase/supabase-js";
import { calculateAndInsertAllCommissions } from "../src/lib/commission-calculator.ts";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const { data: policies, error } = await supabase
  .from("policies")
  .select(
    "id, agent_id, carrier_id, product, monthly_premium, annual_premium, effective_date, clients(first_name,last_name)",
  )
  .gt("annual_premium", 0)
  .not("carrier_id", "is", null)
  .not("effective_date", "is", null);
if (error) throw error;

console.log(`Recalculating ${policies?.length ?? 0} policies`);

let ok = 0, skipped = 0, fail = 0;
const failures: any[] = [];
for (const p of policies ?? []) {
  const c = (p as any).clients;
  try {
    const r = await calculateAndInsertAllCommissions(supabase, {
      policyId: p.id,
      agentId: p.agent_id,
      carrierId: p.carrier_id,
      product: p.product ?? "Unknown",
      monthlyPremium: Number(p.monthly_premium ?? 0),
      annualPremium: Number(p.annual_premium ?? 0),
      effectiveDate: p.effective_date,
      clientName: c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "",
    });
    if (r?.ok === false) { skipped++; failures.push({ id: p.id, reason: r.reason }); }
    else ok++;
  } catch (e: any) {
    fail++;
    failures.push({ id: p.id, error: e.message });
  }
}
console.log(JSON.stringify({ ok, skipped, fail }, null, 2));
if (failures.length) console.log("First 10:", failures.slice(0, 10));
