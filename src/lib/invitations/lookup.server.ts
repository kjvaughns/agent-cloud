/**
 * The four facts an invitation decision needs, and where they come from.
 *
 * `invitations/permissions.ts` holds the rules and no queries; this holds the
 * queries and no rules. The split is the same one the compensation resolver
 * uses, and for the same reason: the ordering edges are what get broken, and
 * they are only testable if nothing in them touches a database.
 *
 * Everything here reads through the caller's own client, so RLS decides what
 * is visible — a rung belonging to another agency simply does not come back,
 * and the rule that refuses it never has to trust an id from the browser.
 * `supabaseAdmin` appears once, for the audit row, because `audit_log` is
 * insert-by-service-role by design.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ROLE_RANK, type Rung } from "./permissions";

export type InviteContext = {
  organizationId: string | null;
  /** Every role the caller holds, as stored. */
  roles: string[];
  /** The most access of them, which is what the rules compare against. */
  role: string | null;
  /** The caller's own position on the ladder, if they have been given one. */
  rung: Rung | null;
  /** Active and inactive both: the rules need to say "that level is retired". */
  rungs: Rung[];
};

/** Most access first, matching the ladder in `permissions.ts`. */
export function highestRole(roles: string[]): string | null {
  let best: string | null = null;
  for (const r of roles) {
    if (best === null || (ROLE_RANK[r] ?? 0) > (ROLE_RANK[best] ?? 0)) best = r;
  }
  return best;
}

export async function loadInviteContext(supabase: any, userId: string): Promise<InviteContext> {
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    // select("*") rather than naming columns: PostgREST rejects the whole
    // select when one name is not there yet, and this file is read by code
    // that ships before its migrations.
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  const organizationId: string | null = profile?.organization_id ?? null;
  const roles = ((roleRows ?? []) as any[]).map((r) => String(r.role));

  let rungs: Rung[] = [];
  if (organizationId) {
    const { data } = await supabase
      .from("agency_levels")
      .select("*")
      .eq("organization_id", organizationId);
    rungs = ((data ?? []) as any[]).map(toRung);
  }

  const myRungId = profile?.agency_level_id ?? null;
  return {
    organizationId,
    roles,
    role: highestRole(roles),
    // Found among the agency's own rungs, never fetched by id on its own: a
    // position from somewhere else is not a position here.
    rung: myRungId ? (rungs.find((r) => r.id === myRungId) ?? null) : null,
    rungs,
  };
}

/** `can_invite` rides along so `canRecruit` can read it off the same object. */
function toRung(row: any): Rung & { can_invite?: boolean } {
  return {
    id: row.id,
    name: row.name ?? "",
    base_pct: row.base_pct == null ? null : Number(row.base_pct),
    active: row.active !== false,
    can_invite: row.can_invite !== false,
  };
}

/**
 * The rung an invitation asks for, as the rules want to see it.
 *
 * An id that is not one of the agency's own becomes a stand-in rather than
 * null, so the refusal says "that level belongs to a different agency" instead
 * of quietly behaving as though no level had been asked for.
 */
export function requestedRungFrom(ctx: InviteContext, id: string | null | undefined): Rung | null {
  if (!id) return null;
  return ctx.rungs.find((r) => r.id === id) ?? { id, name: "", base_pct: null, active: true };
}

/**
 * Is there already an open invitation for this email in this agency?
 *
 * Open means: not revoked, not finished, not yet claimed, and not past its
 * expiry. A second live invitation for one person is how somebody ends up
 * with two accounts on two different rungs under two different uplines, and
 * the one they click is chance.
 */
export async function hasOpenInvitation(
  supabase: any,
  args: { email: string; organizationId: string | null },
): Promise<boolean> {
  const email = args.email.trim();
  if (!email) return false;

  let q = supabase
    .from("invitation_links")
    .select("id")
    // ilike with no wildcards is an exact match that ignores case — stored
    // addresses are whatever the sender typed.
    .ilike("new_agent_email", email)
    .is("linked_agent_id", null)
    .not("status", "in", "(revoked,completed)")
    // Links no longer expire; legacy rows with a date still count as open
    // only while that date is in the future.
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .limit(1);

  q = args.organizationId
    ? q.eq("organization_id", args.organizationId)
    : q.is("organization_id", null);

  const { data } = await q;
  return ((data ?? []) as any[]).length > 0;
}

/**
 * One line in `audit_log` per invitation that is created or revoked.
 *
 * An invitation is a grant of standing — a rung, an upline, a role — made by
 * one person about another before that other person exists. Without a record,
 * the only trace afterwards is a profile nobody remembers placing.
 *
 * Never fatal: an audit row that fails to write must not undo the action it
 * describes, and the caller has already done the thing.
 */
export async function auditInvitation(
  action: "invitation.created" | "invitation.revoked",
  args: {
    organizationId: string | null;
    performedBy: string;
    targetUserId?: string | null;
    previous?: unknown;
    next?: unknown;
  },
): Promise<void> {
  try {
    await supabaseAdmin.from("audit_log").insert({
      organization_id: args.organizationId,
      performed_by: args.performedBy,
      action,
      target_user_id: args.targetUserId ?? null,
      previous_value: (args.previous ?? null) as any,
      new_value: (args.next ?? null) as any,
    });
  } catch (e) {
    console.error("[invitations] audit write failed", action, e);
  }
}
