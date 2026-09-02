/**
 * One-shot repair: insert Book of Business rows the first import dropped.
 *
 * The export reuses placeholder policy numbers ("000", "AHL", "RN", "Trans")
 * across different clients, and the importer deduped on the number alone, so
 * every client after the first with a given placeholder was read as a policy
 * already on file and skipped. 57 real policies (~$74k of annual premium) went
 * missing that way. `isRealPolicyNumber` in src/lib/import-helpers.ts fixes the
 * rule going forward; this script backfills what was already lost.
 *
 * Run:  bun scripts/import-missed-policies.ts /tmp/missed.json <holderProfileId> [--dry]
 */
import { createClient } from "@supabase/supabase-js";
import { saveClientFullRecord } from "../src/lib/import-helpers.ts";

const [file, holderId, ...flags] = process.argv.slice(2);
const dry = flags.includes("--dry");
if (!file || !holderId) throw new Error("usage: bun scripts/import-missed-policies.ts <json> <holderProfileId> [--dry]");

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

type Row = {
  client: string; carrier: string; product: string; policy_number: string;
  status: string; monthly: number; annual: number; effective: string; agent: string;
};
const rows: Row[] = JSON.parse(await Bun.file(file).text());

// Producers: an account when they have one, otherwise the roster email so the
// policy is held on the importer with the real producer named on the row.
const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name, email");
const { data: pending } = await supabase.from("pending_agents").select("email, first_name, last_name");
const full = (f?: string | null, l?: string | null) => `${f ?? ""} ${l ?? ""}`.trim().toLowerCase();
const byName = new Map<string, { id?: string; email?: string }>();
for (const p of pending ?? []) byName.set(full(p.first_name, p.last_name), { email: p.email });
for (const p of profiles ?? []) byName.set(full(p.first_name, p.last_name), { id: p.id });

const { data: clients } = await supabase.from("clients").select("id, first_name, last_name");
const clientByName = new Map<string, string>();
for (const c of clients ?? []) clientByName.set(full(c.first_name, c.last_name), c.id);

let ok = 0, skipped = 0, failed = 0;
for (const r of rows) {
  const owner = byName.get(r.client.trim().toLowerCase() === "" ? "" : (r.agent || "").trim().toLowerCase());
  const agentId = owner?.id ?? holderId;
  const assignedEmail = owner?.id ? null : (owner?.email ?? null);
  const [first, ...rest] = r.client.split(" ");
  const existing = clientByName.get(r.client.trim().toLowerCase()) ?? null;

  if (dry) { console.log(`${existing ? "client" : "NEW   "} ${r.client} | ${r.carrier} | $${r.annual} | ${r.effective} | ${r.agent} -> ${agentId}${assignedEmail ? ` (held for ${assignedEmail})` : ""}`); ok++; continue; }

  try {
    await saveClientFullRecord(
      supabase,
      agentId,
      {
        first_name: first ?? r.client,
        last_name: rest.join(" ") || null,
        assigned_to_email: assignedEmail,
        policies: [{
          carrier_name: r.carrier || null,
          product: r.product || null,
          policy_number: r.policy_number || null,
          status: r.status || null,
          monthly_premium: r.monthly || null,
          annual_premium: r.annual || null,
          effective_date: r.effective || null,
        }],
      } as any,
      { match: { existing_client_id: existing }, backdate: true, buildCommissions: true },
    );
    ok++;
  } catch (e) {
    failed++;
    console.error("FAILED", r.client, (e as Error).message);
  }
}
console.log({ ok, skipped, failed, total: rows.length });
