import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { deactivatedProfileIds } from "@/lib/agents/inactive";
import {
  NO_SCOPE_CAPABILITIES, scopeSchema, type Scope, type ScopeCapabilities,
} from "@/lib/scope";

type Ctx = { supabase: any; userId: string };

/**
 * The server half of the scope layer.
 *
 * Two things live here: what a person may look at, and which agent ids a given
 * scope covers. Both defer to SQL — `my_scopes()` and `scope_agent_ids()` —
 * because the answer depends on the upline chain and on organisation
 * membership, and re-deriving either in TypeScript is how the two drift apart.
 */

export const getScopeCapabilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ScopeCapabilities> => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase.rpc("my_scopes");
    // A failure here must not hand somebody a wider view than they have. The
    // narrow answer is the safe one, and it degrades to "no toggle at all".
    if (error || !data) return NO_SCOPE_CAPABILITIES;
    return {
      downlineCount: Number((data as any).downline_count ?? 0),
      canAgency: Boolean((data as any).can_agency),
      canEditTeamRecords: Boolean((data as any).can_edit_team_records),
      // Absent before the imo-scope migration, and Boolean(undefined) is the
      // right answer for that window: no Total IMO option until it exists.
      canImo: Boolean((data as any).can_imo),
    };
  });

/**
 * The agent ids a scope covers, for the caller.
 *
 * Every scoped query narrows with this rather than dropping its filter and
 * letting row-level security decide. Those two are not the same thing: for an
 * org owner, "no filter" silently means the whole agency, so a Team view built
 * that way shows agency numbers under a Team label with nothing to indicate it.
 * Asking explicitly is what keeps the two apart.
 *
 * Authorization lives inside the SQL function, so a scope the caller may not
 * open narrows to one they may rather than erroring.
 */
export async function resolveScopeAgentIds(supabase: any, scope: Scope): Promise<string[]> {
  const { data, error } = await supabase.rpc("scope_agent_ids", { _scope: scope });
  if (error) throw new Error(error.message);
  return unwrapAgentIds(data);
}

/**
 * The same set, for surfaces that manage a downline rather than read scoped
 * data.
 *
 * The difference is which way each one must fail. A scoped *read* has to
 * throw: silently returning nothing would show a Team view as empty, and
 * silently widening would leak. A management surface has neither problem —
 * there is no scope label to be wrong about — and it wants the answer the
 * rest of the app is already giving.
 *
 * That matters most while `scope_agent_ids` does not exist yet, between a
 * deploy and its migration. In that window getScopeCapabilities returns
 * NO_SCOPE_CAPABILITIES, so every sidebar, toggle and page in the app reports
 * a downline of zero. A page that threw instead would be the only thing
 * disagreeing — and it would disagree by breaking.
 */
export async function resolveScopeAgentIdsOrNone(supabase: any, scope: Scope): Promise<string[]> {
  const { data, error } = await supabase.rpc("scope_agent_ids", { _scope: scope });
  if (error) return [];
  return unwrapAgentIds(data);
}

/**
 * The RPC returns a set of uuids, which arrives as either bare strings or
 * single-key rows depending on the client version.
 */
function unwrapAgentIds(data: unknown): string[] {
  return ((data ?? []) as any[]).map((row: any) =>
    typeof row === "string" ? row : row.scope_agent_ids ?? row.id,
  );
}

/** People to choose from within a scope — the agent picker's source. */
export const listScopeAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scopeSchema.parse((d as any)?.scope ?? "team"))
  .handler(async ({ data: scope, context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase.rpc("get_scope_agents", { _scope: scope });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as {
      id: string; first_name: string | null; last_name: string | null;
    }[];
    // Deactivated people stay in the picker — their book is still on ours —
    // and are labelled inactive, the same as producers with no account.
    const off = await deactivatedProfileIds(supabase, rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, inactive: off.has(r.id) }));
  });
