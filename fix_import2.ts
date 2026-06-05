import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const JOB = "3f2432d3-741c-499b-a95c-ba6c0c0c3cc0";
const UPLINE = "ad5143d6-84b3-434f-ae0d-6ab23029740e";
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

const LABEL_TO_EMAIL: Record<string, string> = {
  "Daniel Gonzalez": "daniel.gonzalez4921@gmail.com",
  "Xaviar Watts": "xaviarwatts123@gmail.com",
  "Charles Reese": "creese2015@gmail.com",
  "Landon Boyd": "landonboydceo@gmail.com",
  "Loren Lail": "mckelvint14@gmail.com",
};

async function main() {
  const { data: job } = await admin.from("admin_import_jobs").select("extracted_json").eq("id", JOB).single();
  const ej: any = job!.extracted_json;
  const policiesRaw: any[] = ej.policies_raw ?? [];

  // Get email -> profile id
  const emailToId = new Map<string, string>();
  for (const [, email] of Object.entries(LABEL_TO_EMAIL)) {
    const { data } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (data) emailToId.set(email, data.id);
  }

  // Build (policy_number, client_normalized) -> target id
  const lookup = new Map<string, string>(); // key: "pn|clientName"
  for (const p of policiesRaw) {
    if (!p.policy_number || !p.agent_label || !p.client_label) continue;
    const email = LABEL_TO_EMAIL[p.agent_label];
    if (!email) continue;
    const targetId = emailToId.get(email);
    if (!targetId) continue;
    const key = `${String(p.policy_number).trim()}|${norm(p.client_label)}`;
    lookup.set(key, targetId);
  }

  // Reset everything currently misassigned to Kaeden that should belong to downline
  // Actually: re-process all policies in DB. For each, build its (pn, client norm), look up target.
  const { data: allPols } = await admin
    .from("policies")
    .select("id, policy_number, agent_id, client_id, clients(first_name, last_name)")
    .order("id");

  let moved = 0;
  for (const pol of allPols ?? []) {
    if (!pol.policy_number || !pol.client_id) continue;
    const c: any = pol.clients;
    const clientName = norm(`${c?.first_name ?? ""} ${c?.last_name ?? ""}`);
    const key = `${String(pol.policy_number).trim()}|${clientName}`;
    const targetId = lookup.get(key);
    if (!targetId) continue;
    if (pol.agent_id === targetId) continue;

    await admin.from("commission_schedule").delete().eq("policy_id", pol.id);
    await admin.from("policies").update({ agent_id: targetId, assigned_to_email: null }).eq("id", pol.id);
    await admin.from("clients").update({ agent_id: targetId, assigned_to_email: null }).eq("id", pol.client_id).eq("agent_id", UPLINE);
    moved++;
  }
  console.log(`Moved ${moved} policies.`);
}
main().catch(e => { console.error(e); process.exit(1); });
