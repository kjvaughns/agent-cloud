import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Path-style Command Center Admin API: /api/public/admin/<path>.
 * Every request must send `Authorization: Bearer <AGENT_CLOUD_ADMIN_KEY>`;
 * this handler is the only gate because the prefix bypasses site auth.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: CORS });
}

function tokenMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function authorized(request: Request) {
  const expected = process.env.AGENT_CLOUD_ADMIN_KEY ?? "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return tokenMatches(provided, expected);
}

const BANNED = "876000h";
const ROLES = ["agent", "staff", "agency_owner", "manager", "super_admin", "admin"] as const;
// Command Center in_progress ↔ database pending
const TICKET_IN: Record<string, string> = {
  open: "open", in_progress: "pending", pending: "pending", resolved: "resolved", closed: "closed",
};

const schemas = {
  "users/invite": z.object({ email: z.string().trim().email().max(255), role: z.enum(ROLES) }),
  "users/magic-link": z.object({ userId: z.string().uuid(), email: z.string().trim().email().max(255) }),
  "users/status": z.object({ userId: z.string().uuid(), status: z.enum(["active", "suspended", "banned"]) }),
  "users/delete": z.object({ userId: z.string().uuid() }),
  "tickets/reply": z.object({ ticketId: z.string().uuid(), body: z.string().trim().min(1).max(10000) }),
  "tickets/status": z.object({
    ticketId: z.string().uuid(),
    status: z.enum(["open", "in_progress", "pending", "resolved", "closed"]),
  }),
};
type Path = keyof typeof schemas;

async function handlePost(path: Path, raw: unknown): Promise<Response> {
  const parsed = schemas[path].safeParse(raw);
  if (!parsed.success) return json({ error: "Invalid body", issues: parsed.error.issues }, 400);
  const input: any = parsed.data;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  switch (path) {
    case "users/invite": {
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(input.email);
      if (error) return json({ error: error.message }, 400);
      const userId = data.user?.id;
      if (userId) {
        await supabaseAdmin.from("user_roles").upsert(
          { user_id: userId, role: input.role } as any,
          { onConflict: "user_id,role", ignoreDuplicates: true },
        );
      }
      return json({ ok: true, userId, email: input.email, role: input.role });
    }
    case "users/magic-link": {
      const { data: u, error: uErr } = await supabaseAdmin.auth.admin.getUserById(input.userId);
      if (uErr || !u.user) return json({ error: "User not found" }, 404);
      if ((u.user.email ?? "").toLowerCase() !== input.email.toLowerCase()) {
        return json({ error: "Email does not match user" }, 400);
      }
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: input.email });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, link: data.properties?.action_link ?? null });
    }
    case "users/status": {
      const profileStatus = input.status === "active" ? "active" : input.status === "suspended" ? "inactive" : "terminated";
      const { data: touched, error } = await supabaseAdmin
        .from("profiles").update({ status: profileStatus } as any).eq("id", input.userId).select("id");
      if (error) return json({ error: error.message }, 500);
      if (!touched?.length) return json({ error: "User not found" }, 404);
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(input.userId, {
        ban_duration: input.status === "active" ? "none" : BANNED,
      });
      if (aErr) return json({ error: aErr.message }, 500);
      return json({ ok: true, userId: input.userId, status: input.status });
    }
    case "users/delete": {
      // Archive, not hard delete — preserves the agency's production history.
      const { data: touched, error } = await supabaseAdmin
        .from("profiles").update({ status: "terminated" } as any).eq("id", input.userId).select("id");
      if (error) return json({ error: error.message }, 500);
      if (!touched?.length) return json({ error: "User not found" }, 404);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", input.userId);
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(input.userId, { ban_duration: BANNED });
      if (aErr) return json({ error: aErr.message }, 500);
      return json({ ok: true, deleted: true, archived: true, userId: input.userId });
    }
    case "tickets/reply": {
      const { data: t } = await supabaseAdmin.from("support_tickets").select("id").eq("id", input.ticketId).maybeSingle();
      if (!t) return json({ error: "Ticket not found" }, 404);
      const { data, error } = await supabaseAdmin
        .from("support_ticket_messages")
        .insert({ ticket_id: input.ticketId, sender_role: "support", body: input.body })
        .select("id").single();
      if (error) return json({ error: error.message }, 500);
      await supabaseAdmin.from("support_tickets").update({ updated_at: new Date().toISOString() } as any).eq("id", input.ticketId);
      return json({ ok: true, messageId: data.id });
    }
    case "tickets/status": {
      const now = new Date().toISOString();
      const patch: any = { status: TICKET_IN[input.status], updated_at: now };
      if (input.status === "resolved" || input.status === "closed") patch.resolved_at = now;
      const { data: touched, error } = await supabaseAdmin
        .from("support_tickets").update(patch).eq("id", input.ticketId).select("id");
      if (error) return json({ error: error.message }, 500);
      if (!touched?.length) return json({ error: "Ticket not found" }, 404);
      return json({ ok: true, ticketId: input.ticketId, status: input.status });
    }
  }
}

export const Route = createFileRoute("/api/public/admin/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request, params }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
        if (params._splat === "health") return json({ ok: true });
        return json({ error: "Not found" }, 404);
      },
      POST: async ({ request, params }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
        const path = (params._splat ?? "").replace(/\/+$/, "");
        if (!(path in schemas)) return json({ error: "Not found" }, 404);
        let body: unknown;
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
        try {
          return await handlePost(path as Path, body);
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
        }
      },
    },
  },
});
