// One-shot backfill: generate commission_schedule rows for orphan policies.
// Run with:  bun /tmp/backfill-commissions.ts
import { createClient } from "@supabase/supabase-js";
import { calculateAndInsertAllCommissions } from "/dev-server/src/lib/commission-calculator.ts";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: orphans, error } = await supabase
  .from("policies")
  .select("id, agent_id, carrier_id, product, monthly_premium, annual_premium, effective_date, client_id, clients(first_name,last_name)")
  .gt("annual_premium", 0)
  .not("carrier_id", "is", null);
if (error) throw error;

// Filter to those with no commission rows
const ids = (orphans ?? []).map((p: any) => p.id);
const { data: existing } = await supabase
  .from("commission_schedule")
  .select("policy_id")
  .in("policy_id", ids);
const have = new Set((existing ?? []).map((r: any) => r.policy_id));
const todo = (orphans ?? []).filter((p: any) => !have.has(p.id));

console.log(`Backfilling ${todo.length} of ${orphans?.length ?? 0} policies`);

let ok = 0, fail = 0, skipped = 0;
const failures: any[] = [];
for (const p of todo) {
  const c = (p as any).clients;
  const clientName = c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "";
  try {
    const r = await calculateAndInsertAllCommissions(supabase, {
      policyId: p.id,
      agentId: p.agent_id,
      carrierId: p.carrier_id,
      product: p.product ?? "Unknown",
      monthlyPremium: Number(p.monthly_premium ?? 0),
      annualPremium: Number(p.annual_premium ?? 0),
      effectiveDate: p.effective_date,
      clientName,
    });
    if (r.ok) ok++;
    else { skipped++; failures.push({ id: p.id, reason: r.reason }); }
  } catch (e: any) {
    fail++;
    failures.push({ id: p.id, error: e.message });
  }
}
console.log(JSON.stringify({ ok, skipped, fail, total: todo.length }, null, 2));
if (failures.length) console.log("First 10 failures:", failures.slice(0, 10));
