import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateAndInsertCommission } from "@/lib/commission-calculator";

export const searchClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!data.q.trim()) return [];
    const term = `%${data.q.trim()}%`;
    const { data: rows, error } = await context.supabase
      .from("clients")
      .select("id, first_name, last_name, phone, date_of_birth")
      .or(`first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term}`)
      .limit(10);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listCarriersForDeal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("carriers")
      .select("id, name")
      .eq("active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMyActiveCarrierIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agent_commission_levels")
      .select("carrier_id")
      .eq("agent_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.carrier_id);
  });

const BeneficiarySchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().max(100).optional().or(z.literal("")),
  relationship: z.string().max(50).optional().or(z.literal("")),
  dob: z.string().optional().or(z.literal("")),
  percentage: z.number().min(0).max(100),
});

const PostDealSchema = z.object({
  client: z.object({
    existing_id: z.string().uuid().optional(),
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(10).max(20),
    date_of_birth: z.string().min(8),
  }),
  policy: z.object({
    carrier_id: z.string().uuid(),
    product: z.string().min(1).max(100),
    policy_number: z.string().trim().max(60).optional().or(z.literal("")),
    effective_date: z.string().min(8),
    face_amount: z.number().min(0),
    monthly_premium: z.number().min(0),
    status: z.enum(["issued_not_paid", "in_review"]).default("issued_not_paid"),
  }),
  beneficiaries: z.array(BeneficiarySchema).max(10),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const postDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PostDealSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Validate beneficiary percentages
    if (data.beneficiaries.length > 0) {
      const sum = data.beneficiaries.reduce((acc, b) => acc + b.percentage, 0);
      if (Math.abs(sum - 100) > 0.01) {
        throw new Error("Beneficiary percentages must sum to 100%.");
      }
    }

    // Create or reuse client
    let clientId = data.client.existing_id;
    if (!clientId) {
      const { data: newClient, error: clientErr } = await supabase
        .from("clients")
        .insert({
          agent_id: userId,
          first_name: data.client.first_name,
          last_name: data.client.last_name,
          phone: data.client.phone,
          date_of_birth: data.client.date_of_birth,
          stage: "sold",
        })
        .select("id")
        .single();
      if (clientErr) throw new Error(clientErr.message);
      clientId = newClient.id;
    }

    // Create policy
    const annual = Number((data.policy.monthly_premium * 12).toFixed(2));
    const { data: policy, error: polErr } = await supabase
      .from("policies")
      .insert({
        client_id: clientId,
        agent_id: userId,
        carrier_id: data.policy.carrier_id,
        product: data.policy.product,
        policy_number: data.policy.policy_number || null,
        effective_date: data.policy.effective_date,
        face_amount: data.policy.face_amount,
        monthly_premium: data.policy.monthly_premium,
        annual_premium: annual,
        status: data.policy.status ?? "issued_not_paid",
      })
      .select("id")
      .single();
    if (polErr) throw new Error(polErr.message);

    await calculateAndInsertCommission(
      supabase, policy.id, userId,
      data.policy.carrier_id, data.policy.product,
      data.policy.monthly_premium, data.policy.effective_date,
    );

    // Beneficiaries
    if (data.beneficiaries.length > 0) {
      const benRows = data.beneficiaries.map((b) => ({
        client_id: clientId,
        first_name: b.first_name,
        last_name: b.last_name || null,
        relationship: b.relationship || null,
        dob: b.dob || null,
        percentage: b.percentage,
      }));
      const { error: benErr } = await supabase.from("beneficiaries").insert(benRows);
      if (benErr) throw new Error(benErr.message);
    }

    // Notes -> client.notes (append)
    if (data.notes && data.notes.trim()) {
      await supabase
        .from("clients")
        .update({ notes: data.notes })
        .eq("id", clientId);
    }

    // Discord webhook — fire-and-forget
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      const { data: agentProfile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", userId)
        .maybeSingle();
      const agentName = agentProfile
        ? `${agentProfile.first_name ?? ""} ${agentProfile.last_name ?? ""}`.trim()
        : "Agent";
      const monthly = Number(data.policy.monthly_premium).toFixed(2);
      const ann = (data.policy.monthly_premium * 12).toFixed(2);
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: "🎉 New Deal Posted!",
            color: 0xC9A227,
            fields: [
              { name: "Agent",    value: agentName,                             inline: true },
              { name: "Product",  value: data.policy.product,                   inline: true },
              { name: "Monthly",  value: `$${monthly}`,                         inline: true },
              { name: "Annual",   value: `$${ann}`,                             inline: true },
              { name: "Face",     value: data.policy.face_amount ? `$${Number(data.policy.face_amount).toLocaleString()}` : "—", inline: true },
              { name: "Policy #", value: data.policy.policy_number || "Pending", inline: true },
              { name: "Effective",value: data.policy.effective_date || "TBD",   inline: true },
            ],
            timestamp: new Date().toISOString(),
          }],
        }),
      }).catch(() => {});
    }

    return { policyId: policy.id, clientId };
  });
