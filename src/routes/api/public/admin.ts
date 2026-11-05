import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Server-to-server Admin API for the Agent Cloud Command Center.
 *
 * Every request needs `Authorization: Bearer <AGENT_CLOUD_ADMIN_KEY>`. The
 * prefix bypasses site auth, so this handler is the only gate — a missing or
 * wrong token gets a bare 401 with no body detail, and the env var is read
 * per-request (workerd injects env per request, never at module scope).
 *
 * Ticket status vocabulary differs between the two apps: the Command Center
 * speaks open / in_progress / resolved, this database speaks open / pending /
 * resolved / closed. Both directions are mapped at the boundary so neither
 * side has to know the other's names.
 */

const APP_NAME = "Agent Cloud";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

/** Constant-time comparison without node:crypto (workerd-safe). */
function tokenMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}

// Command Center → database
const STATUS_IN: Record<string, string> = { open: "open", in_progress: "pending", resolved: "resolved" };
// database → Command Center
const STATUS_OUT: Record<string, string> = { open: "open", pending: "in_progress", resolved: "resolved", closed: "resolved" };

// Highest-privilege role wins when a user holds several. Legacy "admin"
// stays listed — the role enum is append-only.
const ROLE_PRIORITY = ["super_admin", "agency_owner", "admin", "manager", "agent"];

const bodySchema = z.object({
  action: z.string().min(1).max(50),
  payload: z.unknown().optional(),
});

const updateTicketSchema = z.object({
  ticket_id: z.string().uuid(),
  status: z.enum(["open", "in_progress", "resolved"]),
  note: z.string().trim().max(2000).optional(),
});

const listUsersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

const updateUserStatusSchema = z.object({
  user_id: z.string().uuid(),
  status: z.enum(["active", "deactivated"]),
});

const deleteUserSchema = z.object({
  user_id: z.string().uuid(),
});

const BANNED = "876000h"; // ~100 years — the auth-level "cannot sign in"

async function handle(action: string, payload: unknown): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  switch (action) {
    case "ping":
    case "health": {
      const [{ count: totalUsers }, { count: openTickets }] = await Promise.all([
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
      ]);
      return Response.json({
        status: "ok",
        app: APP_NAME,
        timestamp: new Date().toISOString(),
        stats: { totalUsers: totalUsers ?? 0, openTickets: openTickets ?? 0 },
      });
    }

    case "get_support_tickets": {
      const { data: tickets, error } = await supabaseAdmin
        .from("support_tickets")
        .select("id, agent_id, subject, description, status, priority, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      const agentIds = Array.from(new Set((tickets ?? []).map((t) => t.agent_id).filter(Boolean)));
      const emailById = new Map<string, string>();
      if (agentIds.length) {
        const { data: people } = await supabaseAdmin.from("profiles").select("id, email").in("id", agentIds);
        for (const p of people ?? []) emailById.set(p.id, p.email ?? "");
      }

      return Response.json({
        tickets: (tickets ?? []).map((t) => ({
          id: t.id,
          user_email: emailById.get(t.agent_id) ?? null,
          subject: t.subject,
          message: t.description,
          status: STATUS_OUT[t.status] ?? t.status,
          priority: t.priority,
          created_at: t.created_at,
        })),
      });
    }

    case "update_ticket_status": {
      const data = updateTicketSchema.parse(payload ?? {});
      const now = new Date().toISOString();
      // `any`: the generated Update type rejects a conditionally-added
      // resolved_at, and the project's other ticket writes do the same.
      const patch: any = { status: STATUS_IN[data.status], updated_at: now };
      if (data.status === "resolved") patch.resolved_at = now;

      const { data: touched, error } = await supabaseAdmin
        .from("support_tickets")
        .update(patch)
        .eq("id", data.ticket_id)
        .select("id");
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!touched?.length) return Response.json({ error: "Ticket not found" }, { status: 404 });

      if (data.note) {
        // sender_id stays null: this note came from the Command Center, not a user.
        await supabaseAdmin.from("support_ticket_messages").insert({
          ticket_id: data.ticket_id,
          sender_role: "support",
          body: data.note,
        });
      }
      return Response.json({ ok: true, ticket_id: data.ticket_id, status: data.status });
    }

    case "list_users": {
      const data = listUsersSchema.parse(payload ?? {});
      let q = supabaseAdmin
        .from("profiles")
        .select("id, email, first_name, last_name, status, created_at")
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (data.search) {
        const s = data.search.replace(/[%_,()"]/g, " ").trim();
        if (s) q = q.or(`email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%`);
      }
      const { data: users, error } = await q;
      if (error) return Response.json({ error: error.message }, { status: 500 });

      const ids = (users ?? []).map((u) => u.id);
      const roleById = new Map<string, string>();
      if (ids.length) {
        const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids);
        for (const r of roles ?? []) {
          const current = roleById.get(r.user_id);
          if (!current || ROLE_PRIORITY.indexOf(r.role) < ROLE_PRIORITY.indexOf(current)) {
            roleById.set(r.user_id, r.role);
          }
        }
      }

      return Response.json({
        users: (users ?? []).map((u) => ({
          id: u.id,
          email: u.email,
          full_name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || null,
          role: roleById.get(u.id) ?? "agent",
          status: u.status,
          created_at: u.created_at,
        })),
      });
    }

    case "update_user_status": {
      const data = updateUserStatusSchema.parse(payload ?? {});
      const active = data.status === "active";

      const { data: touched, error } = await supabaseAdmin
        .from("profiles")
        .update({ status: active ? "active" : "inactive" })
        .eq("id", data.user_id)
        .select("id");
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!touched?.length) return Response.json({ error: "User not found" }, { status: 404 });

      // The profile status drives in-app treatment; the auth ban drives
      // whether they can sign in at all. Both move together.
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
        ban_duration: active ? "none" : BANNED,
      });
      if (authErr) return Response.json({ error: authErr.message }, { status: 500 });

      return Response.json({ ok: true, user_id: data.user_id, status: data.status });
    }

    case "delete_user": {
      const data = deleteUserSchema.parse(payload ?? {});

      // Archive, not hard delete: policies, clients and commission rows all
      // reference this agent, and removing the auth user cascades to the
      // profile — orphaning the agency's production history. "Deleted" here
      // means cannot sign in, holds no roles, and shows as terminated.
      const { data: touched, error } = await supabaseAdmin
        .from("profiles")
        .update({ status: "terminated" })
        .eq("id", data.user_id)
        .select("id");
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!touched?.length) return Response.json({ error: "User not found" }, { status: 404 });

      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
        ban_duration: BANNED,
      });
      if (authErr) return Response.json({ error: authErr.message }, { status: 500 });

      return Response.json({ deleted: true, user_id: data.user_id, archived: true });
    }

    default:
      return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

export const Route = createFileRoute("/api/public/admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.AGENT_CLOUD_ADMIN_KEY ?? "";
        const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        if (!tokenMatches(provided, expected)) return unauthorized();

        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        try {
          return await handle(body.action, body.payload);
        } catch (err) {
          if (err instanceof z.ZodError) {
            return Response.json({ error: "Invalid payload", issues: err.issues }, { status: 400 });
          }
          return Response.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
        }
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
