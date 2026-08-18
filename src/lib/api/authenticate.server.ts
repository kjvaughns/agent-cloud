/**
 * Turning a bearer token into an agency, and leaving a record of it.
 *
 * The public endpoints have no `auth.uid()` — the caller is somebody else's
 * website, not a signed-in person — so every read goes through the service
 * role and the tenancy boundary has to be re-established here in code. This
 * file is that boundary: one lookup, one decision (in `authorizeKey`, which is
 * pure), and one usage row whatever the outcome.
 *
 * The usage row is written for refusals too. An owner who has handed a key to
 * their upline needs to see "it is being refused" — that is the state somebody
 * actually needs to look at, and logging only successes would hide it.
 */

import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { clientIp } from "@/lib/rate-limit";
import {
  authorizeKey, parseBearer, API_REFUSAL,
  type ApiKeyRow, type ApiScope, type ApiRefusal,
} from "@/lib/api/keys";
import { hashApiKey } from "@/lib/api/keys.server";

const supabaseAdmin = _admin as any;

/** JSON out, with the headers a browser-side integration needs. */
export function apiJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

export function apiError(refusal: ApiRefusal | "bad_request" | "server_error", detail?: string): Response {
  if (refusal === "bad_request") {
    return apiJson({ error: "bad_request", message: detail ?? "Check the query parameters." }, 400);
  }
  if (refusal === "server_error") {
    return apiJson({ error: "server_error", message: detail ?? "Something went wrong." }, 500);
  }
  const { status, message } = API_REFUSAL[refusal];
  return apiJson({ error: refusal, message }, status);
}

async function record(
  request: Request,
  endpoint: string,
  status: number,
  key: { id: string; organization_id: string } | null,
): Promise<void> {
  try {
    await supabaseAdmin.from("api_key_usage").insert({
      api_key_id: key?.id ?? null,
      organization_id: key?.organization_id ?? null,
      endpoint,
      status,
      ip: clientIp(request),
    });
  } catch (e: any) {
    // Never fail a request because its audit row would not write — but never
    // silently either, which is the mistake the Discord announcer made.
    console.error("[api] usage not recorded", endpoint, e?.message);
  }
}

export type Authenticated = { key: ApiKeyRow; orgId: string };

/**
 * Authenticate, authorize, and log — or return the Response to send back.
 *
 * Returns a discriminated result rather than throwing, so the caller cannot
 * accidentally continue past a refusal.
 */
export async function authenticateApiRequest(
  request: Request,
  endpoint: string,
  required: ApiScope,
): Promise<{ ok: true; auth: Authenticated } | { ok: false; response: Response }> {
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) {
    await record(request, endpoint, 401, null);
    return { ok: false, response: apiError("no_credential") };
  }

  // Looked up by HASH, so the key itself never appears in a query, a log line
  // or a database that somebody might read later.
  const { data: row, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, organization_id, scopes, revoked_at")
    .eq("key_hash", hashApiKey(token))
    .maybeSingle();

  if (error) {
    console.error("[api] key lookup failed", endpoint, error.message);
    await record(request, endpoint, 500, null);
    return { ok: false, response: apiError("server_error") };
  }

  const decision = authorizeKey(row as ApiKeyRow | null, required);
  if (!decision.ok) {
    const { status } = API_REFUSAL[decision.refusal];
    // A key that exists is logged against itself even when refused, which is
    // what makes "my upline says it stopped working" answerable.
    await record(request, endpoint, status, row ? { id: row.id, organization_id: row.organization_id } : null);
    return { ok: false, response: apiError(decision.refusal) };
  }

  // Best effort: a key that worked should show a recent timestamp, but not at
  // the cost of the response.
  supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", decision.row.id)
    .then(undefined, (e: any) => console.error("[api] last_used_at not updated", e?.message));

  await record(request, endpoint, 200, { id: decision.row.id, organization_id: decision.row.organization_id });
  return { ok: true, auth: { key: decision.row, orgId: decision.row.organization_id } };
}

/**
 * Everybody whose production belongs to this agency.
 *
 * Membership is the record and the profile copy is the fallback, which is the
 * same pair `my_org_ids()` and `getMyOrgIds` reconcile — stated here from the
 * other direction because this asks "who is in that org" rather than "which
 * orgs am I in", and there is no `auth.uid()` to ask it about.
 */
export async function orgMemberIds(orgId: string): Promise<string[]> {
  const [{ data: members }, { data: byColumn }] = await Promise.all([
    supabaseAdmin
      .from("organization_memberships")
      .select("profile_id")
      .eq("organization_id", orgId)
      .eq("status", "active"),
    supabaseAdmin
      .from("profiles")
      .select("id, status")
      .eq("organization_id", orgId),
  ]);

  const ids = new Set<string>();
  for (const m of (members ?? []) as any[]) if (m.profile_id) ids.add(String(m.profile_id));
  for (const p of (byColumn ?? []) as any[]) {
    if (["inactive", "terminated", "invited"].includes(String(p.status))) continue;
    ids.add(String(p.id));
  }
  return [...ids];
}
