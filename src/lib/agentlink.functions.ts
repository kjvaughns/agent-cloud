import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ImportSchema = z.object({
  api_key: z.string().min(10),
  base_url: z.string().url().optional().default("https://agentlink.insuracloud.ai"),
});

export const importAgentLinkBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const al = (path: string) =>
      fetch(`${data.base_url}${path}`, {
        headers: { "x-api-key": data.api_key },
      }).then((r) => {
        if (!r.ok) throw new Error(`AgentLink request failed: ${r.status} ${r.statusText}`);
        return r.json();
      });

    const raw = await al("/api/v1/book-of-business");

    // Handle array or wrapper object response shapes
    const contacts: any[] = Array.isArray(raw)
      ? raw
      : raw?.contacts ?? raw?.clients ?? raw?.records ?? raw?.data ?? [];

    if (!Array.isArray(contacts)) {
      throw new Error("Could not parse AgentLink response — unexpected format from book-of-business endpoint.");
    }

    let imported = 0;
    let errors = 0;

    for (const contact of contacts) {
      try {
        const { data: client, error: clientErr } = await supabase
          .from("clients")
          .upsert(
            {
              agent_id: userId,
              first_name: contact.first_name,
              last_name: contact.last_name,
              phone: contact.phone,
              email: contact.email ?? "",
              date_of_birth: contact.dob ?? null,
              street_address: contact.address?.street ?? "",
              city: contact.address?.city ?? "",
              state: contact.address?.state ?? "",
              zip_code: contact.address?.zip ?? "",
              stage: "new",
              temperature: "cold",
            },
            { onConflict: "agent_id,phone", ignoreDuplicates: false },
          )
          .select("id")
          .single();

        if (clientErr || !client) { errors++; continue; }
        const clientId = client.id;

        // Policies
        const policies: any[] = contact.policies ?? [];
        for (const pol of policies) {
          await supabase.from("policies").upsert(
            {
              client_id: clientId,
              agent_id: userId,
              policy_number: pol.policy_number,
              product: pol.product_name,
              status: pol.status ?? "active",
              annual_premium: Number(pol.annual_premium ?? 0),
              monthly_premium: Number(pol.monthly_premium ?? 0),
              face_amount: Number(pol.face_amount ?? 0),
              effective_date: pol.effective_date ?? null,
              posted_at: pol.created_at ?? new Date().toISOString(),
            },
            { onConflict: "client_id,policy_number", ignoreDuplicates: false },
          );
        }

        // Notes
        const notes: any[] = contact.notes ?? [];
        for (const note of notes) {
          await supabase.from("contact_history").insert({
            client_id: clientId,
            agent_id: userId,
            contact_type: "import",
            note: note.content,
            is_auto: true,
            created_at: note.created_at ?? new Date().toISOString(),
          });
        }

        // Banking
        const banking = contact.banking ?? contact.bank;
        if (banking?.bank_name) {
          await supabase.from("client_banking").upsert(
            {
              client_id: clientId,
              bank_name: banking.bank_name,
              routing_number: banking.routing_number ?? "",
              account_number_masked: banking.account_number_masked ?? "",
              account_type: banking.account_type ?? "checking",
            },
            { onConflict: "client_id" },
          );
        }

        imported++;
      } catch {
        errors++;
      }
    }

    return { imported, errors, total: contacts.length };
  });
