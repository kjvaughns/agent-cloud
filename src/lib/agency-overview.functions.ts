import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId } from "@/lib/org-guard";

const supabaseAdmin = _admin as any;
type Ctx = { supabase: any; userId: string };

/**
 * The people side of running an agency, in numbers.
 *
 * One count per destination in the Agency hub, so the overview says something
 * before you click rather than being a menu wearing a dashboard's clothes.
 * Every number is a link to the page that acts on it.
 *
 * Counts only. Anything needing a chart belongs in Reports, which is its own
 * hub for exactly that reason.
 */

export const getAgencyPeopleOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return null;

    const { data: members } = await supabaseAdmin
      .from("organization_memberships")
      .select("profile_id")
      .eq("organization_id", orgId)
      .eq("status", "active");
    const ids = (members ?? []).map((m: any) => m.profile_id);

    const today = new Date().toISOString().slice(0, 10);

    const [
      { data: profiles }, { data: licences }, { data: docs }, { data: requests },
      { data: invites }, { data: retention }, { data: challenges },
    ] = await Promise.all([
      ids.length
        ? supabaseAdmin.from("profiles")
            .select("id, status, npn_number, date_of_birth, ssn_last4, street_address, city, state, zip_code")
            .in("id", ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabaseAdmin.from("state_licenses").select("agent_id, expires_date").in("agent_id", ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabaseAdmin.from("producer_documents")
            .select("agent_id, doc_type, review_status, expiration_date").in("agent_id", ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabaseAdmin.from("contracting_requests").select("agent_id, status").in("agent_id", ids)
        : Promise.resolve({ data: [] }),
      supabaseAdmin.from("invitation_links")
        .select("id, status").eq("organization_id", orgId)
        .in("status", ["pending", "in_progress", "in_surelc"]),
      supabaseAdmin.from("retention_cases")
        .select("id").eq("organization_id", orgId).in("status", ["open", "working"]),
      supabaseAdmin.from("challenges")
        .select("id, end_date, completed").eq("organization_id", orgId),
    ]);

    // Ready to sell, defined the same way the onboarding checklist defines it,
    // so the hub and the checklist cannot disagree about who is still waiting.
    const has = <T extends { agent_id: string }>(rows: T[] | null, pred: (r: T) => boolean) => {
      const s = new Set<string>();
      for (const r of rows ?? []) if (pred(r)) s.add(r.agent_id);
      return s;
    };

    const licensed = has(licences, (l: any) => !l.expires_date || l.expires_date >= today);
    const eoOk = has(docs, (d: any) =>
      ["eo", "eo_certificate"].includes(d.doc_type) && d.review_status === "approved" &&
      (!d.expiration_date || d.expiration_date >= today));
    const contracted = has(requests, (r: any) =>
      ["approved", "writing_number_issued"].includes(r.status));

    let ready = 0;
    let notReady = 0;
    for (const p of (profiles ?? []) as any[]) {
      const identity = Boolean(
        p.npn_number && p.date_of_birth && p.ssn_last4 &&
        p.street_address && p.city && p.state && p.zip_code);
      const done = p.status === "active" && identity &&
        licensed.has(p.id) && eoOk.has(p.id) && contracted.has(p.id);
      if (done) ready += 1; else notReady += 1;
    }

    // Still running: not finished, and not past its end date.
    const activeChallenges = (challenges ?? []).filter(
      (c: any) => !c.completed && (!c.end_date || c.end_date >= today)).length;

    return {
      team: ids.length,
      ready,
      onboarding: notReady,
      invites: (invites ?? []).length,
      retention: (retention ?? []).length,
      challenges: activeChallenges,
    };
  });
