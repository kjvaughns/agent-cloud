import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId, assertSameOrg, OrgAccessError } from "@/lib/org-guard";

const supabaseAdmin = _admin as any;
type Ctx = { supabase: any; userId: string };

/**
 * Notes and activity for one producer.
 *
 * The human half is `producer_notes` — what somebody learned and wrote down.
 * The machine half is `contracting_audit_log` filtered to this agent, which
 * already records every status change, document review and licence edit but
 * has never been shown anywhere. Interleaved, they are the answer to "what has
 * happened with this agent", which was previously reconstructed from memory
 * and an email thread.
 *
 * `producer_notes` ships as a migration Lovable applies by hand, so this file
 * has to work before it exists. A missing table degrades to no notes rather
 * than a broken page — see `scripts/migration-safety.ts` for why that matters
 * in this repository.
 */

/** Postgres says 42P01 for a missing relation; PostgREST forwards it. */
function isMissingTable(error: any): boolean {
  return error?.code === "42P01" ||
    /relation .*producer_notes.* does not exist/i.test(String(error?.message ?? ""));
}

export const listProducerActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agent_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new OrgAccessError("No organization on your account");
    await assertSameOrg(userId, data.agent_id);

    const notesQuery = await supabase
      .from("producer_notes")
      .select("id, body, visibility, pinned, created_at, author_id, related_request_id")
      .eq("agent_id", data.agent_id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (notesQuery.error && !isMissingTable(notesQuery.error)) {
      throw new Error(notesQuery.error.message);
    }
    const notes = notesQuery.data ?? [];
    const notesAvailable = !notesQuery.error;

    // The audit log is service-role write and read-gated on
    // can_view_contracting, so it comes back empty rather than forbidden for
    // somebody without the flag. That is the behaviour we want here.
    const { data: audit } = await supabase
      .from("contracting_audit_log")
      .select("id, action, record_type, created_at, actor_id, metadata")
      .eq("subject_agent_id", data.agent_id)
      .order("created_at", { ascending: false })
      .limit(100);

    const actorIds = Array.from(new Set([
      ...notes.map((n: any) => n.author_id),
      ...(audit ?? []).map((a: any) => a.actor_id),
    ].filter(Boolean)));

    const { data: actors } = actorIds.length
      ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", actorIds)
      : { data: [] as any[] };
    const nameById = new Map<string, string>(
      (actors ?? []).map((p: any) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Someone"]),
    );

    return {
      notesAvailable,
      canWrite: notesAvailable,
      notes: notes.map((n: any) => ({
        ...n,
        author_name: n.author_id ? (nameById.get(n.author_id) ?? "Someone") : "Someone",
        mine: n.author_id === userId,
      })),
      activity: (audit ?? []).map((a: any) => ({
        ...a,
        actor_name: a.actor_id ? (nameById.get(a.actor_id) ?? "Someone") : "The system",
      })),
    };
  });

export const addProducerNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      agent_id: z.string().uuid(),
      body: z.string().trim().min(1).max(4000),
      visibility: z.enum(["internal", "agent_visible"]).default("internal"),
      related_request_id: z.string().uuid().nullable().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new OrgAccessError("No organization on your account");
    await assertSameOrg(userId, data.agent_id);

    // Through the caller's own client, so the insert policy decides. Writing
    // this with the service role would make the policy decorative — and the
    // policy is the thing that stops an agent annotating their own file.
    const { error } = await supabase.from("producer_notes").insert({
      organization_id: orgId,
      agent_id: data.agent_id,
      author_id: userId,
      body: data.body.trim(),
      visibility: data.visibility,
      related_request_id: data.related_request_id ?? null,
    });

    if (error) {
      if (isMissingTable(error)) {
        throw new Error("Notes are not available yet. This agency's database is still being updated.");
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteProducerNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    // The delete policy allows the author and nobody else, so this needs no
    // check of its own: somebody else's note simply matches zero rows.
    const { error } = await supabase.from("producer_notes").delete().eq("id", data.id);
    if (error && !isMissingTable(error)) throw new Error(error.message);
    return { ok: true };
  });
