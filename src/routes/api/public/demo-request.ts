import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { guardPublicEndpoint } from "@/lib/rate-limit";

/**
 * Demo request capture.
 *
 * Unauthenticated, so it runs behind the shared rate limiter and carries a
 * honeypot. Only the fields a first sales conversation actually needs.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const Schema = z.object({
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(30).optional().nullable(),
  agency_name: z.string().trim().max(120).optional().nullable(),
  agent_count: z.string().trim().max(40).optional().nullable(),
  current_tools: z.string().trim().max(300).optional().nullable(),
  primary_challenge: z.string().trim().max(1000).optional().nullable(),
  preferred_time: z.string().trim().max(80).optional().nullable(),
  source: z.string().trim().max(60).optional().nullable(),
  utm: z.record(z.string(), z.string()).optional(),
  // Honeypot: real people leave it empty.
  hp: z.string().max(0).optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/public/demo-request")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),

      POST: async ({ request }) => {
        const limited = await guardPublicEndpoint(request, "demo-request", { perIp: 5, global: 300, headers: cors });
        if (limited) return limited;

        let input: z.infer<typeof Schema>;
        try {
          input = Schema.parse(await request.json());
        } catch {
          return json({ error: "Please check the form and try again." }, 400);
        }

        // Honeypot filled: accept silently so the bot sees success.
        if (input.hp) return json({ ok: true });

        const { hp: _hp, ...row } = input;

        const { data: lead, error } = await (supabaseAdmin as any)
          .from("demo_requests")
          .insert(row)
          .select("id")
          .single();

        if (error) return json({ error: "Something went wrong. Please try again." }, 500);

        // Notify platform admins and give them a task, so the lead has an
        // owner rather than sitting in a table nobody watches.
        try {
          const { data: admins } = await (supabaseAdmin as any)
            .from("user_roles").select("user_id").eq("role", "super_admin");

          const { queueEmail } = await import("@/lib/email/send.server");

          for (const a of admins ?? []) {
            await (supabaseAdmin as any).from("notifications").insert({
              user_id: a.user_id,
              title: "New demo request",
              description: `${row.first_name} ${row.last_name}${row.agency_name ? ` — ${row.agency_name}` : ""}`,
              type: "sales",
            });
            await (supabaseAdmin as any).from("tasks").insert({
              title: `Follow up: ${row.first_name} ${row.last_name}`,
              description: [row.agency_name, row.email, row.primary_challenge].filter(Boolean).join("\n"),
              assigned_to: a.user_id,
              created_by: a.user_id,
              priority: "high",
            });
            await queueEmail({
              template: "demo-request",
              profileId: a.user_id,
              category: "transactional",
              key: `demo-request:${lead.id}:${a.user_id}`,
              data: {
                name: `${row.first_name} ${row.last_name}`.trim(),
                company: row.agency_name ?? undefined,
                email: row.email ?? undefined,
                phone: (row as any).phone ?? undefined,
                teamSize: (row as any).team_size ?? undefined,
                message: (row as any).primary_challenge ?? undefined,
              },
            });
          }
        } catch {
          // Notification failure must not lose the lead — it is already saved.
        }


        return json({ ok: true, id: lead.id });
      },
    },
  },
});
