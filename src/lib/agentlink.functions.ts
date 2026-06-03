import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ImportSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const importAgentLinkBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // Authenticate with AgentLink
    const authRes = await fetch("https://api.agentlink.io/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: data.username,
        password: data.password,
        grant_type: "password",
      }),
    });
    if (!authRes.ok) throw new Error("AgentLink authentication failed. Check your credentials.");
    const { access_token } = await authRes.json();

    const al = (path: string) =>
      fetch(`https://api.agentlink.io/v1${path}`, {
        headers: { Authorization: `Bearer ${access_token}` },
      }).then((r) => r.json());

    const contacts = await al("/contacts");
    let imported = 0;
    let errors = 0;

    for (const contact of contacts?.data ?? []) {
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
        const policiesRes = await al(`/contacts/${contact.id}/policies`);
        for (const pol of policiesRes?.data ?? []) {
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

        // Notes — insert into contact_history using real column names
        const notesRes = await al(`/contacts/${contact.id}/notes`);
        for (const note of notesRes?.data ?? []) {
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
        const bankingRes = await al(`/contacts/${contact.id}/banking`);
        if (bankingRes?.data?.bank_name) {
          await supabase.from("client_banking").upsert(
            {
              client_id: clientId,
              bank_name: bankingRes.data.bank_name,
              routing_number: bankingRes.data.routing_number ?? "",
              account_number_masked: bankingRes.data.account_number_masked ?? "",
              account_type: bankingRes.data.account_type ?? "checking",
            },
            { onConflict: "client_id" },
          );
        }

        imported++;
      } catch {
        errors++;
      }
    }

    return { imported, errors, total: contacts?.data?.length ?? 0 };
  });
